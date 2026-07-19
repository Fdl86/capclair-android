import type { SupAipDatasetBundle } from './supAipDataset';
import { hashSupAipBundle, validateSupAipBundle } from './supAipDataset';

const DB_NAME = 'capclair-supaip';
const STORE_NAME = 'datasets';
const ENTRY_KEY = 'active';

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

async function readRawBundle(): Promise<unknown> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const request = transaction.objectStore(STORE_NAME).get(ENTRY_KEY);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Lecture du cache SUP AIP impossible.'));
    transaction.oncomplete = () => db.close();
    transaction.onerror = () => {
      db.close();
      reject(transaction.error ?? new Error('Lecture du cache SUP AIP impossible.'));
    };
  });
}

export async function loadCachedSupAipBundle(): Promise<SupAipDatasetBundle | null> {
  try {
    const raw = await readRawBundle();
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
    const actualHash = await hashSupAipBundle(validated);
    if (actualHash !== candidate.integrityHash) {
      await clearCachedSupAipBundle();
      return null;
    }
    return {
      ...validated,
      source: 'cache',
      activatedAtIso: typeof candidate.activatedAtIso === 'string'
        ? candidate.activatedAtIso
        : new Date().toISOString(),
      integrityHash: actualHash
    };
  } catch {
    return null;
  }
}

export async function storeSupAipBundle(bundle: SupAipDatasetBundle): Promise<void> {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const stored: StoredSupAipBundle = {
      ...bundle,
      source: 'cache',
      storedAtIso: new Date().toISOString()
    };
    transaction.objectStore(STORE_NAME).put(stored, ENTRY_KEY);
    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error ?? new Error('Enregistrement du cache SUP AIP impossible.'));
    };
  });
}

export async function clearCachedSupAipBundle(): Promise<void> {
  try {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).delete(ENTRY_KEY);
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
