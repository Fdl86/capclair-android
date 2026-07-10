import type { GpsPosition } from '../../domain/gps.types';

const MIN_TRACK_UP_SPEED_KT = 5;
const FULL_ROTATION = Math.PI * 2;

export function closestEquivalentRotation(target: number, current: number): number {
  let adjusted = target;
  while (adjusted - current > Math.PI) adjusted -= FULL_ROTATION;
  while (adjusted - current < -Math.PI) adjusted += FULL_ROTATION;
  return adjusted;
}

export function reliableTrackDeg(position: GpsPosition | null): number | null {
  if (!position || typeof position.track !== 'number' || !Number.isFinite(position.track)) return null;
  if (typeof position.vitesse === 'number' && position.vitesse < MIN_TRACK_UP_SPEED_KT) return null;
  return ((position.track % 360) + 360) % 360;
}

export function viewRotationForTrack(trackDeg: number, currentRotation: number): number {
  return closestEquivalentRotation((-trackDeg * Math.PI) / 180, currentRotation);
}
