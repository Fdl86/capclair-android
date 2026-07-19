import type { SupAipProperties } from '../../domain/supaip.types';

export interface SupAipDatasetStatus {
  schemaVersion: number;
  mode: 'bootstrap' | 'automatic';
  beta: boolean;
  generatedAt: string;
  datasetGeneratedAt?: string;
  lastSuccessfulCheckAt?: string;
  checkMode?: string;
  sourceUpdatedAt?: string | null;
  sourceUrl: string;
  parserVersion: string;
  datasetRevision?: string;
  businessContentSha256?: string;
  manifestUrl?: string;
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

export interface SupAipLatestPointer {
  schemaVersion: number;
  datasetRevision: string;
  datasetGeneratedAt: string;
  lastSuccessfulCheckAt: string;
  staleAfterHours: number;
  checkMode: string;
  manifestUrl: string;
  manifestSha256: string;
  manifestSize: number;
  businessContentSha256: string;
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

export interface SupAipManifestFile {
  sha256: string;
  size: number;
}

export interface SupAipManifest {
  schemaVersion: number;
  generatedAt: string;
  datasetGeneratedAt?: string;
  parserVersion: string;
  datasetRevision: string;
  businessContentSha256?: string;
  sourceUrl: string;
  featureCount?: number;
  publicationCount?: number;
  publicationsWithGeometry?: number;
  featuresWithVerticalLimits?: number;
  featuresWithoutVerticalLimits?: number;
  geoJsonSha256?: string;
  geoJsonSize?: number;
  files?: Record<string, SupAipManifestFile>;
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
  datasetGeneratedAt?: string;
  parserVersion: string;
  datasetRevision: string;
  businessContentSha256?: string;
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
  generatedAt?: string;
  datasetGeneratedAt?: string;
  datasetRevision?: string;
  businessContentSha256?: string;
  features: SupAipGeoJsonFeature[];
}

export interface SupAipServerValidation {
  manifestSha256: string;
  manifestSize: number;
  geoJsonSha256: string;
  geoJsonSize: number;
}

export type SupAipBundleSource = 'server' | 'cache' | 'embedded';

export interface SupAipDatasetBundle {
  status: SupAipDatasetStatus;
  manifest: SupAipManifest;
  unmapped: SupAipUnmappedDataset;
  geoJson: SupAipGeoJson;
  latest: SupAipLatestPointer | null;
  serverValidation: SupAipServerValidation | null;
  source: SupAipBundleSource;
  activatedAtIso: string;
  lastDeviceCheckAtIso: string | null;
  integrityHash: string;
}

export const SUP_AIP_LATEST_PATH = '/data/supaip/latest.json';
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

function requireIsoDate(value: unknown, label: string): string {
  const text = requireString(value, label);
  if (!Number.isFinite(Date.parse(text))) throw new Error(`${label} invalide.`);
  return text;
}

function requireSha256(value: unknown, label: string): string {
  const text = requireString(value, label).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(text)) throw new Error(`${label} invalide.`);
  return text;
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

function validateRevisionPath(path: string, revision: string): void {
  const expected = `/data/supaip/revisions/${revision}/manifest.json`;
  if (path !== expected) throw new Error('Chemin du manifeste SUP AIP inattendu.');
}

export function parseSupAipLatest(value: unknown): SupAipLatestPointer {
  if (!isRecord(value)) throw new Error('Pointeur SUP AIP invalide.');
  const latest = value as unknown as SupAipLatestPointer;
  if (latest.schemaVersion !== 2) throw new Error(`Schéma SUP AIP non supporté (${String(latest.schemaVersion)}).`);
  const revision = requireSha256(latest.datasetRevision, 'Révision SUP AIP');
  requireIsoDate(latest.datasetGeneratedAt, 'Date métier SUP AIP');
  requireIsoDate(latest.lastSuccessfulCheckAt, 'Dernier contrôle SIA');
  requireInteger(latest.staleAfterHours, 'Seuil de péremption SUP AIP');
  requireString(latest.checkMode, 'Mode de contrôle SUP AIP');
  validateRevisionPath(requireString(latest.manifestUrl, 'URL du manifeste SUP AIP'), revision);
  requireSha256(latest.manifestSha256, 'Empreinte du manifeste SUP AIP');
  if (requireInteger(latest.manifestSize, 'Taille du manifeste SUP AIP') === 0) {
    throw new Error('Taille du manifeste SUP AIP invalide.');
  }
  requireSha256(latest.businessContentSha256, 'Empreinte métier SUP AIP');
  return latest;
}

export function parseSupAipStatus(value: unknown): SupAipDatasetStatus {
  if (!isRecord(value)) throw new Error('Statut SUP AIP invalide.');
  const status = value as unknown as SupAipDatasetStatus;
  if (status.schemaVersion !== 2) throw new Error(`Schéma SUP AIP non supporté (${String(status.schemaVersion)}).`);
  requireString(status.datasetRevision, 'Révision SUP AIP');
  requireIsoDate(status.generatedAt, 'Date de génération SUP AIP');
  if (status.datasetGeneratedAt) requireIsoDate(status.datasetGeneratedAt, 'Date métier SUP AIP');
  if (status.lastSuccessfulCheckAt) requireIsoDate(status.lastSuccessfulCheckAt, 'Dernier contrôle SIA');
  if (status.businessContentSha256) requireSha256(status.businessContentSha256, 'Empreinte métier SUP AIP');
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

export function applyLatestSupAipFreshness(
  status: SupAipDatasetStatus,
  latest: SupAipLatestPointer
): SupAipDatasetStatus {
  if (status.datasetRevision !== latest.datasetRevision) {
    throw new Error('Révision du statut SUP AIP incompatible avec le pointeur serveur.');
  }
  return {
    ...status,
    datasetGeneratedAt: latest.datasetGeneratedAt,
    lastSuccessfulCheckAt: latest.lastSuccessfulCheckAt,
    staleAfterHours: latest.staleAfterHours,
    checkMode: latest.checkMode,
    manifestUrl: latest.manifestUrl,
    businessContentSha256: latest.businessContentSha256
  };
}

export function validateSupAipRevisionManifest(
  value: unknown,
  latest: SupAipLatestPointer
): SupAipManifest {
  if (!isRecord(value) || !Array.isArray(value.publications)) {
    throw new Error('Manifest SUP AIP invalide.');
  }
  const manifest = value as unknown as SupAipManifest;
  if (manifest.schemaVersion !== 2) throw new Error('Schéma du manifeste SUP AIP non supporté.');
  if (manifest.datasetRevision !== latest.datasetRevision) throw new Error('Révision du manifeste SUP AIP incohérente.');
  if (requireIsoDate(manifest.datasetGeneratedAt ?? manifest.generatedAt, 'Date métier du manifeste SUP AIP') !== latest.datasetGeneratedAt) {
    throw new Error('Date métier du manifeste SUP AIP incohérente.');
  }
  if (manifest.businessContentSha256 !== latest.businessContentSha256) {
    throw new Error('Empreinte métier du manifeste SUP AIP incohérente.');
  }
  requireInteger(manifest.featureCount, 'Nombre de géométries du manifeste SUP AIP');
  requireInteger(manifest.publicationCount, 'Nombre de publications du manifeste SUP AIP');
  requireInteger(manifest.publicationsWithGeometry, 'Nombre de publications cartographiées');
  requireInteger(manifest.featuresWithVerticalLimits, 'Nombre de limites verticales extraites');
  requireInteger(manifest.featuresWithoutVerticalLimits, 'Nombre de limites verticales manquantes');
  requireSha256(manifest.geoJsonSha256, 'Empreinte GeoJSON SUP AIP');
  if (requireInteger(manifest.geoJsonSize, 'Taille GeoJSON SUP AIP') === 0) throw new Error('Taille GeoJSON SUP AIP invalide.');
  if (!isRecord(manifest.files)) throw new Error('Index de fichiers du manifeste SUP AIP absent.');
  for (const fileName of ['data.geojson', 'status.json', 'unmapped.json']) {
    const file = manifest.files[fileName];
    if (!isRecord(file)) throw new Error(`Métadonnées de ${fileName} absentes.`);
    requireSha256(file.sha256, `Empreinte de ${fileName}`);
    if (requireInteger(file.size, `Taille de ${fileName}`) === 0) throw new Error(`Taille de ${fileName} invalide.`);
  }
  if (manifest.files['data.geojson'].sha256 !== manifest.geoJsonSha256
    || manifest.files['data.geojson'].size !== manifest.geoJsonSize) {
    throw new Error('Métadonnées GeoJSON incohérentes dans le manifeste SUP AIP.');
  }
  return manifest;
}

export function validateSupAipBundle(input: {
  status: unknown;
  manifest: unknown;
  unmapped: unknown;
  geoJson: unknown;
}): Omit<SupAipDatasetBundle, 'latest' | 'serverValidation' | 'source' | 'activatedAtIso' | 'lastDeviceCheckAtIso' | 'integrityHash'> {
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
  if (geoJson.datasetRevision && geoJson.datasetRevision !== revision) {
    throw new Error('Révision GeoJSON SUP AIP incohérente.');
  }
  if (geoJson.features.length === 0 || geoJson.features.length !== status.featureCount) {
    throw new Error('Nombre de géométries SUP AIP incohérent.');
  }
  if (manifest.publications.length !== status.listingPublicationCount) {
    throw new Error('Nombre de publications SUP AIP incohérent.');
  }
  if (typeof manifest.featureCount === 'number' && manifest.featureCount !== geoJson.features.length) {
    throw new Error('Compteur de géométries du manifeste SUP AIP incohérent.');
  }
  if (typeof manifest.publicationCount === 'number' && manifest.publicationCount !== manifest.publications.length) {
    throw new Error('Compteur de publications du manifeste SUP AIP incohérent.');
  }

  const businessHashes = [
    status.businessContentSha256,
    manifest.businessContentSha256,
    unmapped.businessContentSha256,
    geoJson.businessContentSha256
  ].filter((value): value is string => Boolean(value));
  if (new Set(businessHashes).size > 1) throw new Error('Empreintes métier SUP AIP incohérentes.');

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
  if (typeof manifest.featuresWithVerticalLimits === 'number' && manifest.featuresWithVerticalLimits !== verticalComplete) {
    throw new Error('Compteur vertical du manifeste SUP AIP incohérent.');
  }
  if (typeof manifest.featuresWithoutVerticalLimits === 'number' && manifest.featuresWithoutVerticalLimits !== verticalMissing) {
    throw new Error('Compteur vertical incomplet du manifeste SUP AIP incohérent.');
  }

  return { status, manifest, unmapped, geoJson };
}

export function supAipBundleIntegrityInput(input: {
  status: SupAipDatasetStatus;
  manifest: SupAipManifest;
  unmapped: SupAipUnmappedDataset;
  geoJson: SupAipGeoJson;
  latest?: SupAipLatestPointer | null;
  serverValidation?: SupAipServerValidation | null;
  lastDeviceCheckAtIso?: string | null;
}): Record<string, unknown> {
  const result: Record<string, unknown> = {
    status: input.status,
    manifest: input.manifest,
    unmapped: input.unmapped,
    geoJson: input.geoJson
  };
  if (input.latest) result.latest = input.latest;
  if (input.serverValidation) result.serverValidation = input.serverValidation;
  if (input.lastDeviceCheckAtIso) result.lastDeviceCheckAtIso = input.lastDeviceCheckAtIso;
  return result;
}

export async function sha256Text(value: string): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error('Vérification SHA-256 indisponible sur cet appareil.');
  const bytes = new TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((entry) => entry.toString(16).padStart(2, '0')).join('');
}

export function utf8TextSize(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

export async function verifySupAipTextPayload(
  text: string,
  expectedSha256: string,
  expectedSize: number,
  label: string
): Promise<void> {
  if (utf8TextSize(text) !== expectedSize) throw new Error(`Taille de ${label} incorrecte.`);
  if (await sha256Text(text) !== expectedSha256.toLowerCase()) throw new Error(`Empreinte SHA-256 de ${label} incorrecte.`);
}

export async function hashSupAipBundle(input: {
  status: SupAipDatasetStatus;
  manifest: SupAipManifest;
  unmapped: SupAipUnmappedDataset;
  geoJson: SupAipGeoJson;
  latest?: SupAipLatestPointer | null;
  serverValidation?: SupAipServerValidation | null;
  lastDeviceCheckAtIso?: string | null;
}): Promise<string> {
  const serialized = JSON.stringify(supAipBundleIntegrityInput(input));
  const bytes = new TextEncoder().encode(serialized);
  if (globalThis.crypto?.subtle) {
    const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(digest)].map((entry) => entry.toString(16).padStart(2, '0')).join('');
  }
  let hash = 2166136261;
  for (const byte of bytes) hash = Math.imul(hash ^ byte, 16777619);
  return `fnv-${(hash >>> 0).toString(16)}`;
}

export function supAipDatasetReferenceTimestamp(status: SupAipDatasetStatus | null): string | null {
  return status?.lastSuccessfulCheckAt
    ?? status?.datasetGeneratedAt
    ?? status?.generatedAt
    ?? null;
}

export function supAipDatasetGeneratedTimestamp(status: SupAipDatasetStatus | null): string | null {
  return status?.datasetGeneratedAt ?? status?.generatedAt ?? null;
}

export function supAipDatasetAgeHours(status: SupAipDatasetStatus | null, now = Date.now()): number | null {
  const reference = supAipDatasetReferenceTimestamp(status);
  if (!reference) return null;
  const timestamp = Date.parse(reference);
  if (!Number.isFinite(timestamp)) return null;
  return Math.max(0, (now - timestamp) / 3_600_000);
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
