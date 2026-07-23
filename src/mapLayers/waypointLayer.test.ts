import { describe, expect, it } from 'vitest';
import type { NavPoint } from '../domain/navigation.types';
import { createWaypointLayer } from './waypointLayer';

const points: NavPoint[] = [
  { id: 'dep', nom: 'LFBI', code: 'LFBI', type: 'depart', latitude: 46.58, longitude: 0.30 },
  { id: 'wp', nom: 'WP1', code: 'WP1', type: 'waypoint', latitude: 46.8, longitude: 0.8 },
  { id: 'arr', nom: 'LFBI', code: 'LFBI', type: 'destination', latitude: 46.5800001, longitude: 0.3000001 }
];

describe('waypoint labels', () => {
  it('uses D for departure, A for arrival and a single D/A marker for a loop', () => {
    const loopLayer = createWaypointLayer(points, null);
    const loopFeatures = loopLayer.getSource()?.getFeatures() ?? [];
    expect(loopFeatures.map((feature) => feature.get('label'))).toEqual(['D/A', '1']);

    const normalLayer = createWaypointLayer([
      points[0],
      { ...points[2], id: 'other-arr', code: 'LFOU', nom: 'LFOU', latitude: 47.06, longitude: -0.87 }
    ], null);
    const normalFeatures = normalLayer.getSource()?.getFeatures() ?? [];
    expect(normalFeatures.map((feature) => feature.get('label'))).toEqual(['D', 'A']);
  });
});
