import {
  SUP_AIP_DATASET_PATH,
  SUP_AIP_LATEST_PATH,
  SUP_AIP_MANIFEST_PATH,
  SUP_AIP_STATUS_PATH,
  SUP_AIP_UNMAPPED_PATH,
  applyLatestSupAipFreshness,
  hashSupAipBundle,
  parseSupAipLatest,
  parseSupAipStatus,
  supAipDatasetGeneratedTimestamp,
  validateSupAipBundle,
  validateSupAipRevisionManifest,
  verifySupAipTextPayload,
  type SupAipDatasetBundle,
  type SupAipDatasetStatus,
  type SupAipLatestPointer,
  type SupAipManifest,
  type SupAipServerValidation
} from './supAipDataset';
import { installSupAipBundle, loadCachedSupAipBundle, storeSupAipBundle } from './supAipStorage';
import { fetchEmbeddedJson, fetchRemoteJson, fetchRemoteText, SupAipHttpError } from './supAipTransport';

export interface SupAipSynchronizationResult {
  bundle: SupAipDatasetBundle;
  datasetChanged: boolean;
  downloaded: boolean;
  checkedAtIso: string;
}

function parseJsonText(text: string, label: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(`${label} contient un JSON invalide.`);
  }
}

async function createValidatedBundle(
  input: {
    status: unknown;
    manifest: unknown;
    unmapped: unknown;
    geoJson: unknown;
  },
  source: SupAipDatasetBundle['source'],
  options?: {
    latest?: SupAipLatestPointer | null;
    serverValidation?: SupAipServerValidation | null;
    activatedAtIso?: string;
    lastDeviceCheckAtIso?: string | null;
  }
): Promise<SupAipDatasetBundle> {
  const validated = validateSupAipBundle(input);
  const latest = options?.latest ?? null;
  const serverValidation = options?.serverValidation ?? null;
  const lastDeviceCheckAtIso = options?.lastDeviceCheckAtIso ?? null;
  const integrityHash = await hashSupAipBundle({
    ...validated,
    latest,
    serverValidation,
    lastDeviceCheckAtIso
  });
  return {
    ...validated,
    latest,
    serverValidation,
    source,
    activatedAtIso: options?.activatedAtIso ?? new Date().toISOString(),
    lastDeviceCheckAtIso,
    integrityHash
  };
}

async function refreshBundleMetadata(
  current: SupAipDatasetBundle,
  latest: SupAipLatestPointer,
  checkedAtIso: string
): Promise<SupAipDatasetBundle> {
  const status = applyLatestSupAipFreshness(current.status, latest);
  return createValidatedBundle({
    status,
    manifest: current.manifest,
    unmapped: current.unmapped,
    geoJson: current.geoJson
  }, current.source, {
    latest,
    serverValidation: current.serverValidation,
    activatedAtIso: current.activatedAtIso,
    lastDeviceCheckAtIso: checkedAtIso
  });
}

export async function loadEmbeddedSupAipBundle(signal?: AbortSignal): Promise<SupAipDatasetBundle> {
  const [status, manifest, unmapped, geoJson] = await Promise.all([
    fetchEmbeddedJson(SUP_AIP_STATUS_PATH, signal),
    fetchEmbeddedJson(SUP_AIP_MANIFEST_PATH, signal),
    fetchEmbeddedJson(SUP_AIP_UNMAPPED_PATH, signal),
    fetchEmbeddedJson(SUP_AIP_DATASET_PATH, signal)
  ]);
  return createValidatedBundle({ status, manifest, unmapped, geoJson }, 'embedded');
}

export async function loadBestLocalSupAipBundle(signal?: AbortSignal): Promise<SupAipDatasetBundle> {
  const cached = await loadCachedSupAipBundle();
  if (!cached) return loadEmbeddedSupAipBundle(signal);

  try {
    const embeddedStatus = parseSupAipStatus(await fetchEmbeddedJson(SUP_AIP_STATUS_PATH, signal));
    const embeddedTime = Date.parse(supAipDatasetGeneratedTimestamp(embeddedStatus) ?? '');
    const cachedTime = Date.parse(supAipDatasetGeneratedTimestamp(cached.status) ?? '');
    const embeddedIsNewer = embeddedStatus.datasetRevision !== cached.status.datasetRevision
      && Number.isFinite(embeddedTime)
      && (!Number.isFinite(cachedTime) || embeddedTime > cachedTime);
    if (embeddedIsNewer) return loadEmbeddedSupAipBundle(signal);
  } catch {
    // La base locale validée reste prioritaire si le secours embarqué ne peut pas être contrôlé.
  }

  return cached;
}

export async function fetchRemoteSupAipLatest(signal?: AbortSignal): Promise<SupAipLatestPointer> {
  return parseSupAipLatest(await fetchRemoteJson(SUP_AIP_LATEST_PATH, signal));
}

export async function fetchRemoteSupAipStatus(signal?: AbortSignal): Promise<SupAipDatasetStatus> {
  return parseSupAipStatus(await fetchRemoteJson(SUP_AIP_STATUS_PATH, signal));
}

