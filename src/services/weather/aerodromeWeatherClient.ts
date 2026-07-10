import type { AerodromeWeather, AerodromeWeatherRequestItem } from '../../domain/weather.types';
import { apiPath } from '../../config/apiBaseUrl';

const CACHE_PREFIX = 'capclair.weather.metarTaf.v3.nearest.';
const CACHE_TTL_MS = 5 * 60 * 1000;

interface WeatherResponse {
  generatedAt: string;
  reports: AerodromeWeather[];
}

function normalizeItems(items: AerodromeWeatherRequestItem[]) {
  return items
    .filter((item) => /^[A-Z0-9]{4}$/.test(item.icao))
    .map((item) => ({
      ...item,
      icao: item.icao.trim().toUpperCase(),
      candidates: item.candidates
        .map((candidate) => ({
          icao: candidate.icao.trim().toUpperCase(),
          distanceKm: Number(candidate.distanceKm.toFixed(1))
        }))
        .filter((candidate) => /^[A-Z0-9]{4}$/.test(candidate.icao))
        .slice(0, 16)
    }));
}

function cacheKey(items: AerodromeWeatherRequestItem[]) {
  const parts = normalizeItems(items).map((item) => `${item.icao}:${item.candidates.map((candidate) => candidate.icao).join('-')}`);
  return CACHE_PREFIX + parts.join(',');
}

function readCache(items: AerodromeWeatherRequestItem[]): WeatherResponse | null {
  try {
    const raw = window.localStorage.getItem(cacheKey(items));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { savedAt: number; data: WeatherResponse };
    if (Date.now() - parsed.savedAt > CACHE_TTL_MS) {
      window.localStorage.removeItem(cacheKey(items));
      return null;
    }
    return parsed.data;
  } catch {
    return null;
  }
}

function writeCache(items: AerodromeWeatherRequestItem[], data: WeatherResponse) {
  try {
    window.localStorage.setItem(cacheKey(items), JSON.stringify({ savedAt: Date.now(), data }));
  } catch {
    // best effort
  }
}

export async function fetchAerodromeWeather(items: AerodromeWeatherRequestItem[], force = false): Promise<WeatherResponse> {
  const payloadItems = normalizeItems(items);
  if (!payloadItems.length) return { generatedAt: new Date().toISOString(), reports: [] };

  if (!force) {
    const cached = readCache(payloadItems);
    if (cached) return cached;
  }

  const response = await fetch(apiPath('/api/weather/metar-taf'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ items: payloadItems })
  });

  if (!response.ok) {
    throw new Error(`metar taf proxy ${response.status}`);
  }

  const data = (await response.json()) as WeatherResponse;
  writeCache(payloadItems, data);
  return data;
}
