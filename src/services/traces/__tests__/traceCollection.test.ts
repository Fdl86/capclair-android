import { describe, expect, it, vi } from 'vitest';
import { hasSavableTrace, persistTraceCollection } from '../traceCollection';

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
