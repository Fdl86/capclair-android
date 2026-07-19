import type { NavPoint } from '../../domain/navigation.types';
import type { PibAnalysis } from '../../domain/notam.types';
import type { SupAipProperties, SupAipVisualStatus } from '../../domain/supaip.types';
import { distanceNm } from '../geo/distance';
import type {
  SupAipDatasetBundle,
  SupAipGeoJsonFeature,
  SupAipManifestPublication,
  SupAipUnmappedPublication
} from './supAipDataset';
import { getSupAipVisualStatus } from './supAipStatus';

export interface SupAipPublicationView {
  id: string;
  title: string;
  spatial: boolean;
  sourcePdf: string;
  mappedGeometryCount: number;
  expectedGeometryCount: number | null;
  status: string;
  partial: boolean;
  conservative: boolean;
  fallback: boolean;
  reason: string | null;
  features: SupAipGeoJsonFeature[];
  visualStatus: SupAipVisualStatus;
  validFrom: string | null;
  validTo: string | null;
  routeDistanceNm: number | null;
  routeRelevant: boolean;
  citedByNotam: boolean;
  missingVerticalCount: number;
}

interface GeoPoint {
  latitude: number;
  longitude: number;
}

function normalizeRef(value: string): string {
  const match = value.match(/0*(\d{1,3})\s*\/\s*(\d{2})/);
  return match ? `${String(Number(match[1])).padStart(3, '0')}/${match[2]}` : value.trim();
}

function flattenCoordinates(value: unknown, output: GeoPoint[]): void {
  if (!Array.isArray(value)) return;
  if (value.length >= 2 && typeof value[0] === 'number' && typeof value[1] === 'number') {
    output.push({ longitude: Number(value[0]), latitude: Number(value[1]) });
    return;
  }
  for (const entry of value) flattenCoordinates(entry, output);
}

function reducedFeaturePoints(feature: SupAipGeoJsonFeature): GeoPoint[] {
  const points: GeoPoint[] = [];
  flattenCoordinates(feature.geometry.coordinates, points);
  if (points.length <= 80) return points;
  const stride = Math.ceil(points.length / 80);
  return points.filter((_, index) => index % stride === 0);
}

function routeDistance(features: SupAipGeoJsonFeature[], route: NavPoint[]): number | null {
  if (features.length === 0 || route.length === 0) return null;
  let minimum = Number.POSITIVE_INFINITY;
  for (const feature of features) {
    for (const geometryPoint of reducedFeaturePoints(feature)) {
      for (const routePoint of route) {
        const current = distanceNm(geometryPoint, routePoint);
        if (current < minimum) minimum = current;
        if (minimum < 0.2) return minimum;
      }
    }
  }
  return Number.isFinite(minimum) ? minimum : null;
}

function publicationProperties(
  manifest: SupAipManifestPublication,
  detail: SupAipUnmappedPublication | undefined,
  features: SupAipGeoJsonFeature[]
): Partial<SupAipProperties> {
  const first = features[0]?.properties;
  return {
    validFrom: first?.validFrom ?? detail?.validFrom ?? '',
    validTo: first?.validTo ?? detail?.validTo ?? '',
    activationMode: first?.activationMode,
    activationWindowsUtc: first?.activationWindowsUtc
  };
}

export function buildSupAipPublicationCatalog(
  bundle: SupAipDatasetBundle,
  routePoints: NavPoint[],
  briefing: PibAnalysis | null,
  routeThresholdNm = 25
): SupAipPublicationView[] {
  const featuresByPublication = new Map<string, SupAipGeoJsonFeature[]>();
  for (const feature of bundle.geoJson.features) {
    const id = normalizeRef(feature.properties.supAip);
    const current = featuresByPublication.get(id) ?? [];
    current.push(feature);
    featuresByPublication.set(id, current);
  }
  const unmappedByPublication = new Map(
    bundle.unmapped.publications.map((publication) => [normalizeRef(publication.supAip), publication])
  );
  const cited = new Set(
    briefing?.notams.flatMap((notam) => notam.supAipReferences.map((reference) => normalizeRef(reference.id))) ?? []
  );

  const catalog = bundle.manifest.publications.map((manifest) => {
    const id = normalizeRef(manifest.supAip);
    const detail = unmappedByPublication.get(id);
    const features = featuresByPublication.get(id) ?? [];
    const distance = routeDistance(features, routePoints);
    const first = features[0]?.properties;
    const properties = publicationProperties(manifest, detail, features);
    return {
      id,
      title: manifest.title,
      spatial: manifest.spatial,
      sourcePdf: manifest.sourcePdf,
      mappedGeometryCount: features.length,
      expectedGeometryCount: manifest.expectedNamedGeometryCount,
      status: detail?.status ?? manifest.status,
      partial: Boolean(detail?.partial ?? manifest.partial),
      conservative: Boolean(detail?.conservative ?? manifest.conservative),
      fallback: Boolean(detail?.fallback ?? manifest.fallback),
      reason: detail?.reason?.trim() || null,
      features,
      visualStatus: getSupAipVisualStatus(properties),
      validFrom: first?.validFrom ?? detail?.validFrom ?? null,
      validTo: first?.validTo ?? detail?.validTo ?? null,
      routeDistanceNm: distance,
      routeRelevant: distance !== null && distance <= routeThresholdNm,
      citedByNotam: cited.has(id),
      missingVerticalCount: features.filter((feature) => feature.properties.verticalLimitsExtracted === false).length
    } satisfies SupAipPublicationView;
  });

  return catalog.sort((left, right) => {
    const leftPriority = (left.citedByNotam ? 0 : 4) + (left.routeRelevant ? 0 : 2) + (left.spatial ? 0 : 1);
    const rightPriority = (right.citedByNotam ? 0 : 4) + (right.routeRelevant ? 0 : 2) + (right.spatial ? 0 : 1);
    if (leftPriority !== rightPriority) return leftPriority - rightPriority;
    const leftDistance = left.routeDistanceNm ?? Number.POSITIVE_INFINITY;
    const rightDistance = right.routeDistanceNm ?? Number.POSITIVE_INFINITY;
    if (leftDistance !== rightDistance) return leftDistance - rightDistance;
    return left.id.localeCompare(right.id, 'fr');
  });
}
