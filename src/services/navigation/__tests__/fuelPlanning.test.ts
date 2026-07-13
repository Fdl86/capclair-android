import { describe, expect, it } from 'vitest';
import type { AircraftProfile, FuelPlanConfig } from '../../../domain/aircraft.types';
import type { NavRoute } from '../../../domain/navigation.types';
import { computeFuelPlan } from '../fuelPlanning';

const aircraft: AircraftProfile = {
  id: 'c150',
  label: 'C150',
  registration: 'F-TEST',
  model: 'Cessna 150',
  cruiseTasKt: 95,
  fuelBurnLh: 24,
  usableFuelL: 80,
  reserveMinutes: 30,
  climbSpeedKt: 70,
  climbRateFpm: 500,
  descentSpeedKt: 80,
  descentRateFpm: 500
};

const route = {
  tempsEstimeMin: 60
} as NavRoute;

const config: FuelPlanConfig = {
  taxiDepartureMin: 8,
  arrivalMin: 12,
  alternateArrivalMin: 12,
  finalReserveMin: 30,
  marginLiters: 2
};

describe('fuel planning', () => {
  it('never presents calculated endurance as fuel actually onboard', () => {
    const result = computeFuelPlan(route, aircraft, config, 15);
    expect(result.lines.timeLimit.label).toBe('Autonomie de l’emport calculé');
    expect(result.remainingUsableFuelL).toBeGreaterThanOrEqual(0);
  });

  it('flags a required fuel load that exceeds usable capacity', () => {
    const constrainedAircraft = { ...aircraft, usableFuelL: 20 };
    const result = computeFuelPlan(route, constrainedAircraft, config, 15);

    expect(result.isOverCapacity).toBe(true);
    expect(result.fuelDeficitL).toBeGreaterThan(0);
    expect(result.remainingUsableFuelL).toBe(0);
  });


  it('marks the fuel plan unusable when a route contains an impossible wind calculation', () => {
    const invalidRoute = { ...route, hasWindCalculationError: true } as NavRoute;
    const result = computeFuelPlan(invalidRoute, aircraft, config, 15);

    expect(result.calculationValid).toBe(false);
    expect(result.calculationWarning).toContain('Vent incompatible');
  });

  it('does not flag a plan at or below usable capacity', () => {
    const result = computeFuelPlan(route, aircraft, config, 15);

    expect(result.isOverCapacity).toBe(false);
    expect(result.fuelDeficitL).toBe(0);
  });
});
