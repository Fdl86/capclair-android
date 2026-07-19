import fs from 'node:fs';
import path from 'node:path';
import { IDBKeyRange, indexedDB as fakeIndexedDB } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import type { SupAipDatasetBundle } from '../supAipDataset';
import { hashSupAipBundle, validateSupAipBundle } from '../supAipDataset';
import {
  clearCachedSupAipBundle,
  installSupAipBundle,
  loadCachedSupAipBundle,
  storeSupAipBundle
} from '../supAipStorage';

const root = process.cwd();

Object.defineProperty(globalThis, 'indexedDB', { value: fakeIndexedDB, configurable: true });
Object.defineProperty(globalThis, 'IDBKeyRange', { value: IDBKeyRange, configurable: true });

function readJson(fileName: string) {
  return JSON.parse(fs.readFileSync(path.join(root, 'public', 'data', fileName), 'utf8')) as any;
}

async function makeBundle(revision?: string): Promise<SupAipDatasetBundle> {
  const status = readJson('supaip-status.json');
  const manifest = readJson('supaip-manifest.json');
  const unmapped = readJson('supaip-unmapped.json');
  const geoJson = readJson('supaip-current.geojson');
  if (revision) {
    status.datasetRevision = revision;
    manifest.datasetRevision = revision;
    unmapped.datasetRevision = revision;
    geoJson.datasetRevision = revision;
    status.generatedAt = '2026-07-20T00:00:00.000Z';
    status.datasetGeneratedAt = status.generatedAt;
    manifest.generatedAt = status.generatedAt;
    manifest.datasetGeneratedAt = status.generatedAt;
    unmapped.generatedAt = status.generatedAt;
    unmapped.datasetGeneratedAt = status.generatedAt;
    geoJson.generatedAt = status.generatedAt;
    geoJson.datasetGeneratedAt = status.generatedAt;
  }
  const validated = validateSupAipBundle({ status, manifest, unmapped, geoJson });
  const base = {
    ...validated,
    latest: null,
    serverValidation: null,
    source: 'cache' as const,
    activatedAtIso: '2026-07-20T00:00:00.000Z',
    lastDeviceCheckAtIso: null
  };
  return {
    ...base,
    integrityHash: await hashSupAipBundle(base)
  };
}

async function overwriteActive(value: unknown): Promise<void> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('capclair-supaip', 1);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction('datasets', 'readwrite');
    transaction.objectStore('datasets').put(value, 'active');
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  db.close();
}

beforeEach(async () => {
  await clearCachedSupAipBundle();
});

describe('SUP AIP local active and previous databases', () => {
  it('installs a new revision atomically while retaining the previous valid revision', async () => {
    const previous = await makeBundle();
    const active = await makeBundle('f'.repeat(64));
    await storeSupAipBundle(previous);
    await installSupAipBundle(active, previous);

    const loaded = await loadCachedSupAipBundle();
    expect(loaded?.status.datasetRevision).toBe('f'.repeat(64));
  });

  it('rejects a corrupted active entry and automatically restores the previous valid revision', async () => {
    const previous = await makeBundle();
    const active = await makeBundle('e'.repeat(64));
    await installSupAipBundle(active, previous);
    await overwriteActive({ ...active, integrityHash: 'tampered' });

    const recovered = await loadCachedSupAipBundle();
    expect(recovered?.status.datasetRevision).toBe(previous.status.datasetRevision);
    expect(recovered?.source).toBe('cache');

    const persistedRecovery = await loadCachedSupAipBundle();
    expect(persistedRecovery?.status.datasetRevision).toBe(previous.status.datasetRevision);
  });
});
