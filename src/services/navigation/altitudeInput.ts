const MIN_ALTITUDE_FT = 500;
const MAX_ALTITUDE_FT = 12500;

export function parseAltitudeInput(value: string): number | null {
  const normalized = value.trim().toUpperCase().replace(/\s+/g, '');
  if (!normalized) return null;

  const flightLevelMatch = normalized.match(/^FL(\d{2,3})$/);
  const rawAltitude = flightLevelMatch
    ? Number(flightLevelMatch[1]) * 100
    : /^\d{3,5}$/.test(normalized)
      ? Number(normalized)
      : Number.NaN;

  if (!Number.isFinite(rawAltitude) || rawAltitude < MIN_ALTITUDE_FT || rawAltitude > MAX_ALTITUDE_FT) {
    return null;
  }

  return Math.round(rawAltitude / 100) * 100;
}

export function formatFlightLevel(altitudeFt: number): string {
  return `FL${String(Math.round(altitudeFt / 100)).padStart(3, '0')}`;
}
