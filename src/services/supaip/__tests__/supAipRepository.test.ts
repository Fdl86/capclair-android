import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  SupAipDatasetBundle,
  SupAipDatasetStatus,
  SupAipGeoJson,
  SupAipLatestPointer,
  SupAipManifest,
  SupAipUnmappedDataset
} from '../supAipDataset';
import { hashSupAipBundle, sha256Text, utf8TextSize, validateSupAipBundle } from '../supAipDataset';

const transport = vi.hoisted(() => ({
  fetchEmbeddedJson: vi.fn(),
  fetchRemoteJson: vi.fn(),
  fetchRemoteText: vi.fn()
}));
const storage = vi.hoisted(() => ({
  installSupAipBundle: vi.fn(),
  loadCachedSupAipBundle: vi.fn(),
  storeSupAipBundle: vi.fn()
}));

vi.mock('../supAipTransport', () => {
  class SupAipHttpError extends Error {
    status: number;
    constructor(status: number, url: string) {
      super(`HTTP ${status} sur ${url}`);
      this.status = status;
    }
  }
  return { ...transport, SupAipHttpError };
});
vi.mock('../supAipStorage', () => storage);

import { synchronizeSupAipBundle } from '../supAipRepository';

const REV_A = 'a'.repeat(64);
const REV_B = 'b'.repeat(64);
const BUSINESS_A = 'c'.repeat(64);
const BUSINESS_B = 'd'.repeat(64);

function feature() {
  return {
    type: 'Feature' as const,
    id: 'test-zone',
    properties: {
      id: 'test-zone',
      name: 'ZRT TEST',
      zoneType: 'ZRT',
      supAip: '001/26',
      title: 'SUP AIP test',
      validFrom: '2026-07-19T00:00:00Z',
      validTo: '2026-07-20T00:00:00Z',
      activationMode: 'published' as const,
      activationText: 'Publié',
      lowerLimit: 'SFC',
      upperLimit: 'FL 095',
      sourcePdf: 'https://www.sia.aviation-civile.gouv.fr/test.pdf',
      verticalLimitsExtracted: true
    },
    geometry: {
      type: 'Polygon' as const,
      coordinates: [[[0, 45], [1, 45], [1, 46], [0, 45]]]
    }
  };
}

function status(revision: string, business: string, generatedAt: string): SupAipDatasetStatus {
  return {
    schemaVersion: 2,
    mode: 'automatic',
    beta: true,
    generatedAt,
    datasetGeneratedAt: generatedAt,
    sourceUrl: 'https://www.sia.aviation-civile.gouv.fr/documents/supaip/aip/id/6',
    parserVersion: 'test-parser',
    datasetRevision: revision,
    businessContentSha256: business,
    listingPublicationCount: 1,
    zonalPublicationCount: 1,
    mappedPublicationCount: 1,
    featureCount: 1,
    verticalCompleteFeatureCount: 1,
    missingVerticalFeatureCount: 0,
    unmappedPublicationCount: 0,
    completeUnmappedPublicationCount: 0,
    partialPublicationCount: 0,
    reusedPublicationCount: 1,
    downloadedPublicationCount: 0,
    unresolvedRegressionCount: 0,
    staleAfterHours: 36,
    message: 'test'
  };
}

function baseManifest(revision: string, business: string, generatedAt: string): SupAipManifest {
  return {
    schemaVersion: 2,
    generatedAt,
    datasetGeneratedAt: generatedAt,
    parserVersion: 'test-parser',
    datasetRevision: revision,
    businessContentSha256: business,
    sourceUrl: 'https://www.sia.aviation-civile.gouv.fr/documents/supaip/aip/id/6',
    featureCount: 1,
    publicationCount: 1,
    publicationsWithGeometry: 1,
    featuresWithVerticalLimits: 1,
    featuresWithoutVerticalLimits: 0,
    publications: [{
      supAip: '001/26',
      title: 'SUP AIP test',
      spatial: true,
      mappedGeometryCount: 1,
      expectedNamedGeometryCount: 1,
      declaredZoneCount: 1,
      missingVerticalCount: 0,
      status: 'complete',
      partial: false,
      conservative: false,
      fallback: false,
      sourcePdf: 'https://www.sia.aviation-civile.gouv.fr/test.pdf'
    }]
  };
}

async function revisionPayload(revision: string, business: string, generatedAt: string, checkedAt: string) {
  const statusValue = status(revision, business, generatedAt);
  const unmapped: SupAipUnmappedDataset = {
    schemaVersion: 2,
    generatedAt,
    datasetGeneratedAt: generatedAt,
    parserVersion: 'test-parser',
    datasetRevision: revision,
    businessContentSha256: business,
    sourceUrl: statusValue.sourceUrl,
    publications: []
  };
  const geoJson: SupAipGeoJson = {
    type: 'FeatureCollection',
    generatedAt,
    datasetGeneratedAt: generatedAt,
    datasetRevision: revision,
    businessContentSha256: business,
    features: [feature()]
  };
  const statusText = `${JSON.stringify(statusValue, null, 2)}\n`;
  const unmappedText = `${JSON.stringify(unmapped, null, 2)}\n`;
  const geoJsonText = `${JSON.stringify(geoJson, null, 2)}\n`;
  const manifest = baseManifest(revision, business, generatedAt);
  manifest.geoJsonSha256 = await sha256Text(geoJsonText);
  manifest.geoJsonSize = utf8TextSize(geoJsonText);
  manifest.files = {
    'data.geojson': { sha256: manifest.geoJsonSha256, size: manifest.geoJsonSize },
    'status.json': { sha256: await sha256Text(statusText), size: utf8TextSize(statusText) },
    'unmapped.json': { sha256: await sha256Text(unmappedText), size: utf8TextSize(unmappedText) }
  };
  const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
  const latest: SupAipLatestPointer = {
    schemaVersion: 2,
    datasetRevision: revision,
    datasetGeneratedAt: generatedAt,
    lastSuccessfulCheckAt: checkedAt,
    staleAfterHours: 36,
    checkMode: 'listing-reuse',
    manifestUrl: `/data/supaip/revisions/${revision}/manifest.json`,
    manifestSha256: await sha256Text(manifestText),
    manifestSize: utf8TextSize(manifestText),
    businessContentSha256: business
  };
  return { latest, statusText, unmappedText, geoJsonText, manifestText, manifest, unmapped, geoJson, statusValue };
}

