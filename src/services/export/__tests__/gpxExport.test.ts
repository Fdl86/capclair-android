import { describe, expect, it } from 'vitest';
import type { Trace } from '../../../domain/trace.types';
import { splitTraceSegments, traceToGpx } from '../gpxExport';

function point(timestamp: number, latitude = 46, longitude = 0) {
  return {
    latitude,
    longitude,
    altitude: 300,
    altitudeAccuracy: 10,
    vitesse: 90,
    track: 180,
    timestamp,
    precision: 5
  };
}

function traceWithTimestamps(timestamps: number[]): Trace {
  return {
    schemaVersion: 2,
    id: 'trace-test',
    sessionId: 'session-test',
    routeId: 'route-test',
    routeName: 'LFBI - LFOU',
    date: new Date(timestamps.at(-1) ?? 0).toISOString(),
    startedAt: new Date(timestamps[0] ?? 0).toISOString(),
    endedAt: new Date(timestamps.at(-1) ?? 0).toISOString(),
    source: 'android-native',
    positions: timestamps.map((timestamp, index) => point(timestamp, 46 + index * 0.001)),
    dureeSec: 60,
    distanceNm: 1
  };
}

describe('GPX segmentation', () => {
  it('creates a new segment after a GPS gap', () => {
    const trace = traceWithTimestamps([0, 3000, 6000, 25000, 28000]);
    expect(splitTraceSegments(trace)).toHaveLength(2);
    expect(traceToGpx(trace).match(/<trkseg>/g)).toHaveLength(2);
  });

  it('keeps a continuous trace in one segment', () => {
    const trace = traceWithTimestamps([0, 3000, 6000, 9000]);
    expect(splitTraceSegments(trace)).toHaveLength(1);
  });
});
