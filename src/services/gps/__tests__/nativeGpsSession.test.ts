import { describe, expect, it } from 'vitest';
import type { NativeRecoverableSessionPayload } from '../nativeGpsProvider';
import { selectRecoverableSessions } from '../nativeGpsSession';

describe('native GPS recovery selection', () => {
  it('excludes sessions already saved and sessions still running', () => {
    const sessions: NativeRecoverableSessionPayload[] = [
      { sessionId: 'unsaved-old', saved: false, running: false, endedAt: 100 },
      { sessionId: 'saved-new', saved: true, running: false, endedAt: 400 },
      { sessionId: 'running', saved: false, running: true, endedAt: 300 },
      { sessionId: 'unsaved-new', running: false, endedAt: 200 }
    ];

    expect(selectRecoverableSessions(sessions).map((session) => session.sessionId)).toEqual([
      'unsaved-new',
      'unsaved-old'
    ]);
  });

  it('orders unsaved recovery candidates from newest to oldest', () => {
    const sessions: NativeRecoverableSessionPayload[] = [
      { sessionId: 'first', startedAt: 10 },
      { sessionId: 'third', endedAt: 30 },
      { sessionId: 'second', endedAt: 20 }
    ];

    expect(selectRecoverableSessions(sessions).map((session) => session.sessionId)).toEqual([
      'third',
      'second',
      'first'
    ]);
  });
});
