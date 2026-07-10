import { describe, expect, it } from 'vitest';
import { closestEquivalentRotation, reliableTrackDeg, viewRotationForTrack } from '../mapOrientation';

const position = {
  latitude: 46,
  longitude: 0,
  altitude: 500,
  altitudeAccuracy: 8,
  vitesse: 100,
  track: 301,
  timestamp: 1,
  precision: 5
};

describe('map orientation', () => {
  it('normalizes a reliable GPS track', () => {
    expect(reliableTrackDeg(position)).toBe(301);
    expect(reliableTrackDeg({ ...position, track: -10 })).toBe(350);
  });

  it('ignores a changing track at very low speed', () => {
    expect(reliableTrackDeg({ ...position, vitesse: 2 })).toBeNull();
  });

  it('uses the shortest angular path around north', () => {
    const current = (-359 * Math.PI) / 180;
    const next = viewRotationForTrack(1, current);
    expect(Math.abs(next - current)).toBeLessThan((3 * Math.PI) / 180);
    expect(closestEquivalentRotation(Math.PI * 2, 0)).toBeCloseTo(0);
  });
});
