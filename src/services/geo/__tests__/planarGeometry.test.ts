import { describe, expect, it } from 'vitest';
import { polygonSegmentIntervals, segmentToSegmentDistanceNm } from '../planarGeometry';

describe('exact planar navigation geometry', () => {
  it('detects a narrow polygon crossed between former sampling positions', () => {
    const intervals = polygonSegmentIntervals(
      { latitude: 0, longitude: 0 },
      { latitude: 0, longitude: 1 },
      [[
        { latitude: -0.005, longitude: 0.30 },
        { latitude: -0.005, longitude: 0.31 },
        { latitude: 0.005, longitude: 0.31 },
        { latitude: 0.005, longitude: 0.30 }
      ]]
    );
    expect(intervals).toHaveLength(1);
    expect(intervals[0].startRatio).toBeCloseTo(0.30, 6);
    expect(intervals[0].endRatio).toBeCloseTo(0.31, 6);
  });

  it('excludes an internal hole from the crossed intervals', () => {
    const intervals = polygonSegmentIntervals(
      { latitude: 0, longitude: 0 },
      { latitude: 0, longitude: 1 },
      [
        [
          { latitude: -0.1, longitude: 0.2 },
          { latitude: -0.1, longitude: 0.8 },
          { latitude: 0.1, longitude: 0.8 },
          { latitude: 0.1, longitude: 0.2 }
        ],
        [
          { latitude: -0.05, longitude: 0.45 },
          { latitude: -0.05, longitude: 0.55 },
          { latitude: 0.05, longitude: 0.55 },
          { latitude: 0.05, longitude: 0.45 }
        ]
      ]
    );
    expect(intervals).toHaveLength(2);
    expect(intervals[0]).toEqual({ startRatio: 0.2, endRatio: 0.45 });
    expect(intervals[1]).toEqual({ startRatio: 0.55, endRatio: 0.8 });
  });

  it('returns zero distance when two route segments intersect', () => {
    expect(segmentToSegmentDistanceNm(
      { latitude: 0, longitude: 0 },
      { latitude: 0, longitude: 1 },
      { latitude: -0.1, longitude: 0.5 },
      { latitude: 0.1, longitude: 0.5 }
    )).toBe(0);
  });
});
