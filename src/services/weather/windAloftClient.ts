import type { BranchWind, NavBranch, NavPoint, NavRoute } from '../../domain/navigation.types';
import { apiPath } from '../../config/apiBaseUrl';
import { averageWind } from './windMath';

const CACHE_PREFIX = 'capclair.weather.windAloft.v13_5.meteofranceStrict.';
const CACHE_TTL_MS = 60 * 60 * 1000;

interface WindSampleRequest {
  sampleId: string;
  branchId: string;
  latitude: number;
  longitude: number;
  altitudeFt: number;
  timeIso: string;
}

interface WindSampleResponse extends BranchWind {
  sampleId: string;
  branchId: string;
  normalizedKey: string;
}

interface WindAloftResponse {
  source: 'open-meteo' | 'open-meteo-meteofrance' | 'open-meteo-meteofrance-strict';
  generatedAt: string;
  samples: WindSampleResponse[];
  errors?: Array<{ key: string; reasons: string[] }>;
  cacheRuntime?: string;
  mode?: string;
}

function pointById(points: NavPoint[], id: string): NavPoint {
  const point = points.find((item) => item.id === id);
  if (!point) throw new Error(`missing point ${id}`);
  return point;
}

function interpolatePoint(from: NavPoint, to: NavPoint, fraction: number) {
  return {
    latitude: from.latitude + (to.latitude - from.latitude) * fraction,
    longitude: from.longitude + (to.longitude - from.longitude) * fraction
  };
}

function normalizedCacheKey(sample: WindSampleRequest): string {
  const date = new Date(sample.timeIso);
  date.setUTCMinutes(0, 0, 0);
  const lat = (Math.round(sample.latitude * 10) / 10).toFixed(1);
  const lon = (Math.round(sample.longitude * 10) / 10).toFixed(1);
  const alt = Math.round(sample.altitudeFt / 500) * 500;
  return `${date.toISOString().slice(0, 13)}Z:${lat}:${lon}:${alt}`;
}

function readCache(sample: WindSampleRequest): WindSampleResponse | null {
  try {
    const raw = window.localStorage.getItem(CACHE_PREFIX + normalizedCacheKey(sample));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { savedAt: number; data: WindSampleResponse };
    if (Date.now() - parsed.savedAt > CACHE_TTL_MS) {
      window.localStorage.removeItem(CACHE_PREFIX + normalizedCacheKey(sample));
      return null;
    }
    return {
      ...parsed.data,
      cache: 'browser',
      auditSamples: (parsed.data.auditSamples ?? []).map((sample) => ({ ...sample, cache: 'browser' }))
    };
  } catch {
    return null;
  }
}

function writeCache(sample: WindSampleRequest, data: WindSampleResponse): void {
  try {
    window.localStorage.setItem(CACHE_PREFIX + normalizedCacheKey(sample), JSON.stringify({ savedAt: Date.now(), data }));
  } catch {
    // best effort
  }
}

function buildSamplesForBranch(route: NavRoute, branch: NavBranch, analysisTimeIso: string): WindSampleRequest[] {
  const from = pointById(route.points, branch.from);
  const to = pointById(route.points, branch.to);
  const fractions = branch.distanceNm > 50 ? [0.25, 0.5, 0.75] : [0.5];

  return fractions.map((fraction) => {
    const point = interpolatePoint(from, to, fraction);
    return {
      sampleId: `${branch.id}:${fraction}`,
      branchId: branch.id,
      latitude: Number(point.latitude.toFixed(4)),
      longitude: Number(point.longitude.toFixed(4)),
      altitudeFt: branch.altitudeFt,
      timeIso: analysisTimeIso
    };
  });
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function requestWindSamples(samples: WindSampleRequest[]): Promise<WindSampleResponse[]> {
  if (!samples.length) return [];

  const response = await fetch(apiPath('/api/weather/wind-aloft'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ samples })
  });

  if (!response.ok) {
    throw new Error(`wind aloft proxy ${response.status}`);
  }

  const data = (await response.json()) as WindAloftResponse;
  const fetched = data.samples ?? [];
  return fetched;
}

export async function fetchWindAloftForRoute(route: NavRoute, analysisTimeIso = new Date().toISOString()): Promise<Record<string, BranchWind>> {
  const samples = route.branches.flatMap((branch) => buildSamplesForBranch(route, branch, analysisTimeIso));
  const cachedSamples: WindSampleResponse[] = [];
  const missingSamples: WindSampleRequest[] = [];

  for (const sample of samples) {
    const cached = readCache(sample);
    if (cached) {
      cachedSamples.push(cached);
    } else {
      missingSamples.push(sample);
    }
  }

  let fetchedSamples: WindSampleResponse[] = [];

  if (missingSamples.length) {
    fetchedSamples = await requestWindSamples(missingSamples);

    const fetchedIds = new Set(fetchedSamples.map((sample) => sample.sampleId));
    const firstRetrySamples = missingSamples.filter((sample) => !fetchedIds.has(sample.sampleId));

    if (firstRetrySamples.length) {
      await wait(850);
      fetchedSamples = [...fetchedSamples, ...(await requestWindSamples(firstRetrySamples))];

      const retryIds = new Set(fetchedSamples.map((sample) => sample.sampleId));
      const secondRetrySamples = missingSamples.filter((sample) => !retryIds.has(sample.sampleId));

      if (secondRetrySamples.length) {
        await wait(1250);
        fetchedSamples = [...fetchedSamples, ...(await requestWindSamples(secondRetrySamples))];
      }
    }

    for (const sample of missingSamples) {
      const found = fetchedSamples.find((item) => item.sampleId === sample.sampleId);
      if (found) writeCache(sample, found);
    }
  }

  const byBranch = new Map<string, BranchWind[]>();
  for (const sample of [...cachedSamples, ...fetchedSamples]) {
    const current = byBranch.get(sample.branchId) ?? [];
    current.push(sample);
    byBranch.set(sample.branchId, current);
  }

  const result: Record<string, BranchWind> = {};
  for (const [branchId, winds] of byBranch) {
    const averaged = averageWind(winds);
    if (averaged) result[branchId] = averaged;
  }

  return result;
}

export function clearWindAloftCache(): void {
  try {
    for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
      const key = window.localStorage.key(index);
      if (key?.startsWith(CACHE_PREFIX)) window.localStorage.removeItem(key);
    }
  } catch {
    // best effort
  }
}
