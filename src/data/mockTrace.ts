import type { GpsPosition } from '../domain/gps.types';
import { mockPoints } from './mockRoute';

export const mockTrace: GpsPosition[] = mockPoints.map((point, index) => ({
  latitude: point.latitude + Math.sin(index + 1) * 0.025,
  longitude: point.longitude - Math.cos(index + 1) * 0.018,
  altitude: 1050 + index * 35,
  altitudeAccuracy: 12,
  vitesse: 102,
  track: null,
  timestamp: Date.now() - (mockPoints.length - index) * 60_000,
  precision: 25
}));
