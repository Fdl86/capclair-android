export interface NavLogAerodromeSnapshot {
  code: string;
  altitudeFt: number | null;
  runway: null;
  qnhHpa: null;
  radio: null;
}

export interface NavLogAircraftSnapshot {
  factorBase: number | null;
  fuelBurnLh: number | null;
  fuelBurnLmin: number | null;
  unusableFuelL: number | null;
  vsKt: null;
  vs0Kt: null;
  vfeKt: null;
  vfinMaxKt: null;
  hourMeterDeparture: null;
  hourMeterArrival: null;
  blockTimeDeparture: null;
  blockTimeArrival: null;
}

export interface NavLogFuelPlanSnapshot {
  routeMinutes: number | null;
  taxiDepartureMinutes: 8;
  arrivalMinutes: 12;
  diversionMinutes: number | null;
  alternateArrivalMinutes: 12;
  marginMinutes: null;
  finalReserveMinutes: number | null;
  totalHours: null;
  regulatoryFuelL: null;
  fuelOnBoardL: null;
  flightTimeHours: null;
  timeLimitHours: null;
}

export interface NavLogBranchSnapshot {
  id: string;
  zminiFt: null;
  routeMagneticDeg: number | null;
  driftDeg: number | null;
  headingMagneticDeg: number | null;
  maxDriftDeg: number | null;
  windAngleDeg: number | null;
  waypointLabel: string;
  factorBaseWind: number | null;
  distanceNm: number | null;
  timeStillAirMinutes: number | null;
  timeWithWindMinutes: number | null;
  estimatedPassageTime: null;
  actualPassageTime: null;
  radio: null;
  fuelConsumedL: null;
  fuelRemainingL: null;
}

export interface NavLogTotalsSnapshot {
  distanceNm: number | null;
  timeStillAirMinutes: number | null;
  timeWithWindMinutes: number | null;
  eta: null;
}

export interface NavLogExportSnapshot {
  schemaVersion: 1;
  documentDateIso: string | null;
  departure: NavLogAerodromeSnapshot;
  destination: NavLogAerodromeSnapshot;
  aircraft: NavLogAircraftSnapshot;
  fuelPlan: NavLogFuelPlanSnapshot;
  branches: NavLogBranchSnapshot[];
  totals: NavLogTotalsSnapshot;
  reservoirRows: readonly [null, null, null, null];
  omittedBranchCount: number;
  warnings: string[];
}

export interface NavLogExportResult {
  ok: boolean;
  mode: 'android-share' | 'web-download';
  fileName: string;
  message: string;
  omittedBranchCount: number;
  warnings: string[];
}
