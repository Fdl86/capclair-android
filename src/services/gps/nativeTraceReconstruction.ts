import type { GpsPosition, GpsTraceDiagnostics } from '../../domain/gps.types';
import { bearingDeg } from '../geo/bearing';
import { distanceNm } from '../geo/distance';
import {
  classifyGpsPosition,
  isPlausibleGpsPosition,
  isReliableGpsAltitude
} from './geolocationService';

export const TRACE_SAMPLE_INTERVAL_MS = 3000;
export const TRACE_MAX_POINTS = 50000;
export const MAX_CONSECUTIVE_TRACE_REJECTIONS = 5;
export const STATIONARY_SPEED_KT_THRESHOLD = 2;
export const STATIONARY_DRIFT_RADIUS_M = 20;
export const STATIONARY_KEEPALIVE_MS = 9000;
export const MIN_TRACK_SPEED_KT = 8;
export const MIN_TRACK_DISTANCE_M = 20;
export const GPS_RESUME_AFTER_GAP_MS = 12_000;

export interface NativeTraceReconstructionResult {
  positions: GpsPosition[];
  diagnostics: GpsTraceDiagnostics;
  segmentStartIndices: number[];
  distanceNm: number;
}

function createDiagnostics(maxTraceSpeedKt: number): GpsTraceDiagnostics {
  return {
    rawReceived: 0,
    rejectedPrecision: 0,
    rejectedRedundant: 0,
    rejectedSpeed: 0,
    rejectedDrift: 0,
    forcedResync: 0,
    tracePoints: 0,
    gpsGaps: 0,
    gpsResumptions: 0,
    missingAltitude: 0,
    unreliableAltitude: 0,
    maxTraceSpeedKt
  };
}

function pointKey(position: GpsPosition): string {
  return `${position.timestamp}:${position.latitude.toFixed(7)}:${position.longitude.toFixed(7)}`;
}

export function createStationaryKeepalive(anchor: GpsPosition, current: GpsPosition): GpsPosition {
  return {
    ...current,
    latitude: anchor.latitude,
    longitude: anchor.longitude,
    vitesse: 0,
    track: anchor.track ?? current.track
  };
}

/**
 * Rebuilds a saved trace from the complete native JSONL journal.
 *
 * The native journal is the source of truth. Points are sorted and deduplicated
 * before the same safety filters and 3-second sampling policy used by live
 * tracking are applied. Stationary phases keep a stable timestamped anchor every
 * nine seconds so check-lists and engine checks remain present in Replay without
 * drawing GPS drift around the parking area.
 */
