export type NavPointType = 'depart' | 'waypoint' | 'destination';
export type NavPointSource = 'aerodrome' | 'manual';

export interface NavPoint {
  id: string;
  nom: string;
  code?: string;
  type: NavPointType;
  source?: NavPointSource;
  latitude: number;
  longitude: number;
  elevationFt?: number | null;
  magneticVariationDeg?: number | null;
}

export interface BranchWindAuditLevel {
  pressureHpa: number;
  heightFt: number;
  directionDeg: number;
  speedKt: number;
}

export interface BranchWindSampleAudit {
  sampleId: string;
  latitude: number;
  longitude: number;
  altitudeFt: number;
  requestedTimeIso: string;
  sourceTimeIso: string;
  provider: string;
  endpoint: string;
  fallback: boolean;
  cache: 'browser' | 'cloudflare' | 'live' | 'unknown';
  normalizedKey: string;
  lowerLevel?: BranchWindAuditLevel | null;
  upperLevel?: BranchWindAuditLevel | null;
  interpolationRatio?: number | null;
}

export interface BranchWind {
  directionDeg: number;
  speedKt: number;
  sourceTimeIso?: string;
  provider?: string;
  endpoint?: string;
  fallback?: boolean;
  cache?: 'browser' | 'cloudflare' | 'live' | 'mixed' | 'unknown';
  normalizedKey?: string;
  auditSamples?: BranchWindSampleAudit[];
  ageMinutes?: number;
}

export interface FlightProfile {
  tasKt: number;
  defaultAltitudeFt: number;
  departureTimeIso: string;
  weatherAnalysisTimeIso?: string;
}

export interface NavBranch {
  id: string;
  from: string;
  to: string;
  distanceNm: number;
  routeVraie: number;
  magneticVariationDeg: number;
  routeMagnetique: number;
  altitudeFt: number;
  wind?: BranchWind | null;
  derive: number;
  capVrai: number;
  capCorrige: number;
  vitesseSol: number;
  windCalculationValid?: boolean;
  windCalculationWarning?: string;
  tempsSansVentMin: number;
  tempsBrancheMin: number;
  estimatedStartIso: string;
  estimatedMidIso: string;
  estimatedArrivalIso: string;
  frequencyMhz?: string;
  remarks?: string;
}

export interface NavRoute {
  id: string;
  nom: string;
  points: NavPoint[];
  branches: NavBranch[];
  distanceTotale: number;
  tempsEstimeMin: number;
  vitesseSolKt: number;
  hasWindCalculationError?: boolean;
  profile: FlightProfile;
  branchAltitudeById: Record<string, number>;
  branchWindById: Record<string, BranchWind>;
  dateModification: string;
}
