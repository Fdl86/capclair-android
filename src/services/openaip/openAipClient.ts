import type { NavPoint } from '../../domain/navigation.types';
import { createRouteBbox, formatBboxKey } from './routeBbox';
import type { OpenAipAirport, OpenAipAirportResponse } from './openAipTypes';

const CACHE_PREFIX = 'capclair.openaip.airports.';
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;

interface CacheEntry {
  savedAt: number;
  data: OpenAipAirportResponse;
}

function isCacheEntry(value: unknown): value is CacheEntry {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as CacheEntry;
  return typeof candidate.savedAt === 'number' && Boolean(candidate.data) && Array.isArray(candidate.data.airports);
}

function readCache(key: string): OpenAipAirportResponse | null {
  try {
    const raw = window.localStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!isCacheEntry(parsed)) return null;
    if (Date.now() - parsed.savedAt > CACHE_TTL_MS) return null;
    return { ...parsed.data, cachedAt: new Date(parsed.savedAt).toISOString() };
  } catch {
    return null;
  }
}

function writeCache(key: string, data: OpenAipAirportResponse): void {
  try {
    const entry: CacheEntry = { savedAt: Date.now(), data };
    window.localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(entry));
  } catch {
    // Cache best effort only.
  }
}

export async function fetchOpenAipAirportsForRoute(points: NavPoint[]): Promise<OpenAipAirportResponse> {
  const bbox = createRouteBbox(points);
  const cacheKey = formatBboxKey(bbox);
  const cached = readCache(cacheKey);
  if (cached) return cached;

  const query = new URLSearchParams({
    minLon: String(bbox.minLon),
    minLat: String(bbox.minLat),
    maxLon: String(bbox.maxLon),
    maxLat: String(bbox.maxLat),
    limit: '120'
  });

  const response = await fetch(`/api/openaip/airports?${query.toString()}`, {
    method: 'GET',
    headers: { Accept: 'application/json' }
  });

  if (!response.ok) {
    throw new Error(`openAIP proxy ${response.status}`);
  }

  const data = (await response.json()) as OpenAipAirportResponse;
  writeCache(cacheKey, data);
  return data;
}

export function clearOpenAipAirportCache(): void {
  try {
    for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
      const key = window.localStorage.key(index);
      if (key?.startsWith(CACHE_PREFIX)) window.localStorage.removeItem(key);
    }
  } catch {
    // Cache best effort only.
  }
}
