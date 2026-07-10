import type { GpsPosition } from '../../domain/gps.types';
import type { NavPoint } from '../../domain/navigation.types';
import { bearingDeg } from './bearing';
import { distanceNm } from './distance';

const EARTH_RADIUS_NM = 3440.065;
const toRad = (value: number) => (value * Math.PI) / 180;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

type Side = 'gauche' | 'droite' | 'sur_route';

export interface CrossTrackResult {
  distanceNm: number;
  side: Side;
  segmentIndex: number;
  alongTrackNm: number;
}

export function crossTrackForSegment(position: GpsPosition, start: NavPoint, end: NavPoint, segmentIndex: number): CrossTrackResult {
  const d13 = distanceNm(start, position) / EARTH_RADIUS_NM;
  const theta13 = toRad(bearingDeg(start, position));
  const theta12 = toRad(bearingDeg(start, end));
  const sinXt = Math.sin(d13) * Math.sin(theta13 - theta12);
  const raw = Math.asin(clamp(sinXt, -1, 1)) * EARTH_RADIUS_NM;
  const cosXt = Math.cos(raw / EARTH_RADIUS_NM);
  const cosD13 = Math.cos(d13);
  const atRatio = Math.abs(cosXt) > 1e-10 ? cosD13 / cosXt : 0;
  const alongTrack = Math.acos(clamp(atRatio, -1, 1)) * EARTH_RADIUS_NM;
  const segmentLength = distanceNm(start, end);

  let effectiveDistance = Number.isFinite(raw) ? Math.abs(raw) : Number.POSITIVE_INFINITY;
  let effectiveAlongTrack = Number.isFinite(alongTrack) ? alongTrack : 0;

  if (!Number.isFinite(effectiveDistance) || effectiveAlongTrack < 0 || effectiveAlongTrack > segmentLength || !Number.isFinite(effectiveAlongTrack)) {
    const distStart = distanceNm(position, start);
    const distEnd = distanceNm(position, end);
    const fallbackDistance = Math.min(distStart, distEnd);
    effectiveDistance = Number.isFinite(fallbackDistance) ? fallbackDistance : 0;
    effectiveAlongTrack = distStart < distEnd ? 0 : segmentLength;
  }

  const side: Side = effectiveDistance < 0.05 ? 'sur_route' : Number.isFinite(raw) && raw > 0 ? 'droite' : 'gauche';
  return {
    distanceNm: effectiveDistance,
    side,
    segmentIndex,
    alongTrackNm: effectiveAlongTrack
  };
}


function clampSegmentIndex(routePoints: NavPoint[], segmentIndex: number): number {
  return Math.max(0, Math.min(routePoints.length - 2, segmentIndex));
}

function segmentLengthNm(routePoints: NavPoint[], segmentIndex: number): number {
  const index = clampSegmentIndex(routePoints, segmentIndex);
  return distanceNm(routePoints[index], routePoints[index + 1]);
}

export function getCrossTrackErrorForSegment(position: GpsPosition | null, routePoints: NavPoint[], segmentIndex: number): CrossTrackResult {
  if (!position || routePoints.length < 2) {
    return { distanceNm: 0, side: 'sur_route', segmentIndex: 0, alongTrackNm: 0 };
  }

  const index = clampSegmentIndex(routePoints, segmentIndex);
  return crossTrackForSegment(position, routePoints[index], routePoints[index + 1], index);
}

export function getProgressiveCrossTrackError(position: GpsPosition | null, routePoints: NavPoint[], activeSegmentIndex: number | null): CrossTrackResult {
  if (!position || routePoints.length < 2) {
    return { distanceNm: 0, side: 'sur_route', segmentIndex: 0, alongTrackNm: 0 };
  }

  const nearest = getCrossTrackError(position, routePoints);
  if (activeSegmentIndex === null) return nearest;

  const currentIndex = clampSegmentIndex(routePoints, activeSegmentIndex);
  if (nearest.segmentIndex < currentIndex) {
    return getCrossTrackErrorForSegment(position, routePoints, currentIndex);
  }

  if (nearest.segmentIndex <= currentIndex + 1) {
    return nearest;
  }

  const current = getCrossTrackErrorForSegment(position, routePoints, currentIndex);
  const next = currentIndex < routePoints.length - 2
    ? getCrossTrackErrorForSegment(position, routePoints, currentIndex + 1)
    : null;

  if (!next) return current;

  const currentLength = segmentLengthNm(routePoints, currentIndex);
  const currentNearlyFinished = current.alongTrackNm >= currentLength * 0.9;
  if (currentNearlyFinished || next.distanceNm <= current.distanceNm) return next;

  return current;
}


export function getCrossTrackError(position: GpsPosition | null, routePoints: NavPoint[]): CrossTrackResult {
  if (!position || routePoints.length < 2) {
    return { distanceNm: 0, side: 'sur_route', segmentIndex: 0, alongTrackNm: 0 };
  }

  let best = crossTrackForSegment(position, routePoints[0], routePoints[1], 0);
  for (let index = 1; index < routePoints.length - 1; index += 1) {
    const current = crossTrackForSegment(position, routePoints[index], routePoints[index + 1], index);
    if (current.distanceNm < best.distanceNm) best = current;
  }
  return best;
}
