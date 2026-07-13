import { describe, expect, it } from 'vitest';
import type { NavPoint } from '../../../domain/navigation.types';
import { replaceDeparturePoint, replaceDestinationPoint } from '../routeEndpoints';

function point(id: string, type: NavPoint['type']): NavPoint {
  return {
    id,
    type,
    source: type === 'waypoint' ? 'manual' : 'aerodrome',
    code: id.toUpperCase(),
    nom: id,
    latitude: 46,
    longitude: 0,
    elevationFt: 1000
  };
}

describe('route endpoint replacement', () => {
  it('preserves all intermediate waypoints when departure changes', () => {
    const original = [
      point('dep-old', 'depart'),
      point('wpt-1', 'waypoint'),
      point('wpt-2', 'waypoint'),
      point('wpt-3', 'waypoint'),
      point('arr', 'destination')
    ];

    const result = replaceDeparturePoint(original, point('dep-new', 'depart'));

    expect(result.map((item) => item.id)).toEqual(['dep-new', 'wpt-1', 'wpt-2', 'wpt-3', 'arr']);
  });

  it('preserves all intermediate waypoints when destination changes', () => {
    const original = [
      point('dep', 'depart'),
      point('wpt-1', 'waypoint'),
      point('wpt-2', 'waypoint'),
      point('wpt-3', 'waypoint'),
      point('arr-old', 'destination')
    ];

    const result = replaceDestinationPoint(original, point('arr-new', 'destination'));

    expect(result.map((item) => item.id)).toEqual(['dep', 'wpt-1', 'wpt-2', 'wpt-3', 'arr-new']);
  });

  it('builds a two-point route when the opposite endpoint already exists', () => {
    const departure = point('dep', 'depart');
    const destination = point('arr', 'destination');

    expect(replaceDeparturePoint([destination], departure).map((item) => item.id)).toEqual(['dep', 'arr']);
    expect(replaceDestinationPoint([departure], destination).map((item) => item.id)).toEqual(['dep', 'arr']);
  });
});
