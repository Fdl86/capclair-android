import { describe, expect, it } from 'vitest';
import type { GpsPosition } from '../../../domain/gps.types';
import type { Trace } from '../../../domain/trace.types';
import { activeTimeForDistance, buildReplayModel, sampleReplay } from '../traceReplayModel';

function point(timestamp: number, longitude: number, patch: Partial<GpsPosition> = {}): GpsPosition {
  return {
    latitude: 46.58,
    longitude,
    altitude: 500,
    altitudeAccuracy: 8,
    vitesse: null,
    track: null,
    timestamp,
    precision: 6,
    ...patch
  };
}

function trace(positions: GpsPosition[], patch: Partial<Trace> = {}): Trace {
  return {
    id: 'trace-test',
    routeId: 'route-test',
    routeName: 'LFBI - LFOU',
    date: new Date(positions.at(-1)?.timestamp ?? 0).toISOString(),
    positions,
    dureeSec: 0,
    distanceNm: 0,
    ...patch
  };
}

describe('buildReplayModel', () => {
  it('compresses time gaps and does not count the jump distance', () => {
    const model = buildReplayModel(trace([
      point(1_000, 0.30),
      point(4_000, 0.31),
      point(30_000, 0.60),
      point(33_000, 0.61)
    ]));

    expect(model.segments).toHaveLength(2);
    expect(model.segments[1].gapBeforeMs).toBe(26_000);
    expect(model.totalActiveTimeMs).toBe(6_000);
    expect(model.totalDistanceNm).toBeCloseTo(
      model.segments[0].distanceNm + model.segments[1].distanceNm,
      8
    );
  });

  it('supports explicit segment starts without changing the source trace', () => {
    const positions = [point(1_000, 0.30), point(4_000, 0.31), point(7_000, 0.32)];
    const model = buildReplayModel(trace(positions, { segmentStartIndices: [2] }));
    expect(model.segments).toHaveLength(2);
    expect(model.points[2].segmentIndex).toBe(1);
    expect(positions[2].track).toBeNull();
  });

  it('keeps legacy altitude when accuracy is unknown and rejects inaccurate altitude', () => {
    const model = buildReplayModel(trace([
      point(1_000, 0.30, { altitude: 300, altitudeAccuracy: null }),
      point(4_000, 0.31, { altitude: 310, altitudeAccuracy: 120 })
    ]));
    expect(model.points[0].altitudeFt).toBeCloseTo(984.252, 2);
    expect(model.points[1].altitudeFt).toBeNull();
  });

  it('derives speed and track when recorded values are unavailable', () => {
    const model = buildReplayModel(trace([point(1_000, 0.30), point(4_000, 0.31)]));
    expect(model.points[1].speedKt).toBeGreaterThan(0);
    expect(model.points[1].trackDeg).not.toBeNull();
  });

  it('filters invalid coordinates without failing old traces', () => {
    const model = buildReplayModel(trace([
      point(1_000, 0.30),
      point(2_000, 0.31, { latitude: 120 }),
      point(4_000, 0.32)
    ]));
    expect(model.points).toHaveLength(2);
    expect(model.discardedPointCount).toBe(1);
  });
});

describe('Replay sampling', () => {
  it('interpolates position, altitude and distance inside a segment', () => {
    const model = buildReplayModel(trace([
      point(1_000, 0.30, { altitude: 100, vitesse: 80, track: 350 }),
      point(5_000, 0.34, { altitude: 200, vitesse: 100, track: 10 })
    ]));
    const sample = sampleReplay(model, 2_000);
    expect(sample?.position.longitude).toBeCloseTo(0.32, 6);
    expect(sample?.position.altitude).toBeCloseTo(150, 6);
    expect(sample?.speedKt).toBeCloseTo(90, 6);
    expect(sample?.trackDeg).toBeCloseTo(0, 6);
    expect(sample?.cumulativeDistanceNm).toBeCloseTo(model.totalDistanceNm / 2, 6);
  });

  it('maps profile distance back to replay time', () => {
    const model = buildReplayModel(trace([
      point(1_000, 0.30),
      point(5_000, 0.32),
      point(9_000, 0.34)
    ]));
    expect(activeTimeForDistance(model, model.totalDistanceNm / 2)).toBeCloseTo(4_000, -1);
  });
});
