import {
  SUP_AIP_DATASET_PATH,
  SUP_AIP_MANIFEST_PATH,
  SUP_AIP_STATUS_PATH,
  SUP_AIP_UNMAPPED_PATH,
  hashSupAipBundle,
  parseSupAipStatus,
  validateSupAipBundle,
  type SupAipDatasetBundle,
  type SupAipDatasetStatus
} from './supAipDataset';
import { loadCachedSupAipBundle, storeSupAipBundle } from './supAipStorage';
import { fetchEmbeddedJson, fetchRemoteJson } from './supAipTransport';

async function createValidatedBundle(
  input: {
    status: unknown;
    manifest: unknown;
    unmapped: unknown;
    geoJson: unknown;
  },
  source: SupAipDatasetBundle['source']
): Promise<SupAipDatasetBundle> {
  const validated = validateSupAipBundle(input);
  const integrityHash = await hashSupAipBundle(validated);
  return {
    ...validated,
    source,
    activatedAtIso: new Date().toISOString(),
    integrityHash
  };
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
    const embeddedTime = Date.parse(embeddedStatus.generatedAt);
    const cachedTime = Date.parse(cached.status.generatedAt);
    const embeddedIsNewer = embeddedStatus.datasetRevision !== cached.status.datasetRevision
      && Number.isFinite(embeddedTime)
      && (!Number.isFinite(cachedTime) || embeddedTime > cachedTime);
    if (embeddedIsNewer) return loadEmbeddedSupAipBundle(signal);
  } catch {
    // Le cache validé reste prioritaire si le secours embarqué ne peut pas être contrôlé.
  }

  return cached;
}

export async function fetchRemoteSupAipStatus(signal?: AbortSignal): Promise<SupAipDatasetStatus> {
  return parseSupAipStatus(await fetchRemoteJson(SUP_AIP_STATUS_PATH, signal));
}

export async function downloadRemoteSupAipBundle(
  expectedStatus: SupAipDatasetStatus,
  signal?: AbortSignal
): Promise<SupAipDatasetBundle> {
  const [manifest, unmapped, geoJson] = await Promise.all([
    fetchRemoteJson(SUP_AIP_MANIFEST_PATH, signal),
    fetchRemoteJson(SUP_AIP_UNMAPPED_PATH, signal),
    fetchRemoteJson(SUP_AIP_DATASET_PATH, signal)
  ]);
  const bundle = await createValidatedBundle({
    status: expectedStatus,
    manifest,
    unmapped,
    geoJson
  }, 'server');
  await storeSupAipBundle(bundle);
  return bundle;
}

export async function synchronizeSupAipBundle(
  current: SupAipDatasetBundle,
  signal?: AbortSignal
): Promise<{ bundle: SupAipDatasetBundle; changed: boolean; checkedAtIso: string }> {
  const remoteStatus = await fetchRemoteSupAipStatus(signal);
  const checkedAtIso = new Date().toISOString();
  const localRevision = current.status.datasetRevision ?? '';
  const remoteRevision = remoteStatus.datasetRevision ?? '';
  if (!remoteRevision) throw new Error('Révision SUP AIP distante absente.');
  if (remoteRevision === localRevision) return { bundle: current, changed: false, checkedAtIso };

  const remoteGeneratedAt = Date.parse(remoteStatus.generatedAt);
  const localGeneratedAt = Date.parse(current.status.generatedAt);
  if (Number.isFinite(remoteGeneratedAt) && Number.isFinite(localGeneratedAt) && remoteGeneratedAt < localGeneratedAt) {
    throw new Error('La base SUP AIP distante est plus ancienne que la base active.');
  }

  const bundle = await downloadRemoteSupAipBundle(remoteStatus, signal);
  return { bundle, changed: true, checkedAtIso };
}
