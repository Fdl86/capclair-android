import { describe, expect, it } from 'vitest';
import type { Trace } from '../../../domain/trace.types';
import type { NativeRecoverableSessionPayload } from '../nativeGpsProvider';
import {
  nativeCoverageIsBetter,
  nativeSessionToTrace,
  selectRecoverableSessions,
  traceNeedsNativeRepair
} from '../nativeGpsSession';

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

  it('rebuilds a recovered session in chronological order', () => {
    const session: NativeRecoverableSessionPayload = {
      sessionId: 'session-ordered',
      routeId: 'route-1',
      startedAt: 0,
      endedAt: 9000,
      positions: [
        { latitude: 46, longitude: 0.003, altitude: 500, altitudeAccuracy: 10, vitesse: 80, track: 90, timestamp: 9000, precision: 5 },
        { latitude: 46, longitude: 0, altitude: 500, altitudeAccuracy: 10, vitesse: 80, track: 90, timestamp: 0, precision: 5 },
        { latitude: 46, longitude: 0.001, altitude: 500, altitudeAccuracy: 10, vitesse: 80, track: 90, timestamp: 3000, precision: 5 },
        { latitude: 46, longitude: 0.002, altitude: 500, altitudeAccuracy: 10, vitesse: 80, track: 90, timestamp: 6000, precision: 5 }
      ]
    };

    const trace = nativeSessionToTrace(session, undefined, 600);
    expect(trace?.positions.map((position) => position.timestamp)).toEqual([0, 3000, 6000, 9000]);
  });
});

function localTrace(overrides: Partial<Trace> = {}): Trace {
  return {
    schemaVersion: 3,
    id: 'trace-local',
    sessionId: 'session-1',
    routeId: 'route-1',
    routeName: 'Test',
    date: new Date(30_000).toISOString(),
    startedAt: new Date(0).toISOString(),
    endedAt: new Date(30_000).toISOString(),
    source: 'android-native',
    positions: [
      { latitude: 46, longitude: 0, altitude: 500, altitudeAccuracy: 10, vitesse: 80, track: 90, timestamp: 0, precision: 5 },
      { latitude: 46, longitude: 0.01, altitude: 500, altitudeAccuracy: 10, vitesse: 80, track: 90, timestamp: 30_000, precision: 5 }
    ],
    dureeSec: 30,
    distanceNm: 1,
    diagnostics: {
      rawReceived: 100,
      rejectedPrecision: 0,
      rejectedRedundant: 0,
      rejectedSpeed: 0,
      rejectedDrift: 0,
      forcedResync: 0,
      tracePoints: 2,
      gpsGaps: 1,
      gpsResumptions: 1,
      missingAltitude: 0,
      unreliableAltitude: 0,
      maxTraceSpeedKt: 160
    },
    ...overrides
  };
}

describe('saved native trace repair selection', () => {
  it('flags an Android trace whose diagnostics show missing bridge coverage', () => {
    expect(traceNeedsNativeRepair(localTrace())).toBe(true);
  });

  it('flags a long native session reduced to two points even when diagnostics look normal', () => {
    const sparse = localTrace({
      dureeSec: 5_061,
      positions: [
        { latitude: 46, longitude: 0, altitude: 500, altitudeAccuracy: 10, vitesse: 0, track: 90, timestamp: 0, precision: 5 },
        { latitude: 46, longitude: 0.001, altitude: 500, altitudeAccuracy: 10, vitesse: 0, track: 90, timestamp: 2_000, precision: 5 }
      ],
      diagnostics: {
        rawReceived: 4,
        rejectedPrecision: 0,
        rejectedRedundant: 2,
        rejectedSpeed: 0,
        rejectedDrift: 1,
        forcedResync: 0,
        tracePoints: 2,
        gpsGaps: 0,
        gpsResumptions: 0,
        missingAltitude: 0,
        unreliableAltitude: 0,
        maxTraceSpeedKt: 160
      }
    });

    expect(traceNeedsNativeRepair(sparse)).toBe(true);
  });

  it('does not recheck a schema 4 trace already rebuilt from the complete journal', () => {
    expect(traceNeedsNativeRepair(localTrace({ schemaVersion: 4 }))).toBe(false);
  });

  it('accepts a native reconstruction with earlier coverage', () => {
    const local = localTrace({
      positions: localTrace().positions.map((position) => ({ ...position, timestamp: position.timestamp + 20_000 }))
    });
    const native = localTrace();
    expect(nativeCoverageIsBetter(local, native)).toBe(true);
  });
});
