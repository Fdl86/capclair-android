import type { GpsPosition } from '../../domain/gps.types';
import type { ReplayModel, ReplayPoint, ReplaySample, ReplaySegment } from '../../domain/replay.types';
import type { Trace } from '../../domain/trace.types';
import { bearingDeg } from '../geo/bearing';
import { distanceNm } from '../geo/distance';

export const REPLAY_GAP_BREAK_MS = 12_000;
const METRES_TO_FEET = 3.28084;
const MAX_REASONABLE_SPEED_KT = 500;

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function isValidPosition(position: GpsPosition): boolean {
  return Number.isFinite(position.latitude)
    && Number.isFinite(position.longitude)
    && position.latitude >= -90
    && position.latitude <= 90
    && position.longitude >= -180
    && position.longitude <= 180
    && Number.isFinite(position.timestamp);
}

function normalizeTrack(value: number | null): number | null {
  return value === null ? null : ((value % 360) + 360) % 360;
}

function altitudeFt(position: GpsPosition): number | null {
  const altitude = finiteNumber(position.altitude);
  if (altitude === null) return null;
  const accuracy = finiteNumber(position.altitudeAccuracy);
  if (accuracy !== null && accuracy > 75) return null;
  return altitude * METRES_TO_FEET;
}

function derivedSpeedKt(previous: GpsPosition | null, current: GpsPosition, sameSegment: boolean): number | null {
  if (!previous || !sameSegment) return null;
  const elapsedMs = current.timestamp - previous.timestamp;
  if (elapsedMs <= 0) return null;
  const speed = distanceNm(previous, current) / (elapsedMs / 3_600_000);
  return Number.isFinite(speed) && speed <= MAX_REASONABLE_SPEED_KT ? speed : null;
}

function recordedOrDerivedSpeed(previous: GpsPosition | null, current: GpsPosition, sameSegment: boolean): number | null {
  const recorded = finiteNumber(current.vitesse);
  if (recorded !== null && recorded >= 0 && recorded <= MAX_REASONABLE_SPEED_KT) return recorded;
  return derivedSpeedKt(previous, current, sameSegment);
}

function createSegment(index: number, pointIndex: number, activeTimeMs: number, gapBeforeMs: number): ReplaySegment {
  return {
    index,
    startPointIndex: pointIndex,
    endPointIndex: pointIndex,
    startActiveTimeMs: activeTimeMs,
    endActiveTimeMs: activeTimeMs,
    gapBeforeMs,
    distanceNm: 0
  };
}

export function buildReplayModel(trace: Trace): ReplayModel {
  const explicitStarts = new Set((trace.segmentStartIndices ?? []).filter((index) => Number.isInteger(index) && index > 0));
  const source = trace.positions ?? [];
  const valid = source
    .map((position, originalIndex) => ({ position, originalIndex }))
    .filter(({ position }) => isValidPosition(position));

  if (valid.length === 0) {
    const fallbackTime = Date.parse(trace.startedAt ?? trace.date) || Date.now();
    return {
      points: [],
      segments: [],
      totalActiveTimeMs: 0,
      totalDistanceNm: 0,
      startedAt: fallbackTime,
      endedAt: fallbackTime,
      discardedPointCount: source.length
    };
  }

  const points: ReplayPoint[] = [];
  const segments: ReplaySegment[] = [];
  let activeTimeMs = 0;
  let cumulativeDistanceNm = 0;
  let segmentIndex = 0;
  let previousPosition: GpsPosition | null = null;
  let currentSegment = createSegment(0, 0, 0, 0);
  segments.push(currentSegment);

  valid.forEach(({ position, originalIndex }, validIndex) => {
    const deltaMs = previousPosition ? position.timestamp - previousPosition.timestamp : 0;
    const breakBefore = validIndex > 0
      && (explicitStarts.has(originalIndex) || deltaMs <= 0 || deltaMs > REPLAY_GAP_BREAK_MS);

    if (breakBefore) {
      segmentIndex += 1;
      currentSegment = createSegment(segmentIndex, validIndex, activeTimeMs, Math.max(0, deltaMs));
      segments.push(currentSegment);
    } else if (validIndex > 0) {
      activeTimeMs += deltaMs;
      const legDistance = previousPosition ? distanceNm(previousPosition, position) : 0;
      if (Number.isFinite(legDistance)) {
        cumulativeDistanceNm += legDistance;
        currentSegment.distanceNm += legDistance;
      }
    }

    const sameSegment = !breakBefore && previousPosition !== null;
    const recordedTrack = normalizeTrack(finiteNumber(position.track));
    const fallbackTrack = previousPosition && sameSegment ? bearingDeg(previousPosition, position) : null;
    const speedKt = recordedOrDerivedSpeed(previousPosition, position, sameSegment);
    const trackDeg = recordedTrack ?? fallbackTrack;
    const normalizedPosition: GpsPosition = {
      ...position,
      altitude: finiteNumber(position.altitude),
      altitudeAccuracy: finiteNumber(position.altitudeAccuracy),
      precision: finiteNumber(position.precision),
      vitesse: speedKt,
      track: trackDeg
    };

    points.push({
      originalIndex,
      segmentIndex,
      timestamp: position.timestamp,
      activeTimeMs,
      cumulativeDistanceNm,
      altitudeFt: altitudeFt(position),
      speedKt,
      trackDeg,
      position: normalizedPosition
    });
    currentSegment.endPointIndex = validIndex;
    currentSegment.endActiveTimeMs = activeTimeMs;
    previousPosition = position;
  });

  return {
    points,
    segments,
    totalActiveTimeMs: activeTimeMs,
    totalDistanceNm: cumulativeDistanceNm,
    startedAt: points[0].timestamp,
    endedAt: points.at(-1)?.timestamp ?? points[0].timestamp,
    discardedPointCount: source.length - valid.length
  };
}

