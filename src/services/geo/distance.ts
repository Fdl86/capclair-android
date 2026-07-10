import type { GpsPosition } from '../../domain/gps.types';
import type { NavPoint } from '../../domain/navigation.types';

const EARTH_RADIUS_NM = 3440.065;

const toRad = (value: number) => (value * Math.PI) / 180;

export function distanceNm(a: Pick<NavPoint | GpsPosition, 'latitude' | 'longitude'>, b: Pick<NavPoint | GpsPosition, 'latitude' | 'longitude'>): number {
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);

  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon;
  return 2 * EARTH_RADIUS_NM * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function totalDistanceNm(points: Array<Pick<NavPoint | GpsPosition, 'latitude' | 'longitude'>>): number {
  return points.reduce((sum, point, index) => {
    if (index === 0) return 0;
    return sum + distanceNm(points[index - 1], point);
  }, 0);
}
