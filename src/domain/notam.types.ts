import type { NavPoint, NavRoute } from './navigation.types';

export type NotamInterpretationStatus = 'confirmed' | 'probable' | 'approximate' | 'uninterpreted' | 'verify';
export type NotamLifecycleType = 'new' | 'replace' | 'cancel' | 'unknown';
export type NotamTemporalStatus = 'active' | 'future' | 'ended' | 'published' | 'complex' | 'unknown';
export type SupAipAction = 'trigger' | 'activated' | 'modified' | 'extended' | 'cancelled' | 'replaced' | 'mentioned' | 'ambiguous';
export type SupAipReconciliationStatus =
  | 'mapped'
  | 'partial'
  | 'conservative'
  | 'fallback'
  | 'unmapped'
  | 'absent'
  | 'ambiguous';

export interface NotamCoordinate {
  latitude: number;
  longitude: number;
  raw: string;
}

export interface NotamQField {
  raw: string;
  fir: string | null;
  code: string | null;
  traffic: string | null;
  purpose: string | null;
  scope: string | null;
  lowerFl: number | null;
  upperFl: number | null;
  center: NotamCoordinate | null;
  radiusNm: number | null;
}

export interface SupAipReference {
  id: string;
  raw: string;
  action: SupAipAction;
  confidence: NotamInterpretationStatus;
}

export interface ParsedNotam {
  id: string;
  series: string;
  number: number;
  year: number;
  lifecycleType: NotamLifecycleType;
  section: string | null;
  rawText: string;
  fields: {
    a: string[];
    validFromIso: string | null;
    validToIso: string | null;
    validToPermanent: boolean;
    scheduleRaw: string | null;
    e: string;
    f: string | null;
    g: string | null;
    q: NotamQField | null;
  };
  supAipReferences: SupAipReference[];
  eCoordinates: NotamCoordinate[];
  exactPolygon: NotamCoordinate[] | null;
  temporalStatus: NotamTemporalStatus;
  temporalExplanation: string;
  routeRelevance: 'departure' | 'destination' | 'alternate' | 'route' | 'outside' | 'unknown';
  routeDistanceNm: number | null;
  interpretationStatus: NotamInterpretationStatus;
  warnings: string[];
}

export interface PibRouteContext {
  type: string | null;
  productionTimeIso: string | null;
  departureTimeIso: string | null;
  durationRaw: string | null;
  flightRules: string | null;
  departure: string | null;
  destination: string | null;
  alternates: string[];
  floorFl: number | null;
  ceilingFl: number | null;
  radiusNm: number | null;
  halfCorridorNm: number | null;
}

export interface SupAipReconciliation {
  reference: SupAipReference;
  status: SupAipReconciliationStatus;
  title: string | null;
  sourcePdf: string | null;
  validFrom: string | null;
  validTo: string | null;
  mappedGeometryCount: number;
  expectedGeometryCount: number | null;
  missingGeometryNames: string[];
  warning: string | null;
}

export interface BriefingRouteSnapshot {
  routeId: string | null;
  routeName: string;
  departure: string | null;
  destination: string | null;
  alternates: string[];
  departureTimeIso: string | null;
  maxAltitudeFt: number | null;
  points: NavPoint[];
  signature: string;
}

export interface PibAnalysisSummary {
  totalNotams: number;
  supAipReferenceCount: number;
  supAipMatchCount: number;
  supAipMissingOrIncompleteCount: number;
  uninterpretedCount: number;
  approximateCircleCount: number;
  routeRelevantCount: number;
  activeAtPlannedTimeCount: number;
}

export interface PibAnalysis {
  schemaVersion: 1;
  id: string;
  importedAtIso: string;
  sourceKind: 'pdf' | 'text';
  sourceFileName: string | null;
  sourceFingerprint: string;
  rawText: string;
  context: PibRouteContext;
  routeSnapshot: BriefingRouteSnapshot;
  routeContextMode: 'matching' | 'mismatch' | 'detected-only' | 'route-only' | 'uncontextualized';
  notams: ParsedNotam[];
  reconciliations: SupAipReconciliation[];
  summary: PibAnalysisSummary;
  warnings: string[];
  supAipDatasetRevision?: string | null;
}

export interface NotamLayerSettings {
  enabled: boolean;
  filter: 'all' | 'route' | 'alerts' | 'supaip' | 'active';
}

export function routeSnapshotFromRoute(route: NavRoute, alternates: string[]): BriefingRouteSnapshot {
  const departure = route.points.find((point) => point.type === 'depart')?.code ?? null;
  const destination = route.points.find((point) => point.type === 'destination')?.code ?? null;
  const points = route.points.map((point) => ({ ...point }));
  const signature = [
    route.id,
    departure ?? '',
    destination ?? '',
    alternates.join(','),
    route.profile.departureTimeIso,
    ...points.map((point) => `${point.id}:${point.latitude.toFixed(5)}:${point.longitude.toFixed(5)}`)
  ].join('|');
  return {
    routeId: route.id,
    routeName: route.nom,
    departure,
    destination,
    alternates,
    departureTimeIso: route.profile.departureTimeIso || null,
    maxAltitudeFt: route.branches.length > 0 ? Math.max(...route.branches.map((branch) => branch.altitudeFt)) : route.profile.defaultAltitudeFt,
    points,
    signature
  };
}
