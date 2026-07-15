import { APP_VERSION } from '../../app/version';
import type { NativeJournalVerification, PlannedRouteSnapshot, Trace } from '../../domain/trace.types';
import { readPendingPlannedRoute } from '../traces/plannedRouteSnapshot';
import { DEFAULT_MAX_TRACE_SPEED_KT } from './geolocationService';
import { reconstructNativeTrace } from './nativeTraceReconstruction';
import {
  NativeGps,
  isAndroidNativeGpsAvailable,
  nativePayloadToGpsPosition,
  readNativeSessionJournal,
  type NativeGpsSessionDiagnosticPayload,
  type NativeRecoverableSessionPayload
} from './nativeGpsProvider';

export interface NativeTraceRecoveryResult {
  traces: Trace[];
  sessionIds: string[];
}

export type NativeTraceRepairStatus = 'repaired' | 'journal_missing' | 'journal_empty' | 'journal_not_better' | 'incomplete_read' | 'read_error';

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
  checkedCount: number;
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
  maxTraceSpeedKt = DEFAULT_MAX_TRACE_SPEED_KT,
  nativeJournalVerification?: NativeJournalVerification
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
    schemaVersion: 5,
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
    segmentStartIndices: rebuilt.segmentStartIndices,
    dureeSec: Math.max(0, Math.round((endedAtMs - startedAtMs) / 1000)),
    distanceNm: Number(rebuilt.distanceNm.toFixed(2)),
    diagnostics: rebuilt.diagnostics,
    nativeJournalVerification
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
    if (!session.sessionId) continue;
    const journal = await readNativeSessionJournal(session.sessionId);
    const verification = createNativeJournalVerification(journal);
    const trace = nativeSessionToTrace({ ...session, positions: journal.positions }, pendingRoute, DEFAULT_MAX_TRACE_SPEED_KT, verification);
    if (!trace) continue;
    traces.push(trace);
    sessionIds.push(session.sessionId);
  }

  return { traces, sessionIds };
}

export function createNativeJournalVerification(journal: {
  complete: boolean;
  pageCount: number;
  validPointCount: number;
  journalLength: number;
  lastOffset: number;
  malformedLineCount: number;
}): NativeJournalVerification {
  return {
    verifiedAt: new Date().toISOString(),
    complete: journal.complete,
    pageCount: journal.pageCount,
    validPointCount: journal.validPointCount,
    journalLength: journal.journalLength,
    lastOffset: journal.lastOffset,
    malformedLineCount: journal.malformedLineCount
  };
}

export function traceNeedsNativeRepair(trace: Trace): boolean {
  if (trace.source !== 'android-native' || !trace.sessionId) return false;
  if (trace.nativeJournalVerification?.complete === true) return false;

  const recordedSpanSec = Math.max(
    0,
    ((trace.positions.at(-1)?.timestamp ?? 0) - (trace.positions[0]?.timestamp ?? 0)) / 1000
  );
  const declaredDurationSec = Number.isFinite(trace.dureeSec) ? Math.max(0, trace.dureeSec) : 0;
  const durationSec = Math.max(recordedSpanSec, declaredDurationSec);
  const sparseThreshold = Math.max(3, Math.floor(durationSec / 20));
  const isLongAndSparse = durationSec >= 300 && trace.positions.length < sparseThreshold;
  const isLongWithoutMovement = durationSec >= 300 && trace.distanceNm <= 0.05;
  const isLongButNearlyEmpty = durationSec >= 60 && trace.positions.length <= 3;
  if (isLongButNearlyEmpty || isLongAndSparse || isLongWithoutMovement) return true;

  const diagnostics = trace.diagnostics;
  return Boolean(diagnostics && (diagnostics.gpsResumptions > 0 || diagnostics.gpsGaps > 0));
}