async function downloadRemoteSupAipRevision(
  latest: SupAipLatestPointer,
  checkedAtIso: string,
  signal?: AbortSignal
): Promise<SupAipDatasetBundle> {
  const manifestText = await fetchRemoteText(latest.manifestUrl, signal);
  await verifySupAipTextPayload(manifestText, latest.manifestSha256, latest.manifestSize, 'manifest.json');
  const manifest = validateSupAipRevisionManifest(parseJsonText(manifestText, 'manifest.json'), latest);
  const files = manifest.files as Record<string, { sha256: string; size: number }>;
  const revisionBase = latest.manifestUrl.replace(/\/manifest\.json$/, '');

  const [statusText, unmappedText, geoJsonText] = await Promise.all([
    fetchRemoteText(`${revisionBase}/status.json`, signal),
    fetchRemoteText(`${revisionBase}/unmapped.json`, signal),
    fetchRemoteText(`${revisionBase}/data.geojson`, signal)
  ]);

  await Promise.all([
    verifySupAipTextPayload(statusText, files['status.json'].sha256, files['status.json'].size, 'status.json'),
    verifySupAipTextPayload(unmappedText, files['unmapped.json'].sha256, files['unmapped.json'].size, 'unmapped.json'),
    verifySupAipTextPayload(geoJsonText, files['data.geojson'].sha256, files['data.geojson'].size, 'data.geojson')
  ]);

  const immutableStatus = parseSupAipStatus(parseJsonText(statusText, 'status.json'));
  const status = applyLatestSupAipFreshness(immutableStatus, latest);
  const serverValidation: SupAipServerValidation = {
    manifestSha256: latest.manifestSha256,
    manifestSize: latest.manifestSize,
    geoJsonSha256: manifest.geoJsonSha256 as string,
    geoJsonSize: manifest.geoJsonSize as number
  };

  return createValidatedBundle({
    status,
    manifest,
    unmapped: parseJsonText(unmappedText, 'unmapped.json'),
    geoJson: parseJsonText(geoJsonText, 'data.geojson')
  }, 'server', {
    latest,
    serverValidation,
    lastDeviceCheckAtIso: checkedAtIso
  });
}

async function synchronizeLegacyBundle(
  current: SupAipDatasetBundle,
  signal?: AbortSignal
): Promise<SupAipSynchronizationResult> {
  const remoteStatus = await fetchRemoteSupAipStatus(signal);
  const checkedAtIso = new Date().toISOString();
  const localRevision = current.status.datasetRevision ?? '';
  const remoteRevision = remoteStatus.datasetRevision ?? '';
  if (!remoteRevision) throw new Error('Révision SUP AIP distante absente.');

  if (remoteRevision === localRevision) {
    const refreshed = await createValidatedBundle({
      status: remoteStatus,
      manifest: current.manifest,
      unmapped: current.unmapped,
      geoJson: current.geoJson
    }, current.source, {
      latest: null,
      serverValidation: current.serverValidation,
      activatedAtIso: current.activatedAtIso,
      lastDeviceCheckAtIso: checkedAtIso
    });
    await storeSupAipBundle(refreshed);
    return { bundle: refreshed, datasetChanged: false, downloaded: false, checkedAtIso };
  }

  const remoteGeneratedAt = Date.parse(supAipDatasetGeneratedTimestamp(remoteStatus) ?? '');
  const localGeneratedAt = Date.parse(supAipDatasetGeneratedTimestamp(current.status) ?? '');
  if (Number.isFinite(remoteGeneratedAt) && Number.isFinite(localGeneratedAt) && remoteGeneratedAt < localGeneratedAt) {
    throw new Error('La base SUP AIP distante est plus ancienne que la base active.');
  }

  const [manifest, unmapped, geoJson] = await Promise.all([
    fetchRemoteJson(SUP_AIP_MANIFEST_PATH, signal),
    fetchRemoteJson(SUP_AIP_UNMAPPED_PATH, signal),
    fetchRemoteJson(SUP_AIP_DATASET_PATH, signal)
  ]);
  const bundle = await createValidatedBundle({
    status: remoteStatus,
    manifest,
    unmapped,
    geoJson
  }, 'server', { lastDeviceCheckAtIso: checkedAtIso });
  await installSupAipBundle(bundle, current);
  return { bundle, datasetChanged: true, downloaded: true, checkedAtIso };
}

function isLegacyServer(error: unknown): boolean {
  return error instanceof SupAipHttpError && error.status === 404;
}

export async function synchronizeSupAipBundle(
  current: SupAipDatasetBundle,
  signal?: AbortSignal
): Promise<SupAipSynchronizationResult> {
  let latest: SupAipLatestPointer;
  try {
    latest = await fetchRemoteSupAipLatest(signal);
  } catch (error) {
    if (isLegacyServer(error)) return synchronizeLegacyBundle(current, signal);
    throw error;
  }

  const checkedAtIso = new Date().toISOString();
  const localRevision = current.status.datasetRevision ?? '';
  const datasetChanged = latest.datasetRevision !== localRevision;
  const verifiedCurrentRevision = !datasetChanged
    && current.serverValidation?.manifestSha256 === latest.manifestSha256
    && current.serverValidation?.manifestSize === latest.manifestSize
    && current.serverValidation?.geoJsonSha256
    && current.latest?.datasetRevision === latest.datasetRevision;

  if (!datasetChanged && verifiedCurrentRevision) {
    const refreshed = await refreshBundleMetadata(current, latest, checkedAtIso);
    await storeSupAipBundle(refreshed);
    return { bundle: refreshed, datasetChanged: false, downloaded: false, checkedAtIso };
  }

  if (datasetChanged) {
    const remoteGeneratedAt = Date.parse(latest.datasetGeneratedAt);
    const localGeneratedAt = Date.parse(supAipDatasetGeneratedTimestamp(current.status) ?? '');
    if (Number.isFinite(localGeneratedAt) && remoteGeneratedAt < localGeneratedAt) {
      throw new Error('La base SUP AIP distante est plus ancienne que la base active.');
    }
  }

  const bundle = await downloadRemoteSupAipRevision(latest, checkedAtIso, signal);
  if (datasetChanged) {
    await installSupAipBundle(bundle, current);
  } else {
    await storeSupAipBundle(bundle);
  }
  return { bundle, datasetChanged, downloaded: true, checkedAtIso };
}
