import { AERODROMES } from '../../data/aerodromeCatalog';

const EARTH_RADIUS_NM = 3440.065;

const toRad = (value: number) => (value * Math.PI) / 180;

function distanceNmFromLatLon(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon;
  return 2 * EARTH_RADIUS_NM * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function estimatedMagneticVariationDeg(latitude: number, longitude: number): number {
  const candidates = AERODROMES
    .filter((aerodrome) => typeof aerodrome.magneticVariationDeg === 'number')
    .map((aerodrome) => ({
      variation: aerodrome.magneticVariationDeg ?? 0,
      distance: distanceNmFromLatLon({ latitude, longitude }, aerodrome)
    }))
    .filter((candidate) => candidate.distance <= 260)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 8);

  if (!candidates.length) return 1.3;

  let weightedSum = 0;
  let weightSum = 0;

  for (const candidate of candidates) {
    const weight = 1 / Math.max(8, candidate.distance);
    weightedSum += candidate.variation * weight;
    weightSum += weight;
  }

  return Number((weightedSum / weightSum).toFixed(1));
}

export function formatMagneticVariation(value: number): string {
  const absolute = Math.abs(Math.round(value));
  if (value > 0.05) return `${absolute}E`;
  if (value < -0.05) return `${absolute}W`;
  return '0';
}
