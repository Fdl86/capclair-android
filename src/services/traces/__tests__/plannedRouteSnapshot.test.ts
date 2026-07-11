import { describe, expect, it } from 'vitest';
import type { NavRoute } from '../../../domain/navigation.types';
import { createPlannedRouteSnapshot } from '../plannedRouteSnapshot';

const route: NavRoute = {
  id: 'route-1',
  nom: 'LFBI - LFOU',
  points: [
    { id: 'a', nom: 'Poitiers', code: 'LFBI', type: 'depart', latitude: 46.58, longitude: 0.30 },
    { id: 'b', nom: 'Cholet', code: 'LFOU', type: 'destination', latitude: 47.08, longitude: -0.88 }
  ],
  branches: [],
  distanceTotale: 0,
  tempsEstimeMin: 0,
  vitesseSolKt: 0,
  profile: { tasKt: 90, defaultAltitudeFt: 2500, departureTimeIso: '2026-07-11T10:00:00.000Z' },
  branchAltitudeById: {},
  branchWindById: {},
  dateModification: '2026-07-11T10:00:00.000Z'
};

describe('createPlannedRouteSnapshot', () => {
  it('creates an immutable minimal route representation', () => {
    const snapshot = createPlannedRouteSnapshot(route, new Date('2026-07-11T10:00:00.000Z'));
    expect(snapshot?.routeId).toBe('route-1');
    expect(snapshot?.points).toHaveLength(2);
    expect(snapshot?.capturedAt).toBe('2026-07-11T10:00:00.000Z');
    expect(snapshot?.points[0]).not.toHaveProperty('elevationFt');
  });

  it('does not create a snapshot for an incomplete route', () => {
    expect(createPlannedRouteSnapshot({ ...route, points: route.points.slice(0, 1) })).toBeUndefined();
  });
});
