import type { ReplayModel } from '../../domain/replay.types';
import type { TerrainProfileData, TerrainProfilePoint } from '../../domain/terrain.types';

const OPEN_METEO_ELEVATION_URL = 'https://api.open-meteo.com/v1/elevation';
const METERS_TO_FEET = 3.280839895;
const MAX_SAMPLE_POINTS = 180;
const API_BATCH_SIZE = 100;
const CACHE_PREFIX = 'capclair.replayTerrain.v1.';

interface ElevationApiResponse {
  elevation?: unknown;
  error?: boolean;
  reason?: string;
}

export interface TerrainSampleLocation {
  distanceNm: number;
  latitude: number;
  longitude: number;
}

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function finiteCoordinate(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function fnv1a(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function terrainCacheKey(traceId: string): string {
  return `${CACHE_PREFIX}${traceId}`;
}

export function buildTerrainFingerprint(traceId: string, model: ReplayModel): string {
  const first = model.points[0]?.position;
  const last = model.points.at(-1)?.position;
  const signature = [
    traceId,
    model.points.length,
    round(model.totalDistanceNm, 4),
    first ? round(first.latitude, 5) : '',
    first ? round(first.longitude, 5) : '',
    last ? round(last.latitude, 5) : '',
    last ? round(last.longitude, 5) : '',
  ].join('|');
  return fnv1a(signature);
}

export function buildTerrainSampleLocations(
  model: ReplayModel,
  maxPoints = MAX_SAMPLE_POINTS,
): TerrainSampleLocation[] {
  if (model.points.length === 0) return [];
  const valid = model.points.filter((point) =>
    finiteCoordinate(point.position.latitude)
    && finiteCoordinate(point.position.longitude)
  );
  if (valid.length === 0) return [];

  const safeMax = Math.max(2, Math.floor(maxPoints));
  if (valid.length <= safeMax) {
    return valid.map((point) => ({
      distanceNm: point.cumulativeDistanceNm,
      latitude: point.position.latitude,
      longitude: point.position.longitude,
    }));
  }

  const totalDistance = Math.max(0, model.totalDistanceNm);
  if (totalDistance <= 0) {
    const step = (valid.length - 1) / (safeMax - 1);
    return Array.from({ length: safeMax }, (_, index) => {
      const point = valid[Math.min(valid.length - 1, Math.round(index * step))];
      return {
        distanceNm: point.cumulativeDistanceNm,
        latitude: point.position.latitude,
        longitude: point.position.longitude,
      };
    });
  }

  const selected: TerrainSampleLocation[] = [];
  let cursor = 0;
  for (let sampleIndex = 0; sampleIndex < safeMax; sampleIndex += 1) {
    const targetDistance = (sampleIndex / (safeMax - 1)) * totalDistance;
    while (
      cursor < valid.length - 1
      && valid[cursor + 1].cumulativeDistanceNm <= targetDistance
    ) {
      cursor += 1;
    }
    const current = valid[cursor];
    const next = valid[Math.min(valid.length - 1, cursor + 1)];
    const chosen = Math.abs(current.cumulativeDistanceNm - targetDistance)
      <= Math.abs(next.cumulativeDistanceNm - targetDistance)
      ? current
      : next;
    const previous = selected.at(-1);
    if (
      previous
      && previous.distanceNm === chosen.cumulativeDistanceNm
      && previous.latitude === chosen.position.latitude
      && previous.longitude === chosen.position.longitude
    ) {
      continue;
    }
    selected.push({
      distanceNm: chosen.cumulativeDistanceNm,
      latitude: chosen.position.latitude,
      longitude: chosen.position.longitude,
    });
  }

  const lastPoint = valid.at(-1)!;
  const lastSelected = selected.at(-1);
  if (!lastSelected || lastSelected.distanceNm !== lastPoint.cumulativeDistanceNm) {
    selected.push({
      distanceNm: lastPoint.cumulativeDistanceNm,
      latitude: lastPoint.position.latitude,
      longitude: lastPoint.position.longitude,
    });
  }
  return selected;
}

async function fetchElevationBatch(
  locations: TerrainSampleLocation[],
  signal: AbortSignal | undefined,
  fetchImpl: FetchLike,
): Promise<number[]> {
  const latitude = locations.map((point) => point.latitude.toFixed(5)).join(',');
  const longitude = locations.map((point) => point.longitude.toFixed(5)).join(',');
  const url = `${OPEN_METEO_ELEVATION_URL}?latitude=${encodeURIComponent(latitude)}&longitude=${encodeURIComponent(longitude)}`;
  const response = await fetchImpl(url, { signal, cache: 'no-store' });
  const payload = await response.json() as ElevationApiResponse;
  if (!response.ok || payload.error) {
    throw new Error(payload.reason || `Service relief indisponible (${response.status}).`);
  }
  if (!Array.isArray(payload.elevation) || payload.elevation.length !== locations.length) {
    throw new Error('Réponse relief incomplète.');
  }
  return payload.elevation.map((value) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new Error('Altitude terrain invalide dans la réponse.');
    }
    return value;
  });
}

