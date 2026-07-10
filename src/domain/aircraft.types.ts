export interface AircraftProfile {
  id: string;
  label: string;
  registration: string;
  model: string;
  cruiseTasKt: number;
  fuelBurnLh: number;
  usableFuelL: number;
  unusableFuelL?: number;
  reserveMinutes: number;
  climbSpeedKt: number;
  climbRateFpm: number;
  descentSpeedKt: number;
  descentRateFpm: number;
  notes?: string;
}

export interface FuelPlanConfig {
  taxiDepartureMin: number;
  arrivalMin: number;
  alternateArrivalMin: number;
  finalReserveMin: number;
  marginLiters: number;
  fuelOnBoardL?: number;
  marginMin?: number;
}

export interface FuelLine {
  label: string;
  minutes: number | null;
  liters: number;
  editable?: boolean;
}

export interface FuelPlanSummary {
  fuelPerHourL: number;
  fuelPerMinuteL: number;
  unusableFuelL: number;
  usableFuelL: number;
  routeMinutes: number;
  diversionMinutes: number;
  lines: {
    route: FuelLine;
    taxiDeparture: FuelLine;
    arrival: FuelLine;
    diversion: FuelLine;
    alternateArrival: FuelLine;
    finalReserve: FuelLine;
    totalNecessary: FuelLine;
    margin: FuelLine;
    fuelRequired: FuelLine;
    timeLimit: FuelLine;
  };
  fuelRequiredL: number;
  enduranceMinutes: number;
  remainingUsableFuelL: number;
}

export interface FuelSummary {
  routeFuelL: number;
  reserveFuelL: number;
  totalFuelL: number;
  enduranceMinutes: number;
}

export const DEFAULT_FUEL_PLAN_CONFIG: FuelPlanConfig = {
  taxiDepartureMin: 8,
  arrivalMin: 12,
  alternateArrivalMin: 12,
  finalReserveMin: 30,
  marginLiters: 0
};

export const FIXED_FUEL_MINUTES = {
  taxiDepartureMin: 8,
  arrivalMin: 12,
  alternateArrivalMin: 12
};
