import { useEffect, useRef, useState } from "react";
import type { Trace } from "../domain/trace.types";
import {
  recoverNativeTraces,
  repairIncompleteSavedNativeTraces,
  markNativeSessionDeleted,
  markNativeSessionSaved,
} from "../services/gps/nativeGpsSession";
import { readJson, writeJson } from "../services/storage/localStorageService";
import {
  mergeTraceCollection,
  persistTraceCollection,
  selectMoreCompleteTrace,
  traceIdentityKey,
  type TraceCollectionPersistResult,
} from "../services/traces/traceCollection";
import { clearPendingPlannedRoute } from "../services/traces/plannedRouteSnapshot";

const STORAGE_KEY = "capclair.traces";
const MAX_SAVED_TRACES = 20;

export function useTraces() {
  const [traces, setTraces] = useState<Trace[]>(() =>
    mergeTraceCollection(readJson<Trace[]>(STORAGE_KEY, [])),
  );
  const tracesRef = useRef(traces);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [recoveryInProgress, setRecoveryInProgress] = useState(true);

  const persist = (next: Trace[]): TraceCollectionPersistResult<Trace> => {
    const merged = mergeTraceCollection(next);
    const result = persistTraceCollection(
      merged,
      MAX_SAVED_TRACES,
      (candidate) => writeJson(STORAGE_KEY, candidate),
    );

    if (!result.success) {
      setStorageError(
        "Sauvegarde locale impossible. Le journal natif reste conservé pour récupération.",
      );
      return result;
    }

    tracesRef.current = result.saved;
    setTraces(result.saved);
    setStorageError(
      result.discardedCount > 0
        ? `${result.discardedCount} ancienne(s) trace(s) retirée(s) du stockage rapide. Les journaux natifs non validés restent récupérables.`
        : null,
    );
    return result;
  };

  const saveTrace = async (trace: Trace): Promise<boolean> => {
    if (trace.positions.length < 2) return false;

    const identity = traceIdentityKey(trace);
    const existing = tracesRef.current.find(
      (item) => traceIdentityKey(item) === identity,
    );
    const selected = existing
      ? selectMoreCompleteTrace(existing, trace)
      : trace;
    const next = [
      selected,
      ...tracesRef.current.filter(
        (item) => traceIdentityKey(item) !== identity,
      ),
    ];
    const persisted = persist(next);
    const traceWasSaved =
      persisted.success &&
      persisted.saved.some((item) => traceIdentityKey(item) === identity);
    if (!traceWasSaved) return false;

    const savedTrace =
      persisted.saved.find((item) => traceIdentityKey(item) === identity) ??
      selected;
    const nativeConfirmed = await markNativeSessionSaved(
      savedTrace.sessionId,
      savedTrace.id,
    );
    if (!nativeConfirmed) {
      setStorageError(
        "Trace sauvegardée dans l’app, mais validation du journal natif impossible.",
      );
    } else if (
      existing &&
      selected.id === existing.id &&
      trace.id !== existing.id
    ) {
      setStorageError(
        "Une tentative de sauvegarde plus courte a été ignorée : la trace complète existante est conservée.",
      );
    }
    return true;
  };

  const deleteTrace = async (traceId: string): Promise<boolean> => {
    const trace = tracesRef.current.find((item) => item.id === traceId);
    if (!trace) return true;

    try {
      const nativeDeleted = await markNativeSessionDeleted(trace.sessionId);
      if (!nativeDeleted) {
        setStorageError(
          "Suppression du journal natif impossible. La trace est conservée pour éviter sa réapparition.",
        );
        return false;
      }
    } catch {
      setStorageError(
        "Suppression du journal natif impossible. La trace est conservée pour éviter sa réapparition.",
      );
      return false;
    }

    const persisted = persist(
      tracesRef.current.filter((item) => item.id !== traceId),
    );
    if (!persisted.success) {
      setStorageError(
        "Journal natif supprimé, mais mise à jour de la liste locale impossible. Réessayez après redémarrage.",
      );
      return false;
    }

    return true;
  };

  useEffect(() => {
    let cancelled = false;

    const recoverAndRepair = async () => {
      setRecoveryInProgress(true);
      try {
        try {
          const { traces: recovered } = await recoverNativeTraces();
          if (!cancelled && recovered.length > 0) {
            const existingBySession = new Map(
              tracesRef.current
                .filter((trace): trace is Trace & { sessionId: string } =>
                  Boolean(trace.sessionId),
                )
                .map((trace) => [trace.sessionId, trace]),
            );
            const alreadyStored = recovered.filter(
              (trace) =>
                trace.sessionId && existingBySession.has(trace.sessionId),
            );
            if (alreadyStored.length > 0) {
              await Promise.all(
                alreadyStored.map(async (trace) => {
                  const local = trace.sessionId
                    ? existingBySession.get(trace.sessionId)
                    : undefined;
                  if (local)
                    await markNativeSessionSaved(
                      local.sessionId,
                      local.id,
                    ).catch(() => false);
                }),
              );
            }

            const newTraces = recovered.filter(
              (trace) =>
                !trace.sessionId || !existingBySession.has(trace.sessionId),
            );
            if (newTraces.length > 0) {
              const orderedRecovered = [...newTraces].sort((left, right) => {
                const leftTime = new Date(left.endedAt ?? left.date).getTime();
                const rightTime = new Date(
                  right.endedAt ?? right.date,
                ).getTime();
                return rightTime - leftTime;
              });
              const persisted = persist(
                mergeTraceCollection([
                  ...orderedRecovered,
                  ...tracesRef.current,
                ]),
              );
              if (!persisted.success) {
                setStorageError(
                  "Récupération native trouvée, mais stockage local saturé. Les journaux restent intacts.",
                );
              } else {
                const savedIds = new Set(
                  persisted.saved.map((trace) => trace.id),
                );
                const savedRecovered = orderedRecovered.filter((trace) =>
                  savedIds.has(trace.id),
                );
                const confirmations = await Promise.all(
                  savedRecovered.map(async (trace) => ({
                    trace,
                    confirmed: await markNativeSessionSaved(
                      trace.sessionId,
                      trace.id,
                    ).catch(() => false),
                  })),
                );
                if (
                  confirmations.some((item) => !item.confirmed) &&
                  !cancelled
                ) {
                  setStorageError(
                    "Certaines traces sont sauvegardées dans l’app, mais leur journal natif reste à valider.",
                  );
                }
                if (savedRecovered.some((trace) => trace.plannedRoute))
                  clearPendingPlannedRoute();
              }
            }
          }
        } catch {
          // Web/PWA or unavailable native bridge: no recovery required.
        }

        if (cancelled) return;
        try {
          const repaired = await repairIncompleteSavedNativeTraces(
            tracesRef.current,
          );
          if (cancelled) return;
          if (repaired.checkedCount > 0) {
            const persisted = persist(repaired.traces);
            if (!persisted.success) {
              setStorageError(
                "Journal Android vérifié, mais mise à jour du stockage local impossible. Le journal reste intact.",
              );
              return;
            }
            if (repaired.repairedCount > 0) {
              setStorageError(
                `${repaired.repairedCount} trace(s) incomplète(s) réparée(s) depuis le journal GPS Android complet.`,
              );
              return;
            }
          }
          const actionable = repaired.diagnostics.find(
            (item) => item.status !== "repaired",
          );
          if (actionable) setStorageError(actionable.message);
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : String(error || "Erreur inconnue");
          setStorageError(
            `Diagnostic du journal GPS Android impossible : ${message}`,
          );
        }
      } finally {
        if (!cancelled) setRecoveryInProgress(false);
      }
    };

    recoverAndRepair();
    return () => {
      cancelled = true;
    };
  }, []);

  return { traces, saveTrace, deleteTrace, storageError, recoveryInProgress };
}
