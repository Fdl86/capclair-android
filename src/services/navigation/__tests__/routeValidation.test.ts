import { describe, expect, it } from 'vitest';
import type { NavPoint } from '../../../domain/navigation.types';
import { buildRoute } from '../routeBuilder';
import { isIncompleteLoopRoute, isLoopRoutePoints, isRouteReady, routeReadinessMessage } from '../routeValidation';

const departure: NavPoint = {
  id: 'depart-lfbi', nom: 'LFBI', code: 'LFBI', type: 'depart', source: 'aerodrome', latitude: 46.5877, longitude: 0.3067
};
const destination: NavPoint = {
  ...departure, id: 'destination-lfbi', type: 'destination'
};
const waypoint: NavPoint = {
  id: 'waypoint-1', nom: 'WP1', code: 'WP1', type: 'waypoint', source: 'manual', latitude: 46.8, longitude: 0.8
};

describe('loop route validation', () => {
  it('does not classify a single endpoint as a loop', () => {
    const route = buildRoute([departure]);
    expect(isLoopRoutePoints(route.points)).toBe(false);
    expect(isIncompleteLoopRoute(route)).toBe(false);
    expect(routeReadinessMessage(route)).toBe('Route incomplète : départ et arrivée nécessaires.');
  });

  it('identifies an incomplete same-aerodrome loop without inventing flight time', () => {
    const route = buildRoute([departure, destination]);
    expect(isLoopRoutePoints(route.points)).toBe(true);
    expect(isIncompleteLoopRoute(route)).toBe(true);
    expect(isRouteReady(route)).toBe(false);
    expect(routeReadinessMessage(route)).toMatch(/Boucle à compléter/);
    expect(route.tempsEstimeMin).toBe(0);
  });

  it('accepts a same-aerodrome loop once a distinct turning point is present', () => {
    const route = buildRoute([departure, waypoint, destination]);
    expect(isLoopRoutePoints(route.points)).toBe(true);
    expect(isIncompleteLoopRoute(route)).toBe(false);
    expect(isRouteReady(route)).toBe(true);
    expect(routeReadinessMessage(route)).toBeNull();
  });
});
