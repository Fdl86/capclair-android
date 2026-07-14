import { APP_VERSION } from '../../app/version';
import type { PlannedRouteSnapshot, Trace } from '../../domain/trace.types';
import { totalDistanceNm } from '../geo/distance';
import { readPendingPlannedRoute } from '../traces/plannedRouteSnapshot';
import { DEFAULT_MAX_TRACE_SPEED_KT } from './geolocationService';
import { reconstructNativeTrace } from './nativeTraceReconstruction';
import {
  NativeGps,
  isAndroidNativeGpsAvailable,
  nativePayloadToGpsPosition,
  type NativeGpsSessionDiagnosticPayload,
  type NativeRecoverableSessionPayload
} from './nativeGpsProvider';

export interface NativeTraceRecoveryResult {
  traces: Trace[];
  sessionIds: string[];
}

export type NativeTraceRepairStatus = 'repaired' | 'journal_missing' | 'journal_empty' | 'journal_not_better' | 'read_error';

export interface NativeTraceRepairDiagnostic {
  traceId: string;
  sessionId: string;
  status: NativeTraceRepairStatus;
  message: string;
  nativeDiagnostic?: NativeGpsSessionDiagnosticPayload;
}

export interface NativeTraceRepairResult {
  traces: Trace[];
  repairedCount: number;
  diagnostics: NativeTraceRepairDiagnostic[];
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

function sessionPositions(session: NativeRecoverableSessionPayload, maxTraceSpeedKt: number) {
  const rawPositions = (session.positions ?? [])
    .map(nativePayloadToGpsPosition)
    .filter((position): position is NonNullable<typeof position> => position !== null);
  return reconstructNativeTrace(rawPositions, maxTraceSpeedKt);
}

export function nativeSessionToTrace(
  session: NativeRecoverableSessionPayload,
  pendingRoute?: PlannedRouteSnapshot,
  maxTraceSpeedKt = DEFAULT_MAX_TRACE_SPEED_KT
): Trace | null {
  const rebuilt = sessionPositions(session, maxTraceSpeedKt);
  const positions = rebuilt.positions;
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
    distanceNm: Number(totalDistanceNm(positions).toFixed(2)),
    diagnostics: rebuilt.diagnostics
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
    const trace = nativeSessionToTrace(session, pendingRoute);
    if (!trace || !session.sessionId) continue;
    traces.push(trace);
    sessionIds.push(session.sessionId);
  }

  return { traces, sessionIds };
}

export function traceNeedsNativeRepair(trace: Trace): boolean {
  if (trace.source !== 'android-native' || !trace.sessionId) return false;
  const diagnostics = trace.diagnostics;
  if (!diagnostics) return false;
  return diagnostics.gpsResumptions > 0
    || diagnostics.gpsGaps > 0
    || diagnostics.rawReceived > Math.max(trace.positions.length + 20, trace.positions.length * 1.5);
}

export function nativeCoverageIsBetter(local: Trace, native: Trace): boolean {
  const localFirst = local.positions[0]?.timestamp ?? Number.POSITIVE_INFINITY;
  const localLast = local.positions.at(-1)?.timestamp ?? 0;
  const nativeFirst = native.positions[0]?.timestamp ?? Number.POSITIVE_INFINITY;
  const nativeLast = native.positions.at(-1)?.timestamp ?? 0;

  return nativeFirst < localFirst - 5000
    || nativeLast > localLast + 5000
    || native.positions.length > local.positions.length + 5
    || native.dureeSec > local.dureeSec + 10;
}

/**
 * Repairs only local traces that already exist and look incomplete. Saved
 * native sessions are never re-injected as new traces, which avoids the old
 * 20-trace oscillation while still allowing a damaged local trace to be fixed
 * from its retained Android journal after installing a hotfix.
 */
