import type { AircraftProfile, FuelLine, FuelPlanConfig, FuelPlanSummary, FuelSummary } from '../../domain/aircraft.types';
import { FIXED_FUEL_MINUTES } from '../../domain/aircraft.types';
import type { NavRoute } from '../../domain/navigation.types';

function round1(value: number) {
  return Number(value.toFixed(1));
}

function safeMinute(value: number) {
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

function safeLiter(value: number) {
  return Number.isFinite(value) ? Math.max(0, round1(value)) : 0;
}

function makeLine(label: string, minutes: number, fuelPerMinuteL: number, editable = false): FuelLine {
  const safeMin = safeMinute(minutes);
  return {
    label,
    minutes: safeMin,
    liters: safeLiter(safeMin * fuelPerMinuteL),
    editable
  };
}

function makeLiterLine(label: string, liters: number, editable = false): FuelLine {
  return {
    label,
    minutes: null,
    liters: safeLiter(liters),
    editable
  };
}

export function computeFuelSummary(route: NavRoute, aircraft: AircraftProfile): FuelSummary {
  const routeFuelL = (route.tempsEstimeMin / 60) * aircraft.fuelBurnLh;
  const reserveFuelL = (aircraft.reserveMinutes / 60) * aircraft.fuelBurnLh;
  const totalFuelL = routeFuelL + reserveFuelL;
  const enduranceMinutes = aircraft.fuelBurnLh > 0 ? Math.floor((aircraft.usableFuelL / aircraft.fuelBurnLh) * 60) : 0;

  return {
    routeFuelL: Number(routeFuelL.toFixed(1)),
    reserveFuelL: Number(reserveFuelL.toFixed(1)),
    totalFuelL: Number(totalFuelL.toFixed(1)),
    enduranceMinutes
  };
}

export function computeFuelPlan(
  route: NavRoute,
  aircraft: AircraftProfile,
  config: FuelPlanConfig,
  diversionMinutes: number
): FuelPlanSummary {
  const fuelPerHourL = Math.max(0, aircraft.fuelBurnLh);
  const fuelPerMinuteL = fuelPerHourL > 0 ? fuelPerHourL / 60 : 0;
  const routeMinutes = safeMinute(route.tempsEstimeMin);
  const diversionMin = safeMinute(diversionMinutes);

  const routeLine = makeLine('Trajet + vent', routeMinutes, fuelPerMinuteL);
  const taxiDepartureLine = makeLine('Roulage départ', FIXED_FUEL_MINUTES.taxiDepartureMin, fuelPerMinuteL);
  const arrivalLine = makeLine('Arrivée', FIXED_FUEL_MINUTES.arrivalMin, fuelPerMinuteL);
  const diversionLine = makeLine('Déroutement', diversionMin, fuelPerMinuteL);
  const alternateArrivalLine = makeLine('Arr. déroutement', FIXED_FUEL_MINUTES.alternateArrivalMin, fuelPerMinuteL);
  const finalReserveLine = makeLine('Réserve finale', config.finalReserveMin, fuelPerMinuteL, true);

  const legacyMarginLiters = typeof config.marginMin === 'number' ? safeMinute(config.marginMin) * fuelPerMinuteL : 0;
  const marginLiters = typeof config.marginLiters === 'number' ? config.marginLiters : legacyMarginLiters;
  const marginLine = makeLiterLine('Marge', marginLiters, true);

  const totalNecessaryMinutes = routeLine.minutes!
    + taxiDepartureLine.minutes!
    + arrivalLine.minutes!
    + diversionLine.minutes!
    + alternateArrivalLine.minutes!
    + finalReserveLine.minutes!;

  const totalNecessaryLiters = routeLine.liters
    + taxiDepartureLine.liters
    + arrivalLine.liters
    + diversionLine.liters
    + alternateArrivalLine.liters
    + finalReserveLine.liters;

  const totalNecessaryLine: FuelLine = {
    label: 'Total nécessaire',
    minutes: totalNecessaryMinutes,
    liters: safeLiter(totalNecessaryLiters)
  };

  const exactRequiredLiters = safeLiter(totalNecessaryLine.liters + marginLine.liters);
  const emportLiters = Math.ceil(exactRequiredLiters);
  const emportMinutes = fuelPerMinuteL > 0 ? Math.floor(emportLiters / fuelPerMinuteL) : 0;

  const fuelRequiredLine: FuelLine = {
    label: 'Emport carburant',
    minutes: emportMinutes,
    liters: emportLiters
  };


  const timeLimitLine: FuelLine = {
    label: 'Autonomie de l’emport calculé',
    minutes: emportMinutes,
    liters: emportLiters
  };

  const usableFuelL = safeLiter(aircraft.usableFuelL);
  const rawCapacityBalanceL = usableFuelL - emportLiters;
  const fuelDeficitL = rawCapacityBalanceL < 0 ? safeLiter(Math.abs(rawCapacityBalanceL)) : 0;

  const calculationValid = route.hasWindCalculationError !== true;

  return {
    calculationValid,
    calculationWarning: calculationValid
      ? undefined
      : 'Vent incompatible sur au moins une branche : le devis carburant ne doit pas être utilisé.',
    fuelPerHourL,
    fuelPerMinuteL,
    unusableFuelL: safeLiter(aircraft.unusableFuelL ?? 0),
    usableFuelL,
    routeMinutes,
    diversionMinutes: diversionMin,
    fuelRequiredL: emportLiters,
    enduranceMinutes: emportMinutes,
    remainingUsableFuelL: safeLiter(Math.max(0, rawCapacityBalanceL)),
    fuelDeficitL,
    isOverCapacity: fuelDeficitL > 0,
    lines: {
      route: routeLine,
      taxiDeparture: taxiDepartureLine,
      arrival: arrivalLine,
      diversion: diversionLine,
      alternateArrival: alternateArrivalLine,
      finalReserve: finalReserveLine,
      totalNecessary: totalNecessaryLine,
      margin: marginLine,
      fuelRequired: fuelRequiredLine,
      timeLimit: timeLimitLine
    }
  };
}
