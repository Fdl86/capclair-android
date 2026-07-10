import { describe, expect, it } from 'vitest';
import type { GpsPosition } from '../../../domain/gps.types';
import { classifyGpsPosition, getMaxTraceSpeedKtForAircraft } from '../geolocationService';

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
});
