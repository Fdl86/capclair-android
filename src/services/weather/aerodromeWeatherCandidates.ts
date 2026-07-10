import { AERODROMES, findAerodrome } from '../../data/aerodromeCatalog';
import type { AerodromeWeatherRequestItem, WeatherCandidate } from '../../domain/weather.types';

const MAX_CANDIDATES = 16;
const MAX_RADIUS_KM = 80;

function toRad(value: number) {
  return (value * Math.PI) / 180;
}

export function distanceKm(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  const earthRadiusKm = 6371;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const x = Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function candidateSort(a: WeatherCandidate, b: WeatherCandidate) {
  return a.distanceKm - b.distanceKm || a.icao.localeCompare(b.icao);
}

export function buildAerodromeWeatherRequestItems(codes: string[]): AerodromeWeatherRequestItem[] {
  return [...new Set(codes.map((code) => code.trim().toUpperCase()).filter((code) => /^[A-Z0-9]{4}$/.test(code)))]
    .map((code) => {
      const aerodrome = findAerodrome(code);
      if (!aerodrome) return null;

      const candidates = AERODROMES
        .map((candidate) => ({
          icao: candidate.code,
          distanceKm: Number(distanceKm(aerodrome, candidate).toFixed(1))
        }))
        .filter((candidate) => candidate.distanceKm <= MAX_RADIUS_KM)
        .sort(candidateSort);

      const exact = { icao: aerodrome.code, distanceKm: 0 };
      const withoutDuplicateExact = candidates.filter((candidate) => candidate.icao !== aerodrome.code);
      const selected = [exact, ...withoutDuplicateExact].slice(0, MAX_CANDIDATES);

      return {
        icao: aerodrome.code,
        latitude: aerodrome.latitude,
        longitude: aerodrome.longitude,
        candidates: selected
      };
    })
    .filter(Boolean) as AerodromeWeatherRequestItem[];
}
