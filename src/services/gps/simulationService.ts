import type { GpsPosition } from '../../domain/gps.types';
import type { NavPoint } from '../../domain/navigation.types';
import { bearingDeg } from '../geo/bearing';

const SIMULATION_STEPS_PER_SEGMENT = 18;

export function simulationTotalSteps(routePoints: NavPoint[]): number {
  return Math.max(1, routePoints.length - 1) * SIMULATION_STEPS_PER_SEGMENT;
}

export function interpolateSimulationPoint(routePoints: NavPoint[], step: number): GpsPosition {
  const segmentCount = Math.max(1, routePoints.length - 1);
  const totalSteps = segmentCount * SIMULATION_STEPS_PER_SEGMENT;
  const safeStep = Math.max(0, Math.min(step, totalSteps));
  const normalized = safeStep / SIMULATION_STEPS_PER_SEGMENT;
  const segmentIndex = Math.min(segmentCount - 1, Math.floor(normalized));
  const localT = Math.min(1, normalized - segmentIndex);
  const start = routePoints[segmentIndex];
  const end = routePoints[segmentIndex + 1];
  const finalPoint = safeStep >= totalSteps;
  const offset = finalPoint ? 0 : Math.sin(safeStep / 5) * 0.018;

  return {
    latitude: start.latitude + (end.latitude - start.latitude) * localT + offset,
    longitude: start.longitude + (end.longitude - start.longitude) * localT - offset * 0.5,
    altitude: 1050 + Math.sin(safeStep / 4) * 40,
    altitudeAccuracy: 10,
    vitesse: finalPoint ? 0 : 102 + Math.sin(safeStep / 6) * 3,
    track: bearingDeg(start, end),
    timestamp: Date.now(),
    precision: 18
  };
}
