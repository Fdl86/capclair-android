import type { SupAipDatasetBundle } from './supAipDataset';
import { hashSupAipBundle, validateSupAipBundle } from './supAipDataset';

const DB_NAME = 'capclair-supaip';
const STORE_NAME = 'datasets';
const ACTIVE_KEY = 'active';
const PREVIOUS_KEY = 'previous';

interface StoredSupAipBundle extends SupAipDatasetBundle {
  storedAtIso: string;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB indisponible.'));
  });
}

async function readRawBundle(key: string): Promise<unknown> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const request = transaction.objectStore(STORE_NAME).get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Lecture de la base SUP AIP impossible.'));
    transaction.oncomplete = () => db.close();
    transaction.onerror = () => {
      db.close();
      reject(transaction.error ?? new Error('Lecture de la base SUP AIP impossible.'));
    };
  });
}

function storedBundle(bundle: SupAipDatasetBundle): StoredSupAipBundle {
  return {
    ...bundle,
    source: 'cache',
    storedAtIso: new Date().toISOString()
  };
}

async function validateStoredBundle(raw: unknown): Promise<SupAipDatasetBundle | null> {
  if (!raw || typeof raw !== 'object') return null;
  const candidate = raw as Partial<StoredSupAipBundle>;
  if (!candidate.status || !candidate.manifest || !candidate.unmapped || !candidate.geoJson || !candidate.integrityHash) {
    return null;
  }
  const validated = validateSupAipBundle({
    status: candidate.status,
    manifest: candidate.manifest,
    unmapped: candidate.unmapped,
    geoJson: candidate.geoJson
  });
  const latest = candidate.latest ?? null;
  const serverValidation = candidate.serverValidation ?? null;
  const lastDeviceCheckAtIso = typeof candidate.lastDeviceCheckAtIso === 'string'
    ? candidate.lastDeviceCheckAtIso
    : null;
  const actualHash = await hashSupAipBundle({
    ...validated,
    latest,
    serverValidation,
    lastDeviceCheckAtIso
  });
  if (actualHash !== candidate.integrityHash) return null;
  return {
    ...validated,
    latest,
    serverValidation,
    source: 'cache',
    activatedAtIso: typeof candidate.activatedAtIso === 'string'
      ? candidate.activatedAtIso
      : new Date().toISOString(),
    lastDeviceCheckAtIso,
    integrityHash: actualHash
  };
}

async function deleteKey(key: string): Promise<void> {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).delete(key);
    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error ?? new Error('Suppression de la base SUP AIP impossible.'));
    };
  });
}

export async function loadCachedSupAipBundle(): Promise<SupAipDatasetBundle | null> {
  try {
    const active = await validateStoredBundle(await readRawBundle(ACTIVE_KEY));
    if (active) return active;

    await deleteKey(ACTIVE_KEY).catch(() => undefined);
    const previous = await validateStoredBundle(await readRawBundle(PREVIOUS_KEY));
    if (!previous) return null;

    await storeSupAipBundle(previous);
    return previous;
  } catch {
    return null;
  }
}

export async function storeSupAipBundle(bundle: SupAipDatasetBundle): Promise<void> {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).put(storedBundle(bundle), ACTIVE_KEY);
    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error ?? new Error('Enregistrement de la base SUP AIP impossible.'));
    };
  });
}

export async function installSupAipBundle(
  bundle: SupAipDatasetBundle,
  previous: SupAipDatasetBundle | null
): Promise<void> {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    if (previous && previous.source !== 'embedded') {
      store.put(storedBundle(previous), PREVIOUS_KEY);
    }
    store.put(storedBundle(bundle), ACTIVE_KEY);
    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error ?? new Error('Installation transactionnelle SUP AIP impossible.'));
    };
    transaction.onabort = () => {
      db.close();
      reject(transaction.error ?? new Error('Installation transactionnelle SUP AIP annulée.'));
    };
  });
}

export async function clearCachedSupAipBundle(): Promise<void> {
  try {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).delete(ACTIVE_KEY);
      transaction.objectStore(STORE_NAME).delete(PREVIOUS_KEY);
      transaction.oncomplete = () => {
        db.close();
        resolve();
      };
      transaction.onerror = () => {
        db.close();
        reject(transaction.error ?? new Error('Suppression du cache SUP AIP impossible.'));
      };
    });
  } catch {
    // Le repli embarqué reste disponible même si IndexedDB est indisponible.
  }
}
