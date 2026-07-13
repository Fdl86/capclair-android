import { describe, expect, it } from 'vitest';
import type { AircraftProfile, FuelPlanConfig } from '../../../domain/aircraft.types';
import type { NavBranch, NavPoint, NavRoute } from '../../../domain/navigation.types';
import { buildNavLogSnapshot, signedHeadingDifference, windAngleDeg } from '../navLogSnapshot';

const aircraft: AircraftProfile = {
  id: 'f-huge',
  label: 'Evektor',
  registration: 'F-HUGE',
  model: 'Evektor SportStar',
  cruiseTasKt: 105,
  fuelBurnLh: 18,
  usableFuelL: 120,
  unusableFuelL: 2,
  reserveMinutes: 30,
  climbSpeedKt: 70,
  climbRateFpm: 700,
  descentSpeedKt: 80,
  descentRateFpm: 500
};

const fuelConfig: FuelPlanConfig = {
  taxiDepartureMin: 8,
  arrivalMin: 12,
  alternateArrivalMin: 12,
  finalReserveMin: 30,
  marginLiters: 0
};

function point(id: string, code: string, type: NavPoint['type'], elevationFt?: number): NavPoint {
  return {
    id,
    code,
    nom: code,
    type,
    source: 'manual',
    latitude: 46,
    longitude: 0,
    elevationFt
  };
}

function branch(index: number, from: string, to: string, distance = 10.4): NavBranch {
  return {
    id: `branch-${index}`,
    from,
    to,
    distanceNm: distance,
    routeVraie: 304,
    magneticVariationDeg: 6,
    routeMagnetique: 298,
    altitudeFt: 2500,
    wind: {
      directionDeg: 8,
      speedKt: 12
    },
    derive: 6,
    capVrai: 298,
    capCorrige: 292,
    vitesseSol: 98,
    tempsSansVentMin: 6,
    tempsBrancheMin: 7,
    estimatedStartIso: '2026-07-12T08:00:00.000Z',
    estimatedMidIso: '2026-07-12T08:03:30.000Z',
    estimatedArrivalIso: '2026-07-12T08:07:00.000Z'
  };
}

function routeWithBranchCount(count: number): NavRoute {
  const points: NavPoint[] = [point('p0', 'LFBI', 'depart', 423)];
  for (let index = 1; index < count; index += 1) points.push(point(`p${index}`, `WP${index}`, 'waypoint'));
  points.push(point(`p${count}`, 'LFOO', 'destination', 104));
  const branches = Array.from({ length: count }, (_, index) => branch(index, points[index].id, points[index + 1].id, 10.5 + index));
  return {
    id: 'route-test',
    nom: 'LFBI - LFOO',
    points,
    branches,
    distanceTotale: branches.reduce((sum, item) => sum + item.distanceNm, 0),
    tempsEstimeMin: branches.reduce((sum, item) => sum + item.tempsBrancheMin, 0),
    vitesseSolKt: 98,
    profile: {
      tasKt: 105,
      defaultAltitudeFt: 2500,
      departureTimeIso: '2026-07-12T08:00:00.000Z'
    },
    branchAltitudeById: {},
    branchWindById: {},
    dateModification: '2026-07-12T07:00:00.000Z'
  };
}

describe('nav log export snapshot', () => {
  it('preserves branch order and rounds branch distances to the nearest NM', () => {
    const snapshot = buildNavLogSnapshot({
      route: routeWithBranchCount(3),
      aircraft,
      fuelPlanConfig: fuelConfig,
      alternateCode: ''
    });

    expect(snapshot.branches.map((item) => item.waypointLabel)).toEqual(['WP1', 'WP2', 'LFOO']);
    expect(snapshot.branches.map((item) => item.distanceNm)).toEqual([11, 12, 13]);
    expect(snapshot.totals.distanceNm).toBe(36);
  });

  it('uses the exact reference formulas and leaves pilot fields empty', () => {
    const snapshot = buildNavLogSnapshot({
      route: routeWithBranchCount(1),
      aircraft,
      fuelPlanConfig: fuelConfig,
      alternateCode: ''
    });
    const first = snapshot.branches[0];

    expect(snapshot.aircraft.factorBase).toBeCloseTo(60 / 105, 8);
    expect(first.driftDeg).toBe(6);
    expect(first.maxDriftDeg).toBe(7);
    expect(first.windAngleDeg).toBe(64);
    expect(first.factorBaseWind).toBeCloseTo(60 / 98, 8);
    expect(first.estimatedPassageTime).toBeNull();
    expect(first.actualPassageTime).toBeNull();
    expect(first.radio).toBeNull();
    expect(first.fuelConsumedL).toBeNull();
    expect(first.fuelRemainingL).toBeNull();
    expect(snapshot.departure.qnhHpa).toBeNull();
    expect(snapshot.departure.radio).toBeNull();
    expect(snapshot.fuelPlan.marginMinutes).toBeNull();
    expect(snapshot.fuelPlan.regulatoryFuelL).toBeNull();
    expect(snapshot.totals.eta).toBeNull();
  });

  it('keeps alternate arrival fixed at 12 minutes', () => {
    const snapshot = buildNavLogSnapshot({
      route: routeWithBranchCount(1),
      aircraft,
      fuelPlanConfig: { ...fuelConfig, alternateArrivalMin: 99 },
      alternateCode: ''
    });
    expect(snapshot.fuelPlan.alternateArrivalMinutes).toBe(12);
  });

  it('limits the first version to eight branches and reports the omitted branches', () => {
    const snapshot = buildNavLogSnapshot({
      route: routeWithBranchCount(10),
      aircraft,
      fuelPlanConfig: fuelConfig,
      alternateCode: ''
    });
    expect(snapshot.branches).toHaveLength(8);
    expect(snapshot.omittedBranchCount).toBe(2);
    expect(snapshot.warnings.join(' ')).toContain('8 premières branches');
    expect(snapshot.totals.distanceNm).toBe(
      snapshot.branches.reduce((sum, item) => sum + (item.distanceNm ?? 0), 0)
    );
  });

  it('handles incomplete routes without inventing values', () => {
    const emptyRoute = routeWithBranchCount(1);
    emptyRoute.points = [];
    emptyRoute.branches = [];
    emptyRoute.distanceTotale = 0;
    emptyRoute.tempsEstimeMin = 0;
    const snapshot = buildNavLogSnapshot({
      route: emptyRoute,
      aircraft,
      fuelPlanConfig: fuelConfig,
      alternateCode: ''
    });

    expect(snapshot.departure.code).toBe('');
    expect(snapshot.destination.code).toBe('');
    expect(snapshot.branches).toEqual([]);
    expect(snapshot.warnings).toHaveLength(1);
  });
});

describe('nav log angle helpers', () => {
  it('normalizes signed heading differences across north', () => {
    expect(signedHeadingDifference(5, 355)).toBe(10);
    expect(signedHeadingDifference(355, 5)).toBe(-10);
  });

  it('returns an unsigned wind angle from 0 to 180 degrees', () => {
    expect(windAngleDeg(350, 10)).toBe(20);
    expect(windAngleDeg(10, 190)).toBe(180);
  });
});
