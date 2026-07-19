import type { PibAnalysis } from '../../domain/notam.types';

const DB_NAME = 'capclair-notam-pib';
const STORE_NAME = 'briefings';
const ENTRY_KEY = 'latest';
const FALLBACK_KEY = 'capclair.notamPib.latest.v1';


function validStoredBriefing(value: unknown): value is PibAnalysis {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<PibAnalysis>;
  return candidate.schemaVersion === 1
    && typeof candidate.id === 'string'
    && typeof candidate.rawText === 'string'
    && Array.isArray(candidate.notams)
    && Array.isArray(candidate.reconciliations);
}

function storedOrNull(value: unknown) {
  return validStoredBriefing(value) ? value : null;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function loadStoredBriefing(): Promise<PibAnalysis | null> {
  try {
    const db = await openDatabase();
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const request = transaction.objectStore(STORE_NAME).get(ENTRY_KEY);
      request.onsuccess = () => resolve(storedOrNull(request.result));
      request.onerror = () => reject(request.error);
      transaction.oncomplete = () => db.close();
    });
  } catch {
    try {
      const raw = localStorage.getItem(FALLBACK_KEY);
      return raw ? storedOrNull(JSON.parse(raw)) : null;
    } catch {
      return null;
    }
  }
}

export async function storeBriefing(analysis: PibAnalysis): Promise<void> {
  try {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).put(analysis, ENTRY_KEY);
      transaction.oncomplete = () => { db.close(); resolve(); };
      transaction.onerror = () => reject(transaction.error);
    });
  } catch {
    localStorage.setItem(FALLBACK_KEY, JSON.stringify(analysis));
  }
}

export async function clearStoredBriefing(): Promise<void> {
  localStorage.removeItem(FALLBACK_KEY);
  try {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).delete(ENTRY_KEY);
      transaction.oncomplete = () => { db.close(); resolve(); };
      transaction.onerror = () => reject(transaction.error);
    });
  } catch {
    // Le stockage de secours est déjà supprimé.
  }
}
