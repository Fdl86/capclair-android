import type { PlannedRouteSnapshot, Trace } from '../../domain/trace.types';
import { totalDistanceNm } from '../geo/distance';
import { readPendingPlannedRoute } from '../traces/plannedRouteSnapshot';
import {
  NativeGps,
  isAndroidNativeGpsAvailable,
  nativePayloadToGpsPosition,
  type NativeRecoverableSessionPayload
} from './nativeGpsProvider';

export interface NativeTraceRecoveryResult {
  traces: Trace[];
  sessionIds: string[];
}

export function selectRecoverableSessions(sessions: NativeRecoverableSessionPayload[]): NativeRecoverableSessionPayload[] {
  return [...sessions]
    .filter((session) => session.running !== true && session.saved !== true)
    .sort((left, right) => {
      const leftTime = left.endedAt ?? left.startedAt ?? 0;
      const rightTime = right.endedAt ?? right.startedAt ?? 0;
      return rightTime - leftTime;
    });
}

function recoveredSessionToTrace(session: NativeRecoverableSessionPayload, pendingRoute?: PlannedRouteSnapshot): Trace | null {
  const positions = (session.positions ?? [])
    .map(nativePayloadToGpsPosition)
    .filter((position): position is NonNullable<typeof position> => position !== null)
    .sort((a, b) => a.timestamp - b.timestamp);

  if (positions.length < 2 || !session.sessionId) return null;

  const startedAtMs = typeof session.startedAt === 'number' && Number.isFinite(session.startedAt)
    ? session.startedAt
    : positions[0].timestamp;
  const endedAtMs = typeof session.endedAt === 'number' && Number.isFinite(session.endedAt)
    ? session.endedAt
    : positions.at(-1)?.timestamp ?? startedAtMs;
  const sessionRouteId = session.routeId || 'recovered-route';
  const embeddedRoute = session.plannedRoute?.points?.length && session.plannedRoute.routeId === sessionRouteId
    ? session.plannedRoute
    : undefined;
  const matchingPendingRoute = pendingRoute?.routeId === sessionRouteId ? pendingRoute : undefined;
  const plannedRoute = embeddedRoute ?? matchingPendingRoute;

  return {
    schemaVersion: plannedRoute ? 3 : 2,
    id: session.traceId || `recovered-${session.sessionId}`,
    sessionId: session.sessionId,
    routeId: sessionRouteId,
    routeName: session.routeName || 'Trace GPS récupérée',
    date: new Date(endedAtMs).toISOString(),
    startedAt: new Date(startedAtMs).toISOString(),
    endedAt: new Date(endedAtMs).toISOString(),
    source: 'android-native',
    positions,
    plannedRoute,
    dureeSec: Math.max(0, Math.round((endedAtMs - startedAtMs) / 1000)),
    distanceNm: Number(totalDistanceNm(positions).toFixed(2))
  };
}

export async function recoverNativeTraces(): Promise<NativeTraceRecoveryResult> {
  if (!isAndroidNativeGpsAvailable()) return { traces: [], sessionIds: [] };
  const result = await NativeGps.getRecoverableSessions({ includeSaved: false });
  const traces: Trace[] = [];
  const sessionIds: string[] = [];
  const pendingRoute = readPendingPlannedRoute();

  const sessions = selectRecoverableSessions(result.sessions ?? []);

  for (const session of sessions) {
    const trace = recoveredSessionToTrace(session, pendingRoute);
    if (!trace || !session.sessionId) continue;
    traces.push(trace);
    sessionIds.push(session.sessionId);
  }

  return { traces, sessionIds };
}

export async function markNativeSessionSaved(sessionId: string | null | undefined, traceId: string): Promise<boolean> {
  if (!sessionId || !isAndroidNativeGpsAvailable()) return true;
  const result = await NativeGps.markSessionSaved({ sessionId, traceId });
  return result.saved === true;
}

export async function markNativeSessionDeleted(sessionId: string | null | undefined): Promise<boolean> {
  if (!sessionId || !isAndroidNativeGpsAvailable()) return true;
  const result = await NativeGps.deleteSession({ sessionId });
  return result.deleted === true;
}
