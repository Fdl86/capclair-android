export interface TraceCollectionPersistResult<T> {
  success: boolean;
  saved: T[];
  discardedCount: number;
}

/**
 * Persists the largest possible prefix of a trace list.
 * An empty list is a valid state and must be written explicitly so the last
 * saved trace can be deleted without being restored from stale local data.
 */
export function persistTraceCollection<T>(
  items: T[],
  maxItems: number,
  writer: (candidate: T[]) => boolean
): TraceCollectionPersistResult<T> {
  const limited = items.slice(0, Math.max(0, maxItems));

  if (limited.length === 0) {
    const success = writer([]);
    return { success, saved: success ? [] : limited, discardedCount: 0 };
  }

  for (let keep = limited.length; keep >= 1; keep -= 1) {
    const candidate = limited.slice(0, keep);
    if (!writer(candidate)) continue;
    return {
      success: true,
      saved: candidate,
      discardedCount: limited.length - keep
    };
  }

  return { success: false, saved: limited, discardedCount: 0 };
}

export function hasSavableTrace(pointCount: number): boolean {
  return Number.isFinite(pointCount) && pointCount >= 2;
}