export async function fetchTerrainProfile(
  traceId: string,
  fingerprint: string,
  model: ReplayModel,
  options: { signal?: AbortSignal; fetchImpl?: FetchLike } = {},
): Promise<TerrainProfileData> {
  const locations = buildTerrainSampleLocations(model);
  if (locations.length < 2) {
    throw new Error('Trace insuffisante pour calculer le relief.');
  }
  const fetchImpl = options.fetchImpl ?? fetch;
  const elevationsM: number[] = [];
  for (let start = 0; start < locations.length; start += API_BATCH_SIZE) {
    const batch = locations.slice(start, start + API_BATCH_SIZE);
    elevationsM.push(...await fetchElevationBatch(batch, options.signal, fetchImpl));
  }
  const points: TerrainProfilePoint[] = locations.map((location, index) => ({
    ...location,
    elevationFt: round(elevationsM[index] * METERS_TO_FEET, 1),
  }));
  return {
    schemaVersion: 1,
    traceId,
    fingerprint,
    generatedAt: new Date().toISOString(),
    source: 'open-meteo-copernicus-glo90',
    resolutionM: 90,
    points,
  };
}

export function interpolateTerrainElevation(
  profile: TerrainProfileData | null,
  distanceNm: number,
): number | null {
  const points = profile?.points ?? [];
  if (points.length === 0 || !Number.isFinite(distanceNm)) return null;
  if (distanceNm <= points[0].distanceNm) return points[0].elevationFt;
  const last = points.at(-1)!;
  if (distanceNm >= last.distanceNm) return last.elevationFt;

  let low = 0;
  let high = points.length - 1;
  while (low + 1 < high) {
    const mid = Math.floor((low + high) / 2);
    if (points[mid].distanceNm <= distanceNm) low = mid;
    else high = mid;
  }
  const left = points[low];
  const right = points[high];
  const span = right.distanceNm - left.distanceNm;
  if (span <= 0) return left.elevationFt;
  const ratio = (distanceNm - left.distanceNm) / span;
  return left.elevationFt + (right.elevationFt - left.elevationFt) * ratio;
}

function isTerrainProfileData(value: unknown): value is TerrainProfileData {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<TerrainProfileData>;
  return candidate.schemaVersion === 1
    && typeof candidate.traceId === 'string'
    && typeof candidate.fingerprint === 'string'
    && Array.isArray(candidate.points)
    && candidate.points.length >= 2
    && candidate.points.every((point) =>
      point
      && typeof point.distanceNm === 'number'
      && typeof point.elevationFt === 'number'
      && typeof point.latitude === 'number'
      && typeof point.longitude === 'number'
    );
}

export function loadTerrainProfileCache(
  traceId: string,
  fingerprint: string,
  storage: Pick<Storage, 'getItem' | 'removeItem'> | null = typeof localStorage === 'undefined' ? null : localStorage,
): TerrainProfileData | null {
  if (!storage) return null;
  const key = terrainCacheKey(traceId);
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!isTerrainProfileData(parsed) || parsed.fingerprint !== fingerprint) {
      storage.removeItem(key);
      return null;
    }
    return parsed;
  } catch {
    storage.removeItem(key);
    return null;
  }
}

export function saveTerrainProfileCache(
  profile: TerrainProfileData,
  storage: Pick<Storage, 'setItem'> | null = typeof localStorage === 'undefined' ? null : localStorage,
): void {
  if (!storage) return;
  try {
    storage.setItem(terrainCacheKey(profile.traceId), JSON.stringify(profile));
  } catch {
    // Le Replay reste utilisable même si le cache WebView est saturé ou indisponible.
  }
}
