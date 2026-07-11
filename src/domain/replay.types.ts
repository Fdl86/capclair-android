import type { GpsPosition } from './gps.types';

export type ReplaySpeed = 1 | 5 | 10 | 20;

export interface ReplayPoint {
  originalIndex: number;
  segmentIndex: number;
  timestamp: number;
  activeTimeMs: number;
  cumulativeDistanceNm: number;
  altitudeFt: number | null;
  speedKt: number | null;
  trackDeg: number | null;
  position: GpsPosition;
}

export interface ReplaySegment {
  index: number;
  startPointIndex: number;
  endPointIndex: number;
  startActiveTimeMs: number;
  endActiveTimeMs: number;
  gapBeforeMs: number;
  distanceNm: number;
}

export interface ReplayModel {
  points: ReplayPoint[];
  segments: ReplaySegment[];
  totalActiveTimeMs: number;
  totalDistanceNm: number;
  startedAt: number;
  endedAt: number;
  discardedPointCount: number;
}

export interface ReplaySample {
  pointIndex: number;
  segmentIndex: number;
  activeTimeMs: number;
  timestamp: number;
  cumulativeDistanceNm: number;
  altitudeFt: number | null;
  speedKt: number | null;
  trackDeg: number | null;
  position: GpsPosition;
}
