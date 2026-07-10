import type { GpsPosition } from '../../domain/gps.types';
import type { NavPoint } from '../../domain/navigation.types';

const toRad = (value: number) => (value * Math.PI) / 180;
const toDeg = (value: number) => (value * 180) / Math.PI;

export function bearingDeg(a: Pick<NavPoint | GpsPosition, 'latitude' | 'longitude'>, b: Pick<NavPoint | GpsPosition, 'latitude' | 'longitude'>): number {
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const dLon = toRad(b.longitude - a.longitude);

  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}
