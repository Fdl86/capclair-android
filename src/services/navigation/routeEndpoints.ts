import type { NavPoint } from '../../domain/navigation.types';

export function replaceDeparturePoint(points: NavPoint[], departure: NavPoint): NavPoint[] {
  if (points.length === 0) return [departure];

  if (points.length === 1) {
    const onlyPoint = points[0];
    if (onlyPoint.type === 'destination') return [departure, onlyPoint];
    return [departure];
  }

  return [departure, ...points.slice(1)];
}

export function replaceDestinationPoint(points: NavPoint[], destination: NavPoint): NavPoint[] {
  if (points.length === 0) return [destination];

  if (points.length === 1) {
    const onlyPoint = points[0];
    if (onlyPoint.type === 'depart') return [onlyPoint, destination];
    return [destination];
  }

  return [...points.slice(0, -1), destination];
}