export async function repairIncompleteSavedNativeTraces(localTraces: Trace[]): Promise<NativeTraceRepairResult> {
  if (!isAndroidNativeGpsAvailable()) return { traces: localTraces, repairedCount: 0, diagnostics: [] };
  const candidates = localTraces.filter(traceNeedsNativeRepair);
  if (candidates.length === 0) return { traces: localTraces, repairedCount: 0, diagnostics: [] };

  let repairedCount = 0;
  const repairedById = new Map<string, Trace>();
  const diagnostics: NativeTraceRepairDiagnostic[] = [];

  for (const local of candidates) {
    if (!local.sessionId) continue;
    try {
      const nativeDiagnostic = await NativeGps.getSessionDiagnostic({ sessionId: local.sessionId });
      if (!nativeDiagnostic.journalFound) {
        diagnostics.push({
          traceId: local.id,
          sessionId: local.sessionId,
          status: 'journal_missing',
          message: `Trace ${local.routeName} : journal Android introuvable.`,
          nativeDiagnostic
        });
        continue;
      }

      const result = await NativeGps.getSessionPoints({ sessionId: local.sessionId });
      if ((result.positions?.length ?? 0) < 2) {
        diagnostics.push({
          traceId: local.id,
          sessionId: local.sessionId,
          status: 'journal_empty',
          message: `Trace ${local.routeName} : journal Android retrouvé mais vide ou inexploitable.`,
          nativeDiagnostic
        });
        continue;
      }

      const session: NativeRecoverableSessionPayload = {
        sessionId: local.sessionId,
        routeId: local.routeId,
        routeName: local.routeName,
        startedAt: new Date(local.startedAt ?? local.positions[0]?.timestamp ?? local.date).getTime(),
        endedAt: new Date(local.endedAt ?? local.positions.at(-1)?.timestamp ?? local.date).getTime(),
        saved: true,
        traceId: local.id,
        positions: result.positions,
        plannedRoute: local.plannedRoute
      };
      const maxSpeed = local.diagnostics?.maxTraceSpeedKt ?? DEFAULT_MAX_TRACE_SPEED_KT;
      const native = nativeSessionToTrace(session, local.plannedRoute, maxSpeed);
      if (!native || !nativeCoverageIsBetter(local, native)) {
        diagnostics.push({
          traceId: local.id,
          sessionId: local.sessionId,
          status: 'journal_not_better',
          message: `Trace ${local.routeName} : journal Android retrouvé, mais il contient la même coupure que la trace locale.`,
          nativeDiagnostic
        });
        continue;
      }

      repairedCount += 1;
      repairedById.set(local.id, {
        ...native,
        id: local.id,
        routeId: local.routeId || native.routeId,
        routeName: local.routeName || native.routeName,
        plannedRoute: native.plannedRoute ?? local.plannedRoute,
        schemaVersion: native.plannedRoute || local.plannedRoute ? 3 : native.schemaVersion
      });
      diagnostics.push({
        traceId: local.id,
        sessionId: local.sessionId,
        status: 'repaired',
        message: `Trace ${local.routeName} réparée depuis le journal Android complet.`,
        nativeDiagnostic
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || 'Erreur inconnue');
      diagnostics.push({
        traceId: local.id,
        sessionId: local.sessionId,
        status: 'read_error',
        message: `Trace ${local.routeName} : lecture du journal Android impossible (${message}).`
      });
    }
  }

  return {
    traces: localTraces.map((trace) => repairedById.get(trace.id) ?? trace),
    repairedCount,
    diagnostics
  };
}

function diagnosticFileName(trace: Trace): string {
  const route = trace.routeName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'trace';
  const date = new Date(trace.date);
  const stamp = Number.isNaN(date.getTime())
    ? new Date().toISOString().slice(0, 10)
    : date.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return `cap-clair-diagnostic-gps-${route}-${stamp}.zip`;
}

export async function getNativeSessionDiagnostic(trace: Trace): Promise<NativeGpsSessionDiagnosticPayload | null> {
  if (!trace.sessionId || !isAndroidNativeGpsAvailable()) return null;
  return NativeGps.getSessionDiagnostic({ sessionId: trace.sessionId });
}

export async function exportNativeGpsDiagnostic(trace: Trace): Promise<{ fileName: string; diagnostic?: NativeGpsSessionDiagnosticPayload }> {
  if (!trace.sessionId) throw new Error('Cette trace ne possède pas de session GPS Android associée.');
  if (!isAndroidNativeGpsAvailable()) throw new Error('Le diagnostic GPS brut est disponible uniquement dans l’application Android.');
  const fileName = diagnosticFileName(trace);
  const result = await NativeGps.exportSessionDiagnostic({
    sessionId: trace.sessionId,
    localTraceJson: JSON.stringify({ exportedAt: new Date().toISOString(), appVersion: APP_VERSION, trace }, null, 2),
    appVersion: APP_VERSION,
    fileName
  });
  return { fileName: result.fileName || fileName, diagnostic: result.diagnostic };
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
