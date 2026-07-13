import type { BranchWind, FlightProfile, NavBranch, NavPoint, NavPointType, NavRoute } from '../../domain/navigation.types';
import { findAerodrome } from '../../data/aerodromeCatalog';
import { bearingDeg } from '../geo/bearing';
import { distanceNm } from '../geo/distance';
import { estimatedMagneticVariationDeg } from '../geo/magneticVariation';

const DEFAULT_TAS_KT = 105;
const DEFAULT_ALTITUDE_FT = 2500;

export interface RouteBuildOptions {
  routeId?: string;
  profile?: Partial<FlightProfile>;
  branchAltitudeById?: Record<string, number>;
  branchWindById?: Record<string, BranchWind>;
}

function createRouteId(): string {
  const randomPart = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `route-${randomPart}`;
}

function normalizeRouteId(routeId?: string): string {
  const trimmed = routeId?.trim();
  return trimmed && trimmed !== 'active-route' ? trimmed : createRouteId();
}

function isoNowRoundedHour(): string {
  const date = new Date();
  date.setUTCMinutes(0, 0, 0);
  if (date.getTime() < Date.now()) date.setUTCHours(date.getUTCHours() + 1);
  return date.toISOString();
}

function normalizeHeading(value: number): number {
  return ((Math.round(value) % 360) + 360) % 360;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function toRad(value: number): number {
  return (value * Math.PI) / 180;
}

function toDeg(value: number): number {
  return (value * 180) / Math.PI;
}

function addMinutes(iso: string, minutes: number): string {
  const base = new Date(iso);
  if (Number.isNaN(base.getTime())) return isoNowRoundedHour();
  return new Date(base.getTime() + minutes * 60_000).toISOString();
}

function midpoint(a: NavPoint, b: NavPoint) {
  return {
    latitude: (a.latitude + b.latitude) / 2,
    longitude: (a.longitude + b.longitude) / 2
  };
}

function pointLabel(point: NavPoint): string {
  if (point.code) return point.code;
  return point.nom;
}

function routeName(points: NavPoint[]): string {
  if (points.length >= 2) return `${pointLabel(points[0])} - ${pointLabel(points[points.length - 1])}`;
  if (points.length === 1) return `${pointLabel(points[0])} - ----`;
  return 'Nouvelle navigation';
}

function pointId(type: NavPointType, code: string): string {
  return `${type}-${code.toLowerCase()}`;
}

function branchId(from: NavPoint, to: NavPoint): string {
  return `${from.id}-${to.id}`;
}

function sanitizeProfile(profile?: Partial<FlightProfile>): FlightProfile {
  const tasKt = clamp(Math.round(profile?.tasKt ?? DEFAULT_TAS_KT), 45, 220);
  const defaultAltitudeFt = clamp(Math.round((profile?.defaultAltitudeFt ?? DEFAULT_ALTITUDE_FT) / 100) * 100, 500, 12500);
  const departureTimeIso = profile?.departureTimeIso && !Number.isNaN(new Date(profile.departureTimeIso).getTime())
    ? profile.departureTimeIso
    : isoNowRoundedHour();
  const weatherAnalysisTimeIso = profile?.weatherAnalysisTimeIso && !Number.isNaN(new Date(profile.weatherAnalysisTimeIso).getTime())
    ? profile.weatherAnalysisTimeIso
    : undefined;

  return { tasKt, defaultAltitudeFt, departureTimeIso, weatherAnalysisTimeIso };
}

function computeWindCorrection(routeVraie: number, tasKt: number, wind?: BranchWind | null) {
  if (!wind || wind.speedKt <= 0) {
    return {
      derive: 0,
      capVrai: normalizeHeading(routeVraie),
      vitesseSol: tasKt,
      windCalculationValid: true,
      windCalculationWarning: undefined
    };
  }

  const angle = toRad(wind.directionDeg - routeVraie);
  const crosswindRatio = (wind.speedKt * Math.sin(angle)) / tasKt;
  const hasHeadingSolution = Math.abs(crosswindRatio) < 1;
  const driftRad = Math.asin(clamp(crosswindRatio, -0.999999, 0.999999));
  const driftDeg = toDeg(driftRad);
  const capVrai = normalizeHeading(routeVraie + driftDeg);
  const rawGroundSpeed = tasKt * Math.cos(driftRad) - wind.speedKt * Math.cos(angle);
  const windCalculationValid = hasHeadingSolution && rawGroundSpeed > 0.5;

  return {
    derive: Math.round(driftDeg),
    capVrai,
    // A real positive GS is kept even below 35 kt. When the wind makes the
    // branch impossible, 1 kt is used only as a conservative arithmetic guard;
    // the branch is explicitly marked invalid and never presented as valid.
    vitesseSol: windCalculationValid ? Math.max(1, Math.round(rawGroundSpeed)) : 1,
    windCalculationValid,
    windCalculationWarning: windCalculationValid
      ? undefined
      : 'Vent incompatible avec la route et la TAS : temps et carburant non calculables.'
  };
}

export function createAerodromePoint(codeValue: string, type: NavPointType): NavPoint | null {
  const aerodrome = findAerodrome(codeValue);
  if (!aerodrome) return null;
  const code = aerodrome.code;
  return {
    id: pointId(type, code),
    nom: code,
    code,
    type,
    source: 'aerodrome',
    latitude: aerodrome.latitude,
    longitude: aerodrome.longitude,
    elevationFt: aerodrome.elevationFt ?? null,
    magneticVariationDeg: aerodrome.magneticVariationDeg ?? null
  };
}

export function createManualWaypoint(latitude: number, longitude: number, index: number): NavPoint {
  const code = `WP${index}`;
  return {
    id: `waypoint-${code.toLowerCase()}-${Date.now()}`,
    nom: code,
    code,
    type: 'waypoint',
    source: 'manual',
    latitude,
    longitude
  };
}

export function relabelRoutePoints(points: NavPoint[]): NavPoint[] {
  let waypointIndex = 0;
  return points.map((point, index) => {
    const type: NavPointType = points.length <= 1
      ? point.type
      : index === 0 ? 'depart' : index === points.length - 1 ? 'destination' : 'waypoint';
    if (type === 'waypoint' && point.source !== 'aerodrome') {
      waypointIndex += 1;
      const code = `WP${waypointIndex}`;
      return { ...point, type, code, nom: code };
    }
    return { ...point, type, nom: point.code ?? point.nom };
  });
}

export function buildBranches(points: NavPoint[], options: RouteBuildOptions = {}): NavBranch[] {
  const profile = sanitizeProfile(options.profile);
  const branchAltitudeById = options.branchAltitudeById ?? {};
  const branchWindById = options.branchWindById ?? {};
  let elapsedMinutes = 0;

  return points.slice(0, -1).map((point, index) => {
    const next = points[index + 1];
    const id = branchId(point, next);
    const distance = distanceNm(point, next);
    const routeVraie = normalizeHeading(bearingDeg(point, next));
    const mid = midpoint(point, next);
    const magneticVariationDeg = estimatedMagneticVariationDeg(mid.latitude, mid.longitude);
    const routeMagnetique = normalizeHeading(routeVraie - magneticVariationDeg);
    const altitudeFt = branchAltitudeById[id] ?? profile.defaultAltitudeFt;
    const wind = branchWindById[id] ?? null;
    const windCorrection = computeWindCorrection(routeVraie, profile.tasKt, wind);
    const capCorrige = normalizeHeading(windCorrection.capVrai - magneticVariationDeg);
    const tempsSansVentMin = Math.max(1, Math.round(distance * (60 / profile.tasKt)));
    const tempsBrancheMin = Math.max(1, Math.round((distance / windCorrection.vitesseSol) * 60));
    const estimatedStartIso = addMinutes(profile.departureTimeIso, elapsedMinutes);
    const estimatedMidIso = addMinutes(profile.departureTimeIso, elapsedMinutes + tempsBrancheMin / 2);
    elapsedMinutes += tempsBrancheMin;
    const estimatedArrivalIso = addMinutes(profile.departureTimeIso, elapsedMinutes);

    return {
      id,
      from: point.id,
      to: next.id,
      distanceNm: Number(distance.toFixed(1)),
      routeVraie,
      magneticVariationDeg,
      routeMagnetique,
      altitudeFt,
      wind,
      derive: windCorrection.derive,
      capVrai: windCorrection.capVrai,
      capCorrige,
      vitesseSol: windCorrection.vitesseSol,
      windCalculationValid: windCorrection.windCalculationValid,
      windCalculationWarning: windCorrection.windCalculationWarning,
      tempsSansVentMin,
      tempsBrancheMin,
      estimatedStartIso,
      estimatedMidIso,
      estimatedArrivalIso,
      frequencyMhz: index === 0 ? '123.500' : index === points.length - 2 ? '118.355' : '123.500',
      remarks: index === 0 ? 'Départ à confirmer' : index === points.length - 2 ? 'Arrivée à préparer' : 'Point tournant'
    };
  });
}

export function buildRoute(points: NavPoint[], options: RouteBuildOptions = {}): NavRoute {
  const profile = sanitizeProfile(options.profile);
  const normalizedPoints = relabelRoutePoints(points);
  const branchAltitudeById = options.branchAltitudeById ?? {};
  const branchWindById = options.branchWindById ?? {};
  const branches = normalizedPoints.length >= 2
    ? buildBranches(normalizedPoints, { profile, branchAltitudeById, branchWindById })
    : [];

  const totalTimeMinutes = branches.reduce((sum, branch) => sum + branch.tempsBrancheMin, 0);
  const totalDistance = Number(branches.reduce((sum, branch) => sum + branch.distanceNm, 0).toFixed(1));
  const hasWindCalculationError = branches.some((branch) => branch.windCalculationValid === false);
  const averageGroundSpeedKt = hasWindCalculationError
    ? 0
    : totalTimeMinutes > 0
      ? Math.max(0, Math.round((totalDistance / totalTimeMinutes) * 60))
      : profile.tasKt;

  return {
    id: normalizeRouteId(options.routeId),
    nom: routeName(normalizedPoints),
    points: normalizedPoints,
    branches,
    distanceTotale: totalDistance,
    tempsEstimeMin: totalTimeMinutes,
    vitesseSolKt: averageGroundSpeedKt,
    hasWindCalculationError,
    profile,
    branchAltitudeById: Object.fromEntries(branches.map((branch) => [branch.id, branch.altitudeFt])),
    branchWindById: Object.fromEntries(branches.filter((branch) => branch.wind).map((branch) => [branch.id, branch.wind as BranchWind])),
    dateModification: new Date().toISOString()
  };
}

export function createEmptyRoute(options: RouteBuildOptions = {}): NavRoute {
  return buildRoute([], options);
}

export function createDefaultRoute(): NavRoute {
  const departure = createAerodromePoint('LFBI', 'depart');
  const destination = createAerodromePoint('LFEY', 'destination');

  if (!departure || !destination) {
    throw new Error('Default aerodromes missing from catalogue');
  }

  return buildRoute([departure, destination]);
}
