import type { SupAipProperties } from '../../domain/supaip.types';

export interface SupAipDatasetStatus {
  schemaVersion: number;
  mode: 'bootstrap' | 'automatic';
  beta: boolean;
  generatedAt: string;
  sourceUpdatedAt?: string | null;
  sourceUrl: string;
  parserVersion: string;
  datasetRevision?: string;
  listingPublicationCount: number;
  processedPublicationCount?: number;
  nonSpatialPublicationCount?: number;
  zonalPublicationCount: number;
  mappedPublicationCount: number;
  fullyMappedPublicationCount?: number;
  conservativelyMappedPublicationCount?: number;
  fallbackMappedPublicationCount?: number;
  featureCount: number;
  expectedNamedGeometryCount?: number;
  declaredZoneCount?: number;
  verticalCompleteFeatureCount?: number;
  missingVerticalFeatureCount?: number;
  unmappedPublicationCount: number;
  completeUnmappedPublicationCount: number;
  partialPublicationCount: number;
  conservativePublicationCount?: number;
  fallbackPublicationCount?: number;
  reviewPublicationCount?: number;
  reusedPublicationCount: number;
  downloadedPublicationCount: number;
  unresolvedRegressionCount?: number;
  staleAfterHours: number;
  message: string;
}

export interface SupAipManifestPublication {
  supAip: string;
  title: string;
  spatial: boolean;
  mappedGeometryCount: number;
  expectedNamedGeometryCount: number | null;
  declaredZoneCount: number | null;
  missingVerticalCount: number;
  status: string;
  partial: boolean;
  conservative: boolean;
  fallback: boolean;
  sourcePdf: string;
  sourceFingerprint?: string;
  parserVersion?: string;
}

export interface SupAipManifest {
  schemaVersion: number;
  generatedAt: string;
  parserVersion: string;
  datasetRevision: string;
  sourceUrl: string;
  publications: SupAipManifestPublication[];
}

export interface SupAipUnmappedPublication {
  supAip: string;
  title: string;
  validFrom?: string;
  validTo?: string;
  sourcePdf: string;
  reason?: string;
  status?: string;
  partial?: boolean;
  conservative?: boolean;
  fallback?: boolean;
  expectedNamedGeometryCount?: number | null;
  mappedGeometryCount?: number;
  missingVerticalCount?: number;
}

export interface SupAipUnmappedDataset {
  schemaVersion: number;
  generatedAt: string;
  parserVersion: string;
  datasetRevision: string;
  sourceUrl: string;
  publications: SupAipUnmappedPublication[];
}

export interface SupAipGeoJsonGeometry {
  type: 'Polygon' | 'MultiPolygon';
  coordinates: unknown;
}

export interface SupAipGeoJsonFeature {
  type: 'Feature';
  id?: string;
  properties: SupAipProperties;
  geometry: SupAipGeoJsonGeometry;
}

export interface SupAipGeoJson {
  type: 'FeatureCollection';
  features: SupAipGeoJsonFeature[];
}

export type SupAipBundleSource = 'server' | 'cache' | 'embedded';

export interface SupAipDatasetBundle {
  status: SupAipDatasetStatus;
  manifest: SupAipManifest;
  unmapped: SupAipUnmappedDataset;
  geoJson: SupAipGeoJson;
  source: SupAipBundleSource;
  activatedAtIso: string;
  integrityHash: string;
}

