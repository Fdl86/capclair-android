import { describe, expect, it } from 'vitest';
import type { NavPoint } from '../../../domain/navigation.types';
import { buildRoute, createEmptyRoute } from '../routeBuilder';

const departure: NavPoint = {
  id: 'depart-test',
  nom: 'DEP',
  code: 'DEP',
  type: 'depart',
  source: 'manual',
  latitude: 46,
  longitude: 0
};

const destination: NavPoint = {
  id: 'destination-test',
  nom: 'ARR',
  code: 'ARR',
  type: 'destination',
  source: 'manual',
  latitude: 46,
  longitude: 1
};

describe('route builder', () => {
  it('creates unique route identifiers and migrates the legacy active-route identifier', () => {
    const first = createEmptyRoute();
    const second = createEmptyRoute();
    const migrated = buildRoute([departure, destination], { routeId: 'active-route' });

    expect(first.id).not.toBe('active-route');
    expect(second.id).not.toBe(first.id);
    expect(migrated.id).not.toBe('active-route');
  });

  it('preserves an existing unique route identifier across rebuilds', () => {
    const route = buildRoute([departure, destination], { routeId: 'route-stable-test' });
    expect(route.id).toBe('route-stable-test');
  });

  it('reports a time-weighted route ground speed instead of copying TAS', () => {
    const baseline = buildRoute([departure, destination], {
      routeId: 'route-wind-test',
      profile: { tasKt: 100, defaultAltitudeFt: 2500, departureTimeIso: '2026-07-13T10:00:00.000Z' }
    });
    const branchId = baseline.branches[0].id;
    const route = buildRoute([departure, destination], {
      routeId: baseline.id,
      profile: baseline.profile,
      branchWindById: {
        [branchId]: {
          directionDeg: baseline.branches[0].routeVraie,
          speedKt: 20,
        }
      }
    });

    expect(route.branches[0].vitesseSol).toBeLessThan(route.profile.tasKt);
    expect(route.vitesseSolKt).toBeLessThan(route.profile.tasKt);
  });


  it('keeps a real ground speed below 35 kt instead of applying an optimistic floor', () => {
    const baseline = buildRoute([departure, destination], {
      routeId: 'route-low-gs-test',
      profile: { tasKt: 100, defaultAltitudeFt: 2500, departureTimeIso: '2026-07-13T10:00:00.000Z' }
    });
    const branch = baseline.branches[0];
    const route = buildRoute([departure, destination], {
      routeId: baseline.id,
      profile: baseline.profile,
      branchWindById: {
        [branch.id]: {
          directionDeg: branch.routeVraie,
          speedKt: 80
        }
      }
    });

    expect(route.branches[0].vitesseSol).toBe(20);
    expect(route.branches[0].windCalculationValid).toBe(true);
    expect(route.hasWindCalculationError).toBe(false);
  });

  it('marks a branch non calculable when headwind removes all positive ground speed', () => {
    const baseline = buildRoute([departure, destination], {
      routeId: 'route-impossible-wind-test',
      profile: { tasKt: 100, defaultAltitudeFt: 2500, departureTimeIso: '2026-07-13T10:00:00.000Z' }
    });
    const branch = baseline.branches[0];
    const route = buildRoute([departure, destination], {
      routeId: baseline.id,
      profile: baseline.profile,
      branchWindById: {
        [branch.id]: {
          directionDeg: branch.routeVraie,
          speedKt: 120
        }
      }
    });

    expect(route.branches[0].windCalculationValid).toBe(false);
    expect(route.branches[0].vitesseSol).toBe(1);
    expect(route.hasWindCalculationError).toBe(true);
    expect(route.vitesseSolKt).toBe(0);
  });

  it('keeps departure time separate from weather analysis time', () => {
    const departureTimeIso = '2026-07-13T10:00:00.000Z';
    const weatherAnalysisTimeIso = '2026-07-13T08:45:00.000Z';
    const route = buildRoute([departure, destination], {
      profile: { tasKt: 100, defaultAltitudeFt: 2500, departureTimeIso, weatherAnalysisTimeIso }
    });

    expect(route.profile.departureTimeIso).toBe(departureTimeIso);
    expect(route.profile.weatherAnalysisTimeIso).toBe(weatherAnalysisTimeIso);
  });
});
