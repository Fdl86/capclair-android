import { describe, expect, it } from 'vitest';
import type { GpsPosition } from '../../../domain/gps.types';
import { classifyGpsPosition, getMaxTraceSpeedKtForAircraft, isRecentGpsPosition } from '../geolocationService';

const base: GpsPosition = {
  latitude: 46,
  longitude: 0,
  altitude: 300,
  altitudeAccuracy: 10,
  vitesse: 90,
  track: 90,
  timestamp: 1_000_000,
  precision: 5
};

describe('GPS plausibility', () => {
  it('rejects an impossible jump', () => {
    const jump = { ...base, longitude: 1, timestamp: base.timestamp + 3000 };
    expect(classifyGpsPosition(jump, base, 145)).toBe('speed');
  });

  it('uses the C150 hard limit', () => {
    expect(getMaxTraceSpeedKtForAircraft({ id: 'c150', model: 'Cessna 150', label: 'C150', cruiseTasKt: 95 })).toBe(145);
  });

  it('reuses a recent position for map centering', () => {
    expect(isRecentGpsPosition({ ...base, timestamp: 1_000_000 }, 1_012_000)).toBe(true);
  });

  it('requests a new position when the cached fix is stale', () => {
    expect(isRecentGpsPosition({ ...base, timestamp: 1_000_000 }, 1_030_000)).toBe(false);
  });
});
