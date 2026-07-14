import { useEffect, useRef, useState } from 'react';
import type { Trace } from '../domain/trace.types';
import {
  recoverNativeTraces,
  repairIncompleteSavedNativeTraces,
  markNativeSessionDeleted,
  markNativeSessionSaved
} from '../services/gps/nativeGpsSession';
import { readJson, writeJson } from '../services/storage/localStorageService';
import { persistTraceCollection, type TraceCollectionPersistResult } from '../services/traces/traceCollection';
import { clearPendingPlannedRoute } from '../services/traces/plannedRouteSnapshot';

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

  const persist = (next: Trace[]): TraceCollectionPersistResult<Trace> => {
    const unique = uniqueTraces(next);
    const result = persistTraceCollection(unique, MAX_SAVED_TRACES, (candidate) => writeJson(STORAGE_KEY, candidate));

    if (!result.success) {
      setStorageError('Sauvegarde locale impossible. Le journal natif reste conservé pour récupération.');
      return result;
    }

    tracesRef.current = result.saved;
    setTraces(result.saved);
    setStorageError(
      result.discardedCount > 0
        ? `${result.discardedCount} ancienne(s) trace(s) retirée(s) du stockage rapide. Les journaux natifs non validés restent récupérables.`
        : null
    );
    return result;
  };

  const saveTrace = async (trace: Trace): Promise<boolean> => {
    if (trace.positions.length < 2) return false;
    const next = [trace, ...tracesRef.current.filter((item) => item.id !== trace.id)];
    const persisted = persist(next);
    const traceWasSaved = persisted.success && persisted.saved.some((item) => item.id === trace.id);
    if (!traceWasSaved) return false;
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
    if (!persisted.success) {
      setStorageError('Journal natif supprimé, mais mise à jour de la liste locale impossible. Réessayez après redémarrage.');
      return false;
    }

    return true;
  };

  useEffect(() => {
    let cancelled = false;

    const recoverAndRepair = async () => {
      try {
        const { traces: recovered } = await recoverNativeTraces();
        if (!cancelled && recovered.length > 0) {
          const existingSessionIds = new Set(tracesRef.current.map((trace) => trace.sessionId).filter(Boolean));
          const newTraces = recovered.filter((trace) => !trace.sessionId || !existingSessionIds.has(trace.sessionId));
          if (newTraces.length > 0) {
            const orderedRecovered = [...newTraces].sort((left, right) => {
              const leftTime = new Date(left.endedAt ?? left.date).getTime();
              const rightTime = new Date(right.endedAt ?? right.date).getTime();
              return rightTime - leftTime;
            });
            const persisted = persist(uniqueTraces([...orderedRecovered, ...tracesRef.current]));
            if (!persisted.success) {
              setStorageError('Récupération native trouvée, mais stockage local saturé. Les journaux restent intacts.');
            } else {
              const savedIds = new Set(persisted.saved.map((trace) => trace.id));
              const savedRecovered = orderedRecovered.filter((trace) => savedIds.has(trace.id));
              const confirmations = await Promise.all(savedRecovered.map(async (trace) => ({
                trace,
                confirmed: await markNativeSessionSaved(trace.sessionId, trace.id).catch(() => false)
              })));
              if (confirmations.some((item) => !item.confirmed) && !cancelled) {
                setStorageError('Certaines traces sont sauvegardées dans l’app, mais leur journal natif reste à valider.');
              }
              if (savedRecovered.some((trace) => trace.plannedRoute)) clearPendingPlannedRoute();
            }
          }
        }
      } catch {
        // Web/PWA or unavailable native bridge: no recovery required.
      }

      if (cancelled) return;
      try {
        const repaired = await repairIncompleteSavedNativeTraces(tracesRef.current);
        if (cancelled || repaired.repairedCount === 0) return;
        const persisted = persist(repaired.traces);
        if (!persisted.success) {
          setStorageError('Trace complète retrouvée dans le journal Android, mais stockage local saturé. Le journal reste intact.');
          return;
        }
        setStorageError(
          `${repaired.repairedCount} trace(s) incomplète(s) réparée(s) depuis le journal GPS Android complet.`
        );
      } catch {
        // A repair failure must never affect already saved local traces.
      }
    };

    recoverAndRepair();
    return () => {
      cancelled = true;
    };
  }, []);

  return { traces, saveTrace, deleteTrace, storageError };
}