export const SUP_AIP_STATUS_PATH = '/data/supaip-status.json';
export const SUP_AIP_MANIFEST_PATH = '/data/supaip-manifest.json';
export const SUP_AIP_UNMAPPED_PATH = '/data/supaip-unmapped.json';
export const SUP_AIP_DATASET_PATH = '/data/supaip-current.geojson';
export const SUP_AIP_VERTICAL_NOTICE = 'Limites verticales non extraites - consulter le PDF SIA';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} manquant.`);
  return value.trim();
}

function requireInteger(value: unknown, label: string): number {
  if (!Number.isInteger(value) || Number(value) < 0) throw new Error(`${label} invalide.`);
  return Number(value);
}

function assertHttpsUrl(value: unknown, label: string): string {
  const url = requireString(value, label);
  if (!url.startsWith('https://')) throw new Error(`${label} doit utiliser HTTPS.`);
  return url;
}

function hasForbiddenVerticalText(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const normalized = value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  return /a\s*verifier/.test(normalized);
}

function validateCoordinateNode(value: unknown, depth = 0): void {
  if (!Array.isArray(value) || value.length === 0) throw new Error('Coordonnées SUP AIP invalides.');
  if (typeof value[0] === 'number') {
    if (value.length < 2 || !Number.isFinite(value[0]) || !Number.isFinite(value[1])) {
      throw new Error('Coordonnée SUP AIP invalide.');
    }
    const longitude = Number(value[0]);
    const latitude = Number(value[1]);
    if (longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) {
      throw new Error('Coordonnée SUP AIP hors limites.');
    }
    return;
  }
  if (depth > 5) throw new Error('Géométrie SUP AIP trop profonde.');
  value.forEach((entry) => validateCoordinateNode(entry, depth + 1));
}

export function parseSupAipStatus(value: unknown): SupAipDatasetStatus {
  if (!isRecord(value)) throw new Error('Statut SUP AIP invalide.');
  const status = value as unknown as SupAipDatasetStatus;
  if (status.schemaVersion !== 2) throw new Error(`Schéma SUP AIP non supporté (${String(status.schemaVersion)}).`);
  requireString(status.datasetRevision, 'Révision SUP AIP');
  requireString(status.generatedAt, 'Date de génération SUP AIP');
  requireString(status.parserVersion, 'Version du parseur SUP AIP');
  assertHttpsUrl(status.sourceUrl, 'Source SUP AIP');
  requireInteger(status.listingPublicationCount, 'Nombre de publications SUP AIP');
  requireInteger(status.featureCount, 'Nombre de géométries SUP AIP');
  requireInteger(status.staleAfterHours, 'Seuil de péremption SUP AIP');
  if ((status.unresolvedRegressionCount ?? 0) > 0) {
    throw new Error('La base SUP AIP signale une régression non résolue.');
  }
  return status;
}

export function validateSupAipBundle(input: {
  status: unknown;
  manifest: unknown;
  unmapped: unknown;
  geoJson: unknown;
}): Omit<SupAipDatasetBundle, 'source' | 'activatedAtIso' | 'integrityHash'> {
  const status = parseSupAipStatus(input.status);
  if (!isRecord(input.manifest) || !Array.isArray(input.manifest.publications)) {
    throw new Error('Manifest SUP AIP invalide.');
  }
  if (!isRecord(input.unmapped) || !Array.isArray(input.unmapped.publications)) {
    throw new Error('Index des SUP AIP incomplètes invalide.');
  }
  if (!isRecord(input.geoJson) || input.geoJson.type !== 'FeatureCollection' || !Array.isArray(input.geoJson.features)) {
    throw new Error('GeoJSON SUP AIP invalide.');
  }

  const manifest = input.manifest as unknown as SupAipManifest;
  const unmapped = input.unmapped as unknown as SupAipUnmappedDataset;
  const geoJson = input.geoJson as unknown as SupAipGeoJson;
  const revision = requireString(status.datasetRevision, 'Révision SUP AIP');
  if (manifest.datasetRevision !== revision || unmapped.datasetRevision !== revision) {
    throw new Error('Révisions SUP AIP incohérentes entre les fichiers.');
  }
  if (geoJson.features.length === 0 || geoJson.features.length !== status.featureCount) {
    throw new Error('Nombre de géométries SUP AIP incohérent.');
  }
  if (manifest.publications.length !== status.listingPublicationCount) {
    throw new Error('Nombre de publications SUP AIP incohérent.');
  }

  const publicationIds = new Set<string>();
  for (const publication of manifest.publications) {
    const id = requireString(publication.supAip, 'Identifiant publication SUP AIP');
    if (publicationIds.has(id)) throw new Error(`Publication SUP AIP dupliquée: ${id}.`);
    publicationIds.add(id);
    assertHttpsUrl(publication.sourcePdf, `PDF officiel SUP AIP ${id}`);
    requireString(publication.title, `Titre SUP AIP ${id}`);
  }

  const featureIds = new Set<string>();
  let verticalComplete = 0;
  let verticalMissing = 0;
  for (const feature of geoJson.features) {
    if (!feature || feature.type !== 'Feature' || !feature.properties || !feature.geometry) {
      throw new Error('Entité SUP AIP invalide.');
    }
    if (!['Polygon', 'MultiPolygon'].includes(feature.geometry.type)) {
      throw new Error(`Type de géométrie SUP AIP non supporté: ${String(feature.geometry.type)}.`);
    }
    validateCoordinateNode(feature.geometry.coordinates);
    const properties = feature.properties;
    const id = requireString(properties.id, 'Identifiant géométrie SUP AIP');
    if (featureIds.has(id)) throw new Error(`Géométrie SUP AIP dupliquée: ${id}.`);
    featureIds.add(id);
    requireString(properties.supAip, `Publication de la géométrie ${id}`);
    requireString(properties.name, `Nom de la géométrie ${id}`);
    assertHttpsUrl(properties.sourcePdf, `PDF officiel de la géométrie ${id}`);

    if (hasForbiddenVerticalText(properties.lowerLimit) || hasForbiddenVerticalText(properties.upperLimit)) {
      throw new Error(`Limites verticales interdites sur ${id}.`);
    }
    if (properties.verticalLimitsExtracted === false) {
      verticalMissing += 1;
      if (properties.verticalLimitNotice !== SUP_AIP_VERTICAL_NOTICE) {
        throw new Error(`Message de limites verticales invalide sur ${id}.`);
      }
    } else {
      verticalComplete += 1;
      requireString(properties.lowerLimit, `Plancher SUP AIP ${id}`);
      requireString(properties.upperLimit, `Plafond SUP AIP ${id}`);
    }
  }

  if (typeof status.verticalCompleteFeatureCount === 'number' && status.verticalCompleteFeatureCount !== verticalComplete) {
    throw new Error('Compteur des limites verticales extraites incohérent.');
  }
  if (typeof status.missingVerticalFeatureCount === 'number' && status.missingVerticalFeatureCount !== verticalMissing) {
    throw new Error('Compteur des limites verticales manquantes incohérent.');
  }

  return { status, manifest, unmapped, geoJson };
}

export async function hashSupAipBundle(input: {
  status: SupAipDatasetStatus;
  manifest: SupAipManifest;
  unmapped: SupAipUnmappedDataset;
  geoJson: SupAipGeoJson;
}): Promise<string> {
  const serialized = JSON.stringify(input);
  const bytes = new TextEncoder().encode(serialized);
  if (globalThis.crypto?.subtle) {
    const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(digest)].map((entry) => entry.toString(16).padStart(2, '0')).join('');
  }
  let hash = 2166136261;
  for (const byte of bytes) hash = Math.imul(hash ^ byte, 16777619);
  return `fnv-${(hash >>> 0).toString(16)}`;
}

export function supAipDatasetAgeHours(status: SupAipDatasetStatus | null, now = Date.now()): number | null {
  if (!status) return null;
  const generatedAt = Date.parse(status.generatedAt);
  if (!Number.isFinite(generatedAt)) return null;
  return Math.max(0, (now - generatedAt) / 3_600_000);
}

export function isSupAipDatasetStale(status: SupAipDatasetStatus | null, now = Date.now()): boolean {
  const ageHours = supAipDatasetAgeHours(status, now);
  return ageHours !== null && ageHours > (status?.staleAfterHours ?? 36);
}

export function formatSupAipDatasetTimestamp(value: string | null | undefined): string {
  if (!value) return 'inconnue';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'inconnue';
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Paris'
  }).format(date);
}
