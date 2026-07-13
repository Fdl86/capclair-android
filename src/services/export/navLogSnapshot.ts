import type { AircraftProfile, FuelPlanConfig } from '../../domain/aircraft.types';
import type { NavBranch, NavPoint, NavRoute } from '../../domain/navigation.types';
import { diversionMinutes } from '../navigation/diversion';
import type {
  NavLogAerodromeSnapshot,
  NavLogBranchSnapshot,
  NavLogExportSnapshot
} from './navLogExport.types';

export const NAV_LOG_MAX_BRANCHES = 8;

export interface BuildNavLogSnapshotInput {
  route: NavRoute;
  aircraft: AircraftProfile;
  fuelPlanConfig: FuelPlanConfig;
  alternateCode: string;
}

function finiteOrNull(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function normalizedHeading(value: number): number {
  return ((Math.round(value) % 360) + 360) % 360;
}

export function signedHeadingDifference(fromDeg: number, toDeg: number): number {
  let difference = normalizedHeading(fromDeg) - normalizedHeading(toDeg);
  while (difference > 180) difference -= 360;
  while (difference <= -180) difference += 360;
  return Math.round(difference);
}

export function windAngleDeg(routeTrueDeg: number, windFromDeg: number): number {
  const difference = Math.abs(signedHeadingDifference(windFromDeg, routeTrueDeg));
  return Math.min(180, difference);
}

function pointLabel(point: NavPoint | undefined): string {
  const value = point?.code?.trim() || point?.nom?.trim() || '';
  return value.slice(0, 32);
}

function aerodromeSnapshot(point: NavPoint | undefined): NavLogAerodromeSnapshot {
  return {
    code: pointLabel(point),
    altitudeFt: finiteOrNull(point?.elevationFt),
    runway: null,
    qnhHpa: null,
    radio: null
  };
}

function branchSnapshot(
  route: NavRoute,
  branch: NavBranch,
  factorBase: number | null
): NavLogBranchSnapshot {
  const destinationPoint = route.points.find((point) => point.id === branch.to);
  const wind = branch.wind && Number.isFinite(branch.wind.speedKt) && branch.wind.speedKt >= 0
    ? branch.wind
    : null;
  const windCalculationValid = branch.windCalculationValid !== false;
  const factorBaseWind = windCalculationValid && branch.vitesseSol > 0 ? 60 / branch.vitesseSol : null;
  const maxDrift = wind && factorBase !== null ? factorBase * wind.speedKt : null;
  const windAngle = wind ? windAngleDeg(branch.routeVraie, wind.directionDeg) : null;

  return {
    id: branch.id,
    zminiFt: null,
    routeMagneticDeg: finiteOrNull(branch.routeMagnetique),
    driftDeg: Number.isFinite(branch.routeMagnetique) && Number.isFinite(branch.capCorrige)
      ? signedHeadingDifference(branch.routeMagnetique, branch.capCorrige)
      : null,
    headingMagneticDeg: finiteOrNull(branch.capCorrige),
    maxDriftDeg: maxDrift === null ? null : Math.round(maxDrift),
    windAngleDeg: windAngle,
    waypointLabel: pointLabel(destinationPoint),
    factorBaseWind: finiteOrNull(factorBaseWind),
    distanceNm: Number.isFinite(branch.distanceNm) ? Math.round(branch.distanceNm) : null,
    timeStillAirMinutes: Number.isFinite(branch.tempsSansVentMin) ? Math.round(branch.tempsSansVentMin) : null,
    timeWithWindMinutes: windCalculationValid && Number.isFinite(branch.tempsBrancheMin)
      ? Math.round(branch.tempsBrancheMin)
      : null,
    estimatedPassageTime: null,
    actualPassageTime: null,
    radio: null,
    fuelConsumedL: null,
    fuelRemainingL: null
  };
}

export function buildNavLogSnapshot({
  route,
  aircraft,
  fuelPlanConfig,
  alternateCode
}: BuildNavLogSnapshotInput): NavLogExportSnapshot {
  const departure = route.points.find((point) => point.type === 'depart') ?? route.points[0];
  const destination = route.points.find((point) => point.type === 'destination') ?? route.points.at(-1);
  const tasKt = Number.isFinite(route.profile.tasKt) && route.profile.tasKt > 0
    ? route.profile.tasKt
    : aircraft.cruiseTasKt;
  const factorBase = Number.isFinite(tasKt) && tasKt > 0 ? 60 / tasKt : null;
  const fuelBurnLh = finiteOrNull(aircraft.fuelBurnLh);
  const displayedBranches = route.branches.slice(0, NAV_LOG_MAX_BRANCHES).map((branch) => (
    branchSnapshot(route, branch, factorBase)
  ));
  const omittedBranchCount = Math.max(0, route.branches.length - displayedBranches.length);
  const warnings: string[] = [];

  if (!departure || !destination || route.branches.length === 0) {
    warnings.push('Navigation incomplète : certains champs du document restent vides.');
  }
  if (omittedBranchCount > 0) {
    warnings.push(`Navigation limitée aux 8 premières branches (${omittedBranchCount} branche${omittedBranchCount > 1 ? 's' : ''} non imprimée${omittedBranchCount > 1 ? 's' : ''}).`);
  }
  if (route.hasWindCalculationError) {
    warnings.push('Vent incompatible sur au moins une branche : Fbw et TAV laissés vides dans le PDF.');
  }

  const total = (selector: (branch: NavLogBranchSnapshot) => number | null) => {
    const values = displayedBranches.map(selector);
    return values.some((value) => value === null)
      ? null
      : values.reduce<number>((sum, value) => sum + (value ?? 0), 0);
  };

  return {
    schemaVersion: 1,
    documentDateIso: route.profile.departureTimeIso || null,
    departure: aerodromeSnapshot(departure),
    destination: aerodromeSnapshot(destination),
    aircraft: {
      factorBase,
      fuelBurnLh,
      fuelBurnLmin: fuelBurnLh === null ? null : fuelBurnLh / 60,
      unusableFuelL: finiteOrNull(aircraft.unusableFuelL),
      vsKt: null,
      vs0Kt: null,
      vfeKt: null,
      vfinMaxKt: null,
      hourMeterDeparture: null,
      hourMeterArrival: null,
      blockTimeDeparture: null,
      blockTimeArrival: null
    },
    fuelPlan: {
      routeMinutes: Number.isFinite(route.tempsEstimeMin) ? Math.round(route.tempsEstimeMin) : null,
      taxiDepartureMinutes: 8,
      arrivalMinutes: 12,
      diversionMinutes: destination?.code && alternateCode
        ? diversionMinutes(destination.code, alternateCode, tasKt)
        : null,
      alternateArrivalMinutes: 12,
      marginMinutes: null,
      finalReserveMinutes: Number.isFinite(fuelPlanConfig.finalReserveMin)
        ? Math.max(0, Math.round(fuelPlanConfig.finalReserveMin))
        : null,
      totalHours: null,
      regulatoryFuelL: null,
      fuelOnBoardL: null,
      flightTimeHours: null,
      timeLimitHours: null
    },
    branches: displayedBranches,
    totals: {
      distanceNm: total((branch) => branch.distanceNm),
      timeStillAirMinutes: total((branch) => branch.timeStillAirMinutes),
      timeWithWindMinutes: total((branch) => branch.timeWithWindMinutes),
      eta: null
    },
    reservoirRows: [null, null, null, null],
    omittedBranchCount,
    warnings
  };
}
