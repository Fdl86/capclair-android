import type { NavPoint } from '../../domain/navigation.types';

export interface RouteBbox {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function createRouteBbox(points: NavPoint[], marginDeg = 0.35): RouteBbox {
  const lons = points.map((point) => point.longitude);
  const lats = points.map((point) => point.latitude);
  return {
    minLon: clamp(Math.min(...lons) - marginDeg, -180, 180),
    minLat: clamp(Math.min(...lats) - marginDeg, -85, 85),
    maxLon: clamp(Math.max(...lons) + marginDeg, -180, 180),
    maxLat: clamp(Math.max(...lats) + marginDeg, -85, 85)
  };
}

export function formatBboxKey(bbox: RouteBbox): string {
  return [bbox.minLon, bbox.minLat, bbox.maxLon, bbox.maxLat].map((value) => value.toFixed(2)).join(',');
}
