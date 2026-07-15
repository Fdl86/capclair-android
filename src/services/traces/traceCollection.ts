import type { Trace } from '../../domain/trace.types';

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

  if (writer(limited)) {
    return { success: true, saved: limited, discardedCount: 0 };
  }

  // localStorage quota behavior is monotonic for prefixes of the same list:
  // when N traces do not fit, larger prefixes will not fit either. A bounded
  // binary search avoids up to 20 repeated JSON serializations on the UI thread
  // during the critical stop-and-save path.
  let low = 1;
  let high = limited.length - 1;
  let best: T[] | null = null;

  while (low <= high) {
    const keep = Math.floor((low + high) / 2);
    const candidate = limited.slice(0, keep);
    if (writer(candidate)) {
      best = candidate;
      low = keep + 1;
    } else {
      high = keep - 1;
    }
  }

  if (!best) return { success: false, saved: limited, discardedCount: 0 };
  return {
    success: true,
    saved: best,
    discardedCount: limited.length - best.length
  };
}

export function hasSavableTrace(pointCount: number): boolean {
  return Number.isFinite(pointCount) && pointCount >= 2;
}

export function traceIdentityKey(trace: Pick<Trace, 'id' | 'sessionId'>): string {
  return trace.sessionId ? `session:${trace.sessionId}` : `trace:${trace.id}`;
}

export function traceRecordedSpanMs(trace: Pick<Trace, 'positions'>): number {
  const first = trace.positions[0]?.timestamp;
  const last = trace.positions.at(-1)?.timestamp;
  if (!Number.isFinite(first) || !Number.isFinite(last)) return 0;
  return Math.max(0, last! - first!);
}

/**
 * Chooses the most complete representation of one recording session.
 * Coverage is more important than recency: a later two-point retry must never
 * replace a full flight already saved for the same native session.
 */
export function selectMoreCompleteTrace(left: Trace, right: Trace): Trace {
  const leftVerified = left.nativeJournalVerification?.complete === true;
  const rightVerified = right.nativeJournalVerification?.complete === true;
  if (leftVerified !== rightVerified) return leftVerified ? left : right;

  const leftSpan = traceRecordedSpanMs(left);
  const rightSpan = traceRecordedSpanMs(right);
  const spanToleranceMs = 5_000;

  if (leftSpan > rightSpan + spanToleranceMs) return left;
  if (rightSpan > leftSpan + spanToleranceMs) return right;

  const distanceToleranceNm = 0.1;
  if (left.distanceNm > right.distanceNm + distanceToleranceNm) return left;
  if (right.distanceNm > left.distanceNm + distanceToleranceNm) return right;

  if (left.positions.length !== right.positions.length) {
    return left.positions.length > right.positions.length ? left : right;
  }

  const leftEnded = Date.parse(left.endedAt ?? left.date);
  const rightEnded = Date.parse(right.endedAt ?? right.date);
  if (Number.isFinite(leftEnded) && Number.isFinite(rightEnded) && leftEnded !== rightEnded) {
    return leftEnded > rightEnded ? left : right;
  }

  return left;
}

/**
 * De-duplicates by native session (or trace id for legacy data) while retaining
 * the richest coverage for each recording.
 */
export function mergeTraceCollection(traces: Trace[]): Trace[] {
  const order: string[] = [];
  const byKey = new Map<string, Trace>();

  for (const trace of traces) {
    const key = traceIdentityKey(trace);
    const existing = byKey.get(key);
    if (!existing) {
      order.push(key);
      byKey.set(key, trace);
      continue;
    }
    byKey.set(key, selectMoreCompleteTrace(existing, trace));
  }

  return order.map((key) => byKey.get(key)!).filter(Boolean);
}