async function bundleFromPayload(payload: Awaited<ReturnType<typeof revisionPayload>>): Promise<SupAipDatasetBundle> {
  const validated = validateSupAipBundle({
    status: { ...payload.statusValue, lastSuccessfulCheckAt: payload.latest.lastSuccessfulCheckAt },
    manifest: payload.manifest,
    unmapped: payload.unmapped,
    geoJson: payload.geoJson
  });
  const serverValidation = {
    manifestSha256: payload.latest.manifestSha256,
    manifestSize: payload.latest.manifestSize,
    geoJsonSha256: payload.manifest.geoJsonSha256 as string,
    geoJsonSize: payload.manifest.geoJsonSize as number
  };
  const base = {
    ...validated,
    latest: payload.latest,
    serverValidation,
    source: 'cache' as const,
    activatedAtIso: payload.latest.datasetGeneratedAt,
    lastDeviceCheckAtIso: payload.latest.lastSuccessfulCheckAt
  };
  return { ...base, integrityHash: await hashSupAipBundle(base) };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('SUP AIP immutable revision synchronization', () => {
  it('updates only freshness metadata when the verified revision is unchanged', async () => {
    const oldPayload = await revisionPayload(REV_A, BUSINESS_A, '2026-07-19T10:00:00Z', '2026-07-19T12:00:00Z');
    const current = await bundleFromPayload(oldPayload);
    const freshLatest = {
      ...oldPayload.latest,
      lastSuccessfulCheckAt: '2026-07-19T18:00:00Z',
      checkMode: 'listing-reuse'
    };
    transport.fetchRemoteJson.mockResolvedValue(freshLatest);

    const result = await synchronizeSupAipBundle(current);

    expect(result.datasetChanged).toBe(false);
    expect(result.downloaded).toBe(false);
    expect(result.bundle.status.lastSuccessfulCheckAt).toBe(freshLatest.lastSuccessfulCheckAt);
    expect(transport.fetchRemoteText).not.toHaveBeenCalled();
    expect(storage.storeSupAipBundle).toHaveBeenCalledTimes(1);
    expect(storage.installSupAipBundle).not.toHaveBeenCalled();
  });

  it('downloads, verifies and transactionally installs a new immutable revision', async () => {
    const currentPayload = await revisionPayload(REV_A, BUSINESS_A, '2026-07-19T10:00:00Z', '2026-07-19T12:00:00Z');
    const current = await bundleFromPayload(currentPayload);
    const next = await revisionPayload(REV_B, BUSINESS_B, '2026-07-19T19:00:00Z', '2026-07-19T19:30:00Z');
    transport.fetchRemoteJson.mockResolvedValue(next.latest);
    const base = `/data/supaip/revisions/${REV_B}`;
    transport.fetchRemoteText.mockImplementation(async (path: string) => ({
      [`${base}/manifest.json`]: next.manifestText,
      [`${base}/status.json`]: next.statusText,
      [`${base}/unmapped.json`]: next.unmappedText,
      [`${base}/data.geojson`]: next.geoJsonText
    })[path]);

    const result = await synchronizeSupAipBundle(current);

    expect(result.datasetChanged).toBe(true);
    expect(result.downloaded).toBe(true);
    expect(result.bundle.status.datasetRevision).toBe(REV_B);
    expect(result.bundle.serverValidation?.manifestSha256).toBe(next.latest.manifestSha256);
    expect(storage.installSupAipBundle).toHaveBeenCalledWith(result.bundle, current);
    expect(storage.storeSupAipBundle).not.toHaveBeenCalled();
  });

  it('keeps the active database untouched when a downloaded payload fails SHA-256 validation', async () => {
    const currentPayload = await revisionPayload(REV_A, BUSINESS_A, '2026-07-19T10:00:00Z', '2026-07-19T12:00:00Z');
    const current = await bundleFromPayload(currentPayload);
    const next = await revisionPayload(REV_B, BUSINESS_B, '2026-07-19T19:00:00Z', '2026-07-19T19:30:00Z');
    transport.fetchRemoteJson.mockResolvedValue(next.latest);
    const base = `/data/supaip/revisions/${REV_B}`;
    transport.fetchRemoteText.mockImplementation(async (path: string) => ({
      [`${base}/manifest.json`]: next.manifestText,
      [`${base}/status.json`]: next.statusText,
      [`${base}/unmapped.json`]: next.unmappedText,
      [`${base}/data.geojson`]: `${next.geoJsonText}tampered`
    })[path]);

    await expect(synchronizeSupAipBundle(current)).rejects.toThrow(/Taille de data\.geojson incorrecte/);
    expect(storage.installSupAipBundle).not.toHaveBeenCalled();
    expect(storage.storeSupAipBundle).not.toHaveBeenCalled();
  });
});