export function nativeCoverageIsBetter(local: Trace, native: Trace): boolean {
  const localFirst = local.positions[0]?.timestamp ?? Number.POSITIVE_INFINITY;
  const localLast = local.positions.at(-1)?.timestamp ?? 0;
  const nativeFirst = native.positions[0]?.timestamp ?? Number.POSITIVE_INFINITY;
  const nativeLast = native.positions.at(-1)?.timestamp ?? 0;
  const localSpan = Math.max(0, localLast - localFirst);
  const nativeSpan = Math.max(0, nativeLast - nativeFirst);

  const nativeIsMateriallyWorse = nativeSpan + 5_000 < localSpan
    || (native.positions.length + 5 < local.positions.length && native.distanceNm + 0.1 < local.distanceNm);
  if (nativeIsMateriallyWorse) return false;

  const extendsCoverage = nativeFirst < localFirst - 5_000 || nativeLast > localLast + 5_000;
  const addsUsefulPoints = native.positions.length > local.positions.length + 5
    && native.distanceNm >= local.distanceNm - 0.05;
  const restoresMovement = local.distanceNm <= 0.05 && native.distanceNm > 0.25;
  const improvesDistance = native.distanceNm > local.distanceNm + 0.5;
  const improvesSpan = nativeSpan > localSpan + 10_000;

  return extendsCoverage || restoresMovement || improvesDistance || (addsUsefulPoints && improvesSpan);
}

/**
 * Repairs only local traces that already exist and look incomplete. Saved
 * native sessions are never re-injected as new traces, which avoids the old
 * 20-trace oscillation while still allowing a damaged local trace to be fixed
 * from its retained Android journal after installing a hotfix.
 */
export async function repairIncompleteSavedNativeTraces(localTraces: Trace[]): Promise<NativeTraceRepairResult> {
  if (!isAndroidNativeGpsAvailable()) return { traces: localTraces, repairedCount: 0, checkedCount: 0, diagnostics: [] };
  const candidates = localTraces.filter(traceNeedsNativeRepair);
  if (candidates.length === 0) return { traces: localTraces, repairedCount: 0, checkedCount: 0, diagnostics: [] };

  let repairedCount = 0;
  let checkedCount = 0;
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

      const journal = await readNativeSessionJournal(local.sessionId);
      if (!journal.complete || journal.lastOffset !== journal.journalLength) {
        diagnostics.push({
          traceId: local.id,
          sessionId: local.sessionId,
          status: 'incomplete_read',
          message: `Trace ${local.routeName} : lecture incomplète du journal Android (${journal.validPointCount} points, ${journal.lastOffset}/${journal.journalLength} octets).`,
          nativeDiagnostic
        });
        continue;
      }
      if (typeof nativeDiagnostic.validPointCount === 'number' && nativeDiagnostic.validPointCount !== journal.validPointCount) {
        diagnostics.push({
          traceId: local.id,
          sessionId: local.sessionId,
          status: 'incomplete_read',
          message: `Trace ${local.routeName} : lecture incomplète du journal Android (${journal.validPointCount}/${nativeDiagnostic.validPointCount} points).`,
          nativeDiagnostic
        });
        continue;
      }
      const nativePositions = journal.positions;
      if (nativePositions.length < 2) {
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
        positions: nativePositions,
        plannedRoute: local.plannedRoute
      };
      const maxSpeed = local.diagnostics?.maxTraceSpeedKt ?? DEFAULT_MAX_TRACE_SPEED_KT;
      const verification = createNativeJournalVerification(journal);
      const native = nativeSessionToTrace(session, local.plannedRoute, maxSpeed, verification);
      if (!native || !nativeCoverageIsBetter(local, native)) {
        // The complete journal has been checked and cannot improve the local
        // trace. Upgrade the trace marker so the same potentially large journal
        // is not re-read on every application launch.
        checkedCount += 1;
        repairedById.set(local.id, { ...local, schemaVersion: 5, nativeJournalVerification: verification });
        diagnostics.push({
          traceId: local.id,
          sessionId: local.sessionId,
          status: 'journal_not_better',
          message: `Trace ${local.routeName} : journal Android vérifié, il contient la même coupure que la trace locale.`,
          nativeDiagnostic
        });
        continue;
      }

      repairedCount += 1;
      checkedCount += 1;
      repairedById.set(local.id, {
        ...native,
        id: local.id,
        routeId: local.routeId || native.routeId,
        routeName: local.routeName || native.routeName,
        plannedRoute: native.plannedRoute ?? local.plannedRoute,
        schemaVersion: 5,
        nativeJournalVerification: verification
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
    checkedCount,
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
