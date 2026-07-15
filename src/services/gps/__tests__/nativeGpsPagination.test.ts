import { describe, expect, it } from 'vitest';
import type { NativeGpsJournalPageFetcher, NativeGpsPointPayload } from '../nativeGpsProvider';
import { readNativeJournalPages } from '../nativeGpsProvider';

function point(index: number): NativeGpsPointPayload {
  return {
    latitude: 46 + index / 1_000_000,
    longitude: 0.3 + index / 1_000_000,
    altitude: 100,
    vitesse: 20,
    track: 90,
    timestamp: 1_000 + index * 1_000,
    precision: 5
  };
}

function pagedFetcher(count: number): NativeGpsJournalPageFetcher {
  const points = Array.from({ length: count }, (_, index) => point(index));
  return async (offset, maxPoints) => {
    const page = points.slice(offset, offset + maxPoints);
    const nextOffset = offset + page.length;
    return {
      points: page,
      startOffset: offset,
      nextOffset,
      journalLength: points.length,
      pagePointCount: page.length,
      malformedLineCount: 0,
      trailingPartial: false,
      eofReached: nextOffset === points.length,
      hasMore: nextOffset < points.length
    };
  };
}

const noPause = async () => undefined;

describe('complete native GPS journal pagination', () => {
  it.each([
    [0, 1],
    [1, 1],
    [499, 1],
    [500, 1],
    [501, 2],
    [1_000, 2],
    [5_000, 10]
  ])('reads %i positions over %i page(s)', async (pointCount, expectedPages) => {
    const result = await readNativeJournalPages('session-test', pagedFetcher(pointCount), noPause);

    expect(result.complete).toBe(true);
    expect(result.validPointCount).toBe(pointCount);
    expect(result.positions).toHaveLength(pointCount);
    expect(result.pageCount).toBe(expectedPages);
    expect(result.lastOffset).toBe(pointCount);
    expect(result.journalLength).toBe(pointCount);
  });

  it('rejects an offset that does not advance', async () => {
    const fetcher: NativeGpsJournalPageFetcher = async (offset) => ({
      points: [point(0)],
      startOffset: offset,
      nextOffset: offset,
      journalLength: 10,
      pagePointCount: 1,
      eofReached: false,
      hasMore: true
    });

    await expect(readNativeJournalPages('session-stuck', fetcher, noPause)).rejects.toThrow('offset bloqué');
  });

  it('rejects a page declared final before the end of the journal', async () => {
    const fetcher: NativeGpsJournalPageFetcher = async () => ({
      points: [point(0)],
      startOffset: 0,
      nextOffset: 1,
      journalLength: 2,
      pagePointCount: 1,
      eofReached: false,
      hasMore: false
    });

    await expect(readNativeJournalPages('session-short', fetcher, noPause)).rejects.toThrow('Lecture incomplète');
  });

  it('rejects a trailing partial JSONL record without accepting a partial save', async () => {
    const fetcher: NativeGpsJournalPageFetcher = async () => ({
      points: [point(0)],
      startOffset: 0,
      nextOffset: 100,
      journalLength: 120,
      pagePointCount: 1,
      malformedLineCount: 0,
      trailingPartial: true,
      eofReached: false,
      hasMore: false
    });

    await expect(readNativeJournalPages('session-partial', fetcher, noPause)).rejects.toThrow('dernière ligne partielle');
  });

  it('counts complete malformed lines while continuing to the end', async () => {
    const fetcher: NativeGpsJournalPageFetcher = async () => ({
      points: [point(0), point(1)],
      startOffset: 0,
      nextOffset: 300,
      journalLength: 300,
      pagePointCount: 2,
      malformedLineCount: 1,
      trailingPartial: false,
      eofReached: true,
      hasMore: false
    });

    const result = await readNativeJournalPages('session-malformed', fetcher, noPause);
    expect(result.complete).toBe(true);
    expect(result.validPointCount).toBe(2);
    expect(result.malformedLineCount).toBe(1);
  });
});