export function reconstructNativeTrace(
  rawPositions: GpsPosition[],
  maxTraceSpeedKt: number
): NativeTraceReconstructionResult {
  const diagnostics = createDiagnostics(maxTraceSpeedKt);
  const ordered = [...rawPositions]
    .filter((position) => Number.isFinite(position.timestamp))
    .sort((left, right) => left.timestamp - right.timestamp);

  const unique: GpsPosition[] = [];
  const seen = new Set<string>();
  for (const position of ordered) {
    const key = pointKey(position);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(position);
  }

  const positions: GpsPosition[] = [];
  const segmentStartIndices: number[] = [];
  let lastTraceSample: GpsPosition | null = null;
  let lastTraceSampleAt: number | null = null;
  let lastAcceptedLive: GpsPosition | null = null;
  let previousRawTimestamp: number | null = null;
  let rejectionStreak = 0;
  let groundAnchor: GpsPosition | null = null;
  let pendingSegmentBreak = false;
  let distanceTotalNm = 0;

  const append = (position: GpsPosition, force = false): boolean => {
    const shouldSample = force
      || lastTraceSampleAt === null
      || position.timestamp - lastTraceSampleAt >= TRACE_SAMPLE_INTERVAL_MS;
    if (!shouldSample || positions.length >= TRACE_MAX_POINTS) return false;

    if (pendingSegmentBreak && positions.length > 0) {
      segmentStartIndices.push(positions.length);
      pendingSegmentBreak = false;
    }

    const previous = positions.at(-1);
    const startsSegment = segmentStartIndices.at(-1) === positions.length;
    if (previous && !startsSegment) distanceTotalNm += distanceNm(previous, position);

    positions.push(position);
    lastTraceSample = position;
    lastTraceSampleAt = position.timestamp;
    diagnostics.tracePoints += 1;
    return true;
  };

  for (const rawPosition of unique) {
    diagnostics.rawReceived += 1;

    if (previousRawTimestamp !== null && rawPosition.timestamp - previousRawTimestamp > GPS_RESUME_AFTER_GAP_MS) {
      diagnostics.gpsGaps += 1;
      diagnostics.gpsResumptions += 1;
      pendingSegmentBreak = positions.length > 0;
      groundAnchor = null;
      rejectionStreak = 0;
    }
    previousRawTimestamp = rawPosition.timestamp;

    if (rawPosition.altitude === null) diagnostics.missingAltitude += 1;
    else if (!isReliableGpsAltitude(rawPosition)) diagnostics.unreliableAltitude += 1;

    if (!isPlausibleGpsPosition(rawPosition)) {
      diagnostics.rejectedPrecision += 1;
      continue;
    }

    let position = rawPosition;
    const hasReliableTrack = typeof position.track === 'number'
      && Number.isFinite(position.track)
      && typeof position.vitesse === 'number'
      && position.vitesse >= MIN_TRACK_SPEED_KT;

    if (!hasReliableTrack && lastAcceptedLive) {
      const movedM = distanceNm(lastAcceptedLive, position) * 1852;
      const hasMotion = movedM >= MIN_TRACK_DISTANCE_M
        || (typeof position.vitesse === 'number' && position.vitesse >= MIN_TRACK_SPEED_KT);
      if (!hasMotion && lastAcceptedLive.track !== null) {
        position = { ...position, track: lastAcceptedLive.track };
      } else if (hasMotion) {
        position = { ...position, track: bearingDeg(lastAcceptedLive, position) };
      }
    }

    const reason = classifyGpsPosition(position, lastTraceSample, maxTraceSpeedKt);
    if (reason === null) {
      const isLowReportedSpeed = position.vitesse !== null && position.vitesse < STATIONARY_SPEED_KT_THRESHOLD;
      if (isLowReportedSpeed && groundAnchor) {
        const driftM = distanceNm(groundAnchor, position) * 1852;
        if (driftM <= STATIONARY_DRIFT_RADIUS_M) {
          lastAcceptedLive = position;
          const keepaliveDue = lastTraceSampleAt === null
            || position.timestamp - lastTraceSampleAt >= STATIONARY_KEEPALIVE_MS;
          if (keepaliveDue) append(createStationaryKeepalive(groundAnchor, position), true);
          else diagnostics.rejectedDrift += 1;
          continue;
        }
      }

      rejectionStreak = 0;
      groundAnchor = isLowReportedSpeed ? position : null;
      lastAcceptedLive = position;
      append(position);
      continue;
    }

    if (reason === 'redundant') {
      diagnostics.rejectedRedundant += 1;
      lastAcceptedLive = position;
      continue;
    }

    if (reason === 'speed') {
      diagnostics.rejectedSpeed += 1;
      if (lastTraceSample) {
        rejectionStreak += 1;
        if (rejectionStreak >= MAX_CONSECUTIVE_TRACE_REJECTIONS) {
          rejectionStreak = 0;
          groundAnchor = null;
          lastAcceptedLive = position;
          if (append(position, true)) diagnostics.forcedResync += 1;
        }
      }
    }
  }

  // Preserve the most recent accepted fix even when it was intentionally not
  // sampled because it was redundant or less than 3 seconds after the previous
  // trace point. Rejected outliers never become lastAcceptedLive.
  if (
    lastAcceptedLive
    && positions.length < TRACE_MAX_POINTS
    && positions.at(-1)?.timestamp !== lastAcceptedLive.timestamp
  ) {
    const endpoint = groundAnchor
      && lastAcceptedLive.vitesse !== null
      && lastAcceptedLive.vitesse < STATIONARY_SPEED_KT_THRESHOLD
      && distanceNm(groundAnchor, lastAcceptedLive) * 1852 <= STATIONARY_DRIFT_RADIUS_M
      ? createStationaryKeepalive(groundAnchor, lastAcceptedLive)
      : lastAcceptedLive;
    append(endpoint, true);
  }

  return {
    positions,
    diagnostics,
    segmentStartIndices,
    distanceNm: Number(distanceTotalNm.toFixed(6))
  };
}
