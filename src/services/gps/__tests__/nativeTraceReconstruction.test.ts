import { describe, expect, it } from 'vitest';
import type { GpsPosition } from '../../../domain/gps.types';
import { reconstructNativeTrace } from '../nativeTraceReconstruction';

function point(timestamp: number, longitude: number, overrides: Partial<GpsPosition> = {}): GpsPosition {
  return {
    latitude: 46.58,
    longitude,
    altitude: 600,
    altitudeAccuracy: 10,
    vitesse: 90,
    track: 90,
    timestamp,
    precision: 5,
    ...overrides
  };
}

describe('native trace reconstruction', () => {
  it('restores chronological coverage from an out-of-order complete native journal', () => {
    const raw = [
      point(30_000, 0.10),
      point(0, 0),
      point(3000, 0.01),
      point(6000, 0.02),
      point(9000, 0.03),
      point(12_000, 0.04),
      point(15_000, 0.05),
      point(18_000, 0.06),
      point(21_000, 0.07),
      point(24_000, 0.08),
      point(27_000, 0.09)
    ];

    const rebuilt = reconstructNativeTrace(raw, 600);

    expect(rebuilt.positions[0].timestamp).toBe(0);
    expect(rebuilt.positions.at(-1)?.timestamp).toBe(30_000);
    expect(rebuilt.positions.map((item) => item.timestamp)).toEqual(
      [...rebuilt.positions.map((item) => item.timestamp)].sort((a, b) => a - b)
    );
  });

  it('deduplicates points read both from bridge events and the journal', () => {
    const duplicate = point(3000, 0.01);
    const rebuilt = reconstructNativeTrace([
      point(0, 0),
      duplicate,
      { ...duplicate },
      point(6000, 0.02)
    ], 600);

    expect(rebuilt.diagnostics.rawReceived).toBe(3);
    expect(rebuilt.positions.map((item) => item.timestamp)).toEqual([0, 3000, 6000]);
  });

  it('does not append a rejected final speed outlier', () => {
    const rebuilt = reconstructNativeTrace([
      point(0, 0),
      point(3000, 0.001),
      point(6000, 5)
    ], 160);

    expect(rebuilt.positions.at(-1)?.longitude).toBe(0.001);
    expect(rebuilt.diagnostics.rejectedSpeed).toBe(1);
  });

  it('keeps the last valid redundant fix as the trace endpoint', () => {
    const rebuilt = reconstructNativeTrace([
      point(0, 0, { vitesse: 0 }),
      point(1000, 0.000001, { vitesse: 0 })
    ], 160);

    expect(rebuilt.positions).toHaveLength(2);
    expect(rebuilt.positions.at(-1)?.timestamp).toBe(1000);
  });
});

it('preserves long stationary checklist periods with stable keepalive points', () => {
  const raw: GpsPosition[] = [];
  for (let timestamp = 0; timestamp <= 11 * 60_000; timestamp += 1000) {
    const jitter = (timestamp / 1000 % 5) * 0.000001;
    raw.push(point(timestamp, jitter, { vitesse: 0, track: null }));
  }

  const rebuilt = reconstructNativeTrace(raw, 160);
  const timestamps = rebuilt.positions.map((item) => item.timestamp);
  const maxGap = Math.max(...timestamps.slice(1).map((timestamp, index) => timestamp - timestamps[index]));

  expect(rebuilt.positions[0]?.timestamp).toBe(0);
  expect(rebuilt.positions.at(-1)?.timestamp).toBe(11 * 60_000);
  expect(maxGap).toBeLessThanOrEqual(9000);
  expect(rebuilt.segmentStartIndices).toEqual([]);
  expect(rebuilt.distanceNm).toBeLessThan(0.01);
});

it('creates an explicit segment break for a real native callback gap', () => {
  const rebuilt = reconstructNativeTrace([
    point(0, 0),
    point(3000, 0.001),
    point(6000, 0.002),
    point(36_000, 0.004),
    point(39_000, 0.005)
  ], 600);

  expect(rebuilt.segmentStartIndices).toEqual([3]);
  expect(rebuilt.diagnostics.gpsGaps).toBe(1);
  expect(rebuilt.diagnostics.gpsResumptions).toBe(1);
});
