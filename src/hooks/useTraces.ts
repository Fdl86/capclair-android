import { useEffect, useRef, useState } from 'react';
import type { Trace } from '../domain/trace.types';
import { recoverNativeTraces, markNativeSessionDeleted, markNativeSessionSaved } from '../services/gps/nativeGpsSession';
import { readJson, writeJson } from '../services/storage/localStorageService';
import { persistTraceCollection } from '../services/traces/traceCollection';

const STORAGE_KEY = 'capclair.traces';
const MAX_SAVED_TRACES = 20;

function uniqueTraces(traces: Trace[]): Trace[] {
  const seen = new Set<string>();
  return traces.filter((trace) => {
    const key = trace.sessionId ? `session:${trace.sessionId}` : `trace:${trace.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function useTraces() {
  const [traces, setTraces] = useState<Trace[]>(() => readJson<Trace[]>(STORAGE_KEY, []));
  const tracesRef = useRef(traces);
  const [storageError, setStorageError] = useState<string | null>(null);

  const persist = (next: Trace[]): boolean => {
    const unique = uniqueTraces(next);
    const result = persistTraceCollection(unique, MAX_SAVED_TRACES, (candidate) => writeJson(STORAGE_KEY, candidate));

    if (!result.success) {
      setStorageError('Sauvegarde locale impossible. Le journal natif reste conservé pour récupération.');
      return false;
    }

    tracesRef.current = result.saved;
    setTraces(result.saved);
    setStorageError(
      result.discardedCount > 0
        ? `${result.discardedCount} ancienne(s) trace(s) retirée(s) du stockage rapide. Les journaux natifs récents restent récupérables.`
        : null
    );
    return true;
  };

  const saveTrace = async (trace: Trace): Promise<boolean> => {
    if (trace.positions.length < 2) return false;
    const next = [trace, ...tracesRef.current.filter((item) => item.id !== trace.id)];
    const persisted = persist(next);
    if (!persisted) return false;
    const nativeConfirmed = await markNativeSessionSaved(trace.sessionId, trace.id);
    if (!nativeConfirmed) {
      setStorageError('Trace sauvegardée dans l’app, mais validation du journal natif impossible.');
    }
    return true;
  };

  const deleteTrace = async (traceId: string): Promise<boolean> => {
    const trace = tracesRef.current.find((item) => item.id === traceId);
    if (!trace) return true;

    try {
      const nativeDeleted = await markNativeSessionDeleted(trace.sessionId);
      if (!nativeDeleted) {
        setStorageError('Suppression du journal natif impossible. La trace est conservée pour éviter sa réapparition.');
        return false;
      }
    } catch {
      setStorageError('Suppression du journal natif impossible. La trace est conservée pour éviter sa réapparition.');
      return false;
    }

    const persisted = persist(tracesRef.current.filter((item) => item.id !== traceId));
    if (!persisted) {
      setStorageError('Journal natif supprimé, mais mise à jour de la liste locale impossible. Réessayez après redémarrage.');
      return false;
    }

    return true;
  };

  useEffect(() => {
    let cancelled = false;
    recoverNativeTraces()
      .then(async ({ traces: recovered }) => {
        if (cancelled || recovered.length === 0) return;
        const existingSessionIds = new Set(tracesRef.current.map((trace) => trace.sessionId).filter(Boolean));
        const newTraces = recovered.filter((trace) => !trace.sessionId || !existingSessionIds.has(trace.sessionId));
        if (newTraces.length === 0) return;
        const next = uniqueTraces([...newTraces, ...tracesRef.current]).slice(0, MAX_SAVED_TRACES);
        if (!persist(next)) {
          if (!cancelled) setStorageError('Récupération native trouvée, mais stockage local saturé.');
          return;
        }
        await Promise.all(newTraces.map((trace) => markNativeSessionSaved(trace.sessionId, trace.id)));
      })
      .catch(() => {
        // Web/PWA or unavailable native bridge: no recovery required.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { traces, saveTrace, deleteTrace, storageError };
}
