import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const providerPath = path.resolve(process.cwd(), 'src/services/gps/nativeGpsProvider.ts');
const hookPath = path.resolve(process.cwd(), 'src/hooks/useGpsTracking.ts');

describe('native GPS bridge back-pressure contract', () => {
  it('batches a large unread journal instead of replaying every point through React', () => {
    const provider = fs.readFileSync(providerPath, 'utf8');

    expect(provider).toContain('NATIVE_BACKFILL_THRESHOLD');
    expect(provider).toContain('if (onBackfill) onBackfill(bufferedPositions)');
    expect(provider).toContain('getSessionPointsChunk');
    expect(provider).not.toContain('for (const point of result.points ?? []) emitPosition(point)');
  });

  it('rehydrates the complete native journal in one state replacement', () => {
    const hook = fs.readFileSync(hookPath, 'utf8');

    expect(hook).toContain("setNoticeMessage('Rattrapage du journal GPS Android en cours...')");
    expect(hook).toContain('const fullJournal = await readNativeSessionPositions(activeSessionId)');
    expect(hook).toContain('[...fullJournal, ...positionsRef.current]');
    expect(hook).toContain('applyReconstructedTrace(rebuilt)');
  });

  it('locks repeated stop requests and retains a finalized trace for save retry', () => {
    const hook = fs.readFileSync(hookPath, 'utf8');

    expect(hook).toContain('if (stopPromiseRef.current) return stopPromiseRef.current');
    expect(hook).toContain('pendingFinalTraceRef.current = trace');
    expect(hook).toContain("? `trace-${sessionId.current}`");
  });
});
