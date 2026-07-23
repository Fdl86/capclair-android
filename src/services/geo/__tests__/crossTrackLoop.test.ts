import { describe, expect, it } from 'vitest';
import type { GpsPosition } from '../../../domain/gps.types';
import type { NavPoint } from '../../../domain/navigation.types';
import { getProgressiveCrossTrackError } from '../crossTrackError';

const route: NavPoint[] = [
  { id: 'dep', nom: 'DEP', type: 'depart', latitude: 0, longitude: 0 },
  { id: 'wp1', nom: 'WP1', type: 'waypoint', latitude: 0, longitude: 1 },
  { id: 'wp2', nom: 'WP2', type: 'waypoint', latitude: 1, longitude: 1 },
  { id: 'arr', nom: 'ARR', type: 'destination', latitude: 0, longitude: 0 }
];
const position = (latitude: number, longitude: number): GpsPosition => ({
  latitude, longitude, altitude: null, altitudeAccuracy: null, vitesse: 90, track: null,
  timestamp: 1, precision: 5
});

describe('progressive tracking on a loop', () => {
  it('starts on the outbound branch and does not jump back after progressing', () => {
    const start = getProgressiveCrossTrackError(position(0, 0), route, null);
    expect(start.segmentIndex).toBe(0);
    const outbound = getProgressiveCrossTrackError(position(0, 0.8), route, start.segmentIndex);
    expect(outbound.segmentIndex).toBe(0);
    const second = getProgressiveCrossTrackError(position(0.8, 1), route, outbound.segmentIndex);
    expect(second.segmentIndex).toBe(1);
    const inbound = getProgressiveCrossTrackError(position(0.2, 0.2), route, second.segmentIndex);
    expect(inbound.segmentIndex).toBe(2);
  });
});