function interpolateNullable(a: number | null, b: number | null, ratio: number): number | null {
  if (a === null || b === null) return a ?? b;
  return a + (b - a) * ratio;
}

function interpolateTrack(a: number | null, b: number | null, ratio: number): number | null {
  if (a === null || b === null) return a ?? b;
  const delta = ((b - a + 540) % 360) - 180;
  return (a + delta * ratio + 360) % 360;
}

function floorPointIndex(model: ReplayModel, activeTimeMs: number): number {
  let low = 0;
  let high = model.points.length - 1;
  let result = 0;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (model.points[middle].activeTimeMs <= activeTimeMs) {
      result = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return result;
}

export function sampleReplay(model: ReplayModel, requestedActiveTimeMs: number): ReplaySample | null {
  if (model.points.length === 0) return null;
  const activeTimeMs = Math.max(0, Math.min(model.totalActiveTimeMs, requestedActiveTimeMs));
  const pointIndex = floorPointIndex(model, activeTimeMs);
  const current = model.points[pointIndex];
  const next = model.points[pointIndex + 1];
  const canInterpolate = next
    && next.segmentIndex === current.segmentIndex
    && next.activeTimeMs > current.activeTimeMs;
  const ratio = canInterpolate
    ? Math.max(0, Math.min(1, (activeTimeMs - current.activeTimeMs) / (next.activeTimeMs - current.activeTimeMs)))
    : 0;

  const latitude = canInterpolate ? current.position.latitude + (next.position.latitude - current.position.latitude) * ratio : current.position.latitude;
  const longitude = canInterpolate ? current.position.longitude + (next.position.longitude - current.position.longitude) * ratio : current.position.longitude;
  const altitude = canInterpolate ? interpolateNullable(current.position.altitude, next.position.altitude, ratio) : current.position.altitude;
  const altitudeAccuracy = canInterpolate ? interpolateNullable(current.position.altitudeAccuracy, next.position.altitudeAccuracy, ratio) : current.position.altitudeAccuracy;
  const speedKt = canInterpolate ? interpolateNullable(current.speedKt, next.speedKt, ratio) : current.speedKt;
  const trackDeg = canInterpolate ? interpolateTrack(current.trackDeg, next.trackDeg, ratio) : current.trackDeg;
  const timestamp = canInterpolate ? current.timestamp + (next.timestamp - current.timestamp) * ratio : current.timestamp;
  const cumulativeDistanceNm = canInterpolate
    ? current.cumulativeDistanceNm + (next.cumulativeDistanceNm - current.cumulativeDistanceNm) * ratio
    : current.cumulativeDistanceNm;
  const currentAltitudeFt = canInterpolate ? interpolateNullable(current.altitudeFt, next.altitudeFt, ratio) : current.altitudeFt;

  return {
    pointIndex,
    segmentIndex: current.segmentIndex,
    activeTimeMs,
    timestamp,
    cumulativeDistanceNm,
    altitudeFt: currentAltitudeFt,
    speedKt,
    trackDeg,
    position: {
      latitude,
      longitude,
      altitude,
      altitudeAccuracy,
      vitesse: speedKt,
      track: trackDeg,
      timestamp,
      precision: current.position.precision
    }
  };
}

export function activeTimeForDistance(model: ReplayModel, requestedDistanceNm: number): number {
  if (model.points.length === 0 || model.totalDistanceNm <= 0) return 0;
  const distance = Math.max(0, Math.min(model.totalDistanceNm, requestedDistanceNm));
  let low = 0;
  let high = model.points.length - 1;
  let result = model.points.length - 1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (model.points[middle].cumulativeDistanceNm >= distance) {
      result = middle;
      high = middle - 1;
    } else {
      low = middle + 1;
    }
  }
  const current = model.points[result];
  const previous = model.points[result - 1];
  if (!previous || current.segmentIndex !== previous.segmentIndex || current.cumulativeDistanceNm <= previous.cumulativeDistanceNm) {
    return current.activeTimeMs;
  }
  const ratio = (distance - previous.cumulativeDistanceNm) / (current.cumulativeDistanceNm - previous.cumulativeDistanceNm);
  return previous.activeTimeMs + (current.activeTimeMs - previous.activeTimeMs) * Math.max(0, Math.min(1, ratio));
}
