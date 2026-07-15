import { describe, expect, it, vi } from 'vitest';
import type { Trace } from '../../../domain/trace.types';
import { hasSavableTrace, mergeTraceCollection, persistTraceCollection, selectMoreCompleteTrace } from '../traceCollection';

describe('persistTraceCollection', () => {
  it('persists an empty list when the last trace is deleted', () => {
    const writer = vi.fn(() => true);
    const result = persistTraceCollection([], 20, writer);

    expect(result).toEqual({ success: true, saved: [], discardedCount: 0 });
    expect(writer).toHaveBeenCalledOnce();
    expect(writer).toHaveBeenCalledWith([]);
  });

  it('keeps fewer old traces when storage rejects the full list', () => {
    const writer = vi.fn((candidate: number[]) => candidate.length <= 2);
    const result = persistTraceCollection([1, 2, 3], 20, writer);

    expect(result).toEqual({ success: true, saved: [1, 2], discardedCount: 1 });
  });


  it('uses a bounded number of quota probes for a large trace list', () => {
    const writer = vi.fn((candidate: number[]) => candidate.length <= 7);
    const result = persistTraceCollection(Array.from({ length: 20 }, (_, index) => index), 20, writer);

    expect(result.saved).toHaveLength(7);
    expect(writer.mock.calls.length).toBeLessThanOrEqual(6);
  });
});

describe('hasSavableTrace', () => {
  it.each([
    [0, false],
    [1, false],
    [2, true],
    [20, true]
  ])('returns the expected result for %i points', (pointCount, expected) => {
    expect(hasSavableTrace(pointCount)).toBe(expected);
  });
});


function trace(id: string, sessionId: string, timestamps: number[]): Trace {
  return {
    id,
    sessionId,
    routeId: 'route',
    routeName: 'Test',
    date: new Date(timestamps.at(-1) ?? 0).toISOString(),
    positions: timestamps.map((timestamp, index) => ({
      latitude: 46,
      longitude: index * 0.001,
      altitude: null,
      altitudeAccuracy: null,
      vitesse: 80,
      track: 90,
      timestamp,
      precision: 5
    })),
    dureeSec: Math.max(0, ((timestamps.at(-1) ?? 0) - (timestamps[0] ?? 0)) / 1000),
    distanceNm: 1
  };
}

describe('trace completeness selection', () => {
  it('never lets a later two-point retry replace the complete flight', () => {
    const complete = trace('complete', 'session-1', [0, 3000, 6000, 9000, 12_000]);
    const retry = trace('retry', 'session-1', [15_000, 18_000]);

    expect(selectMoreCompleteTrace(complete, retry)).toBe(complete);
    expect(mergeTraceCollection([retry, complete])).toEqual([complete]);
  });

  it('prefers wider chronological coverage before point count', () => {
    const fullSpan = trace('full-span', 'session-1', [0, 60_000]);
    const denseTail = trace('dense-tail', 'session-1', [50_000, 51_000, 52_000, 53_000]);

    expect(selectMoreCompleteTrace(fullSpan, denseTail)).toBe(fullSpan);
  });

  it('keeps a trace verified against the complete native journal over an unverified retry', () => {
    const verified = trace('verified', 'session-1', [0, 3000, 6000]);
    verified.nativeJournalVerification = {
      verifiedAt: new Date().toISOString(),
      complete: true,
      pageCount: 10,
      validPointCount: 4_583,
      journalLength: 971_592,
      lastOffset: 971_592,
      malformedLineCount: 0
    };
    const retry = trace('retry', 'session-1', [0, 3000, 6000, 9000]);

    expect(selectMoreCompleteTrace(verified, retry)).toBe(verified);
  });
});
