import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import type { GpsPosition } from '../../domain/gps.types';
import type { PlannedRouteSnapshot } from '../../domain/trace.types';
import type {
  GpsProvider,
  GpsProviderError,
  GpsProviderSessionInfo,
  GpsProviderStartOptions,
  GpsProviderWatch
} from './gpsProvider';

export interface NativeGpsPointPayload {
  latitude?: number;
  longitude?: number;
  altitude?: number | null;
  altitudeAccuracy?: number | null;
  vitesse?: number | null;
  track?: number | null;
  timestamp?: number;
  precision?: number | null;
  provider?: string;
  native?: boolean;
  cached?: boolean;
  persisted?: boolean;
}

export interface NativeGpsStatusPayload {
  running?: boolean;
  provider?: string;
  bufferedPoints?: number;
  status?: 'started' | 'stopped' | 'error';
  lastError?: string | null;
  sessionId?: string | null;
  routeId?: string;
  routeName?: string;
  startedAt?: number | null;
  endedAt?: number | null;
  saved?: boolean;
  resumed?: boolean;
  notificationPermissionGranted?: boolean;
  journalWriteHealthy?: boolean;
  journalOffset?: number;
  plannedRoute?: PlannedRouteSnapshot;
}


export interface NativeGpsSessionDiagnosticPayload {
  sessionId?: string;
  found?: boolean;
  metadataFound?: boolean;
  journalFound?: boolean;
  eventsFound?: boolean;
  journalSizeBytes?: number;
  eventsSizeBytes?: number;
  validPointCount?: number;
  malformedPointLines?: number;
  firstPointAt?: number | null;
  lastPointAt?: number | null;
  maxPointGapMs?: number;
  maxPointGapStart?: number | null;
  maxPointGapEnd?: number | null;
  eventCount?: number;
  malformedEventLines?: number;
  heartbeatCount?: number;
  firstHeartbeatAt?: number | null;
  lastHeartbeatAt?: number | null;
  maxHeartbeatGapMs?: number;
  serviceStartedCount?: number;
  serviceDestroyedCount?: number;
  taskRemovedCount?: number;
  watchdogRestartCount?: number;
  watchdogSoftRecoveryCount?: number;
  watchdogHardRecoveryCount?: number;
  watchdogRuntimeRecoveryCount?: number;
  probeRequestedCount?: number;
  probeSucceededCount?: number;
  probeTimeoutCount?: number;
  wakeLockAcquiredCount?: number;
  likelyCause?: 'journal_missing' | 'native_journal_continuous' | 'insufficient_heartbeat_data' | 'location_callbacks_missing_while_service_alive' | 'service_suspended_killed_or_restarted' | string;
  metadata?: Record<string, unknown>;
  error?: string;
  metadataError?: string;
  journalReadError?: string;
  eventsReadError?: string;
}

export interface NativeRecoverableSessionPayload {
  schemaVersion?: number;
  sessionId?: string;
  routeId?: string;
  routeName?: string;
  startedAt?: number;
  endedAt?: number | null;
  source?: string;
  running?: boolean;
  saved?: boolean;
  traceId?: string;
  journalSizeBytes?: number;
  positions?: NativeGpsPointPayload[];
  plannedRoute?: PlannedRouteSnapshot;
}

export interface NativeGpsJournalPagePayload {
  points?: NativeGpsPointPayload[];
  requestedOffset?: number;
  startOffset?: number;
  nextOffset?: number;
  journalLength?: number;
  pagePointCount?: number;
  malformedLineCount?: number;
  trailingPartial?: boolean;
  eofReached?: boolean;
  hasMore?: boolean;
}

export interface NativeGpsJournalReadResult {
  sessionId: string;
  positions: GpsPosition[];
  pageCount: number;
  lastOffset: number;
  journalLength: number;
  validPointCount: number;
  malformedLineCount: number;
  complete: boolean;
  trailingPartial: boolean;
}

export type NativeGpsJournalPageFetcher = (
  offset: number,
  maxPoints: number
) => Promise<NativeGpsJournalPagePayload>;

interface NativeGpsNativePlugin {
  start(options?: GpsProviderStartOptions): Promise<NativeGpsStatusPayload & { started?: boolean }>;
  getCurrentPosition(options?: { timeoutMs?: number }): Promise<NativeGpsPointPayload>;
  stop(options?: { sessionId?: string | null }): Promise<NativeGpsStatusPayload & { stopped?: boolean }>;
  getStatus(): Promise<NativeGpsStatusPayload>;
  getPointsSince(options: { sinceOffset?: number; sinceTimestamp?: number }): Promise<NativeGpsStatusPayload & { points?: NativeGpsPointPayload[]; nextOffset?: number }>;
  getRecoverableSessions(options?: { includeSaved?: boolean }): Promise<{ sessions?: NativeRecoverableSessionPayload[] }>;
  getSessionPoints(options: { sessionId: string }): Promise<{ positions?: NativeGpsPointPayload[] }>;
  getSessionPointsChunk(options: { sessionId: string; sinceOffset?: number; maxPoints?: number }): Promise<NativeGpsJournalPagePayload>;
  getSessionDiagnostic(options: { sessionId: string }): Promise<NativeGpsSessionDiagnosticPayload>;
  exportSessionDiagnostic(options: {
    sessionId: string;
    localTraceJson: string;
    appVersion: string;
    fileName: string;
  }): Promise<{ shared?: boolean; fileName?: string; diagnostic?: NativeGpsSessionDiagnosticPayload }>;
  markSessionSaved(options: { sessionId: string; traceId: string }): Promise<{ saved?: boolean }>;
  deleteSession(options: { sessionId: string }): Promise<{ deleted?: boolean }>;
  addListener(eventName: 'nativeGpsPoint', listenerFunc: (point: NativeGpsPointPayload) => void): Promise<PluginListenerHandle>;
  addListener(eventName: 'nativeGpsStatus', listenerFunc: (status: NativeGpsStatusPayload) => void): Promise<PluginListenerHandle>;
}

export const NativeGps = registerPlugin<NativeGpsNativePlugin>('NativeGps');
const POLL_NATIVE_BUFFER_MS = 4000;
const NATIVE_BACKFILL_THRESHOLD = 30;

function toProviderError(error: unknown): GpsProviderError {
  const message = error instanceof Error ? error.message : String(error || 'Erreur GPS natif Android.');
  const lower = message.toLowerCase();
  if (lower.includes('denied') || lower.includes('refus') || lower.includes('permission')) {
    return { code: 'denied', message: message || 'Permission GPS Android refusée.', recoverable: false };
  }
  if (lower.includes('provider') || lower.includes('indisponible')) {
    return { code: 'unavailable', message: message || 'GPS Android indisponible.', recoverable: true };
  }
  return { code: 'unknown', message, recoverable: true };
}

function normalizeNumber(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return value;
}

export function nativePayloadToGpsPosition(payload: NativeGpsPointPayload): GpsPosition | null {
  const latitude = normalizeNumber(payload.latitude);
  const longitude = normalizeNumber(payload.longitude);
  if (latitude === null || longitude === null) return null;
  return {
    latitude,
    longitude,
    altitude: normalizeNumber(payload.altitude),
    altitudeAccuracy: normalizeNumber(payload.altitudeAccuracy),
    vitesse: normalizeNumber(payload.vitesse),
    track: normalizeNumber(payload.track),
    timestamp: normalizeNumber(payload.timestamp) ?? Date.now(),
    precision: normalizeNumber(payload.precision)
  };
}

function toSessionInfo(payload: NativeGpsStatusPayload): GpsProviderSessionInfo {
  return {
    sessionId: typeof payload.sessionId === 'string' && payload.sessionId ? payload.sessionId : null,
    routeId: typeof payload.routeId === 'string' && payload.routeId ? payload.routeId : undefined,
    routeName: typeof payload.routeName === 'string' && payload.routeName ? payload.routeName : undefined,
    startedAt: typeof payload.startedAt === 'number' && Number.isFinite(payload.startedAt) ? payload.startedAt : Date.now(),
    resumed: payload.resumed === true,
    notificationPermissionGranted: payload.notificationPermissionGranted,
    plannedRoute: payload.plannedRoute,
    journalOffset: typeof payload.journalOffset === 'number' && Number.isFinite(payload.journalOffset)
      ? Math.max(0, payload.journalOffset)
      : undefined
  };
}

export function isAndroidNativeGpsAvailable(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

const NATIVE_JOURNAL_PAGE_SIZE = 500;
const MAX_NATIVE_JOURNAL_POINTS = 100_000;
const MAX_NATIVE_JOURNAL_PAGES = 500;
const journalReadInFlight = new Map<string, Promise<NativeGpsJournalReadResult>>();

function yieldToUi(): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, 0));
}

function finiteNonNegative(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

export async function readNativeJournalPages(
  sessionId: string,
  fetchPage: NativeGpsJournalPageFetcher,
  pauseBetweenPages: () => Promise<void> = yieldToUi
): Promise<NativeGpsJournalReadResult> {
  if (!sessionId) throw new Error('Lecture du journal GPS impossible : session absente.');

  const positions: GpsPosition[] = [];
  let offset = 0;
  let pageCount = 0;
  let journalLength: number | null = null;
  let validPointCount = 0;
  let malformedLineCount = 0;
  let trailingPartial = false;
  let complete = false;

  while (!complete) {
    if (pageCount >= MAX_NATIVE_JOURNAL_PAGES) {
      throw new Error(`Lecture du journal GPS interrompue après ${pageCount} pages : pagination incohérente.`);
    }

    const page = await fetchPage(offset, NATIVE_JOURNAL_PAGE_SIZE);
    pageCount += 1;

    const echoedRequestedOffset = finiteNonNegative(page.requestedOffset);
    const startOffset = finiteNonNegative(page.startOffset);
    const nextOffset = finiteNonNegative(page.nextOffset);
    const pageJournalLength = finiteNonNegative(page.journalLength);
    if (startOffset === null || nextOffset === null || pageJournalLength === null) {
      throw new Error(`Lecture incomplète du journal GPS à la page ${pageCount} : métadonnées de pagination absentes.`);
    }
    if (echoedRequestedOffset !== null && echoedRequestedOffset !== offset) {
      throw new Error(`Lecture incomplète du journal GPS à la page ${pageCount} : offset transmis ${offset}, offset décodé ${echoedRequestedOffset}.`);
    }
    if (startOffset !== offset) {
      throw new Error(`Lecture incomplète du journal GPS à la page ${pageCount} : offset demandé ${offset}, offset reçu ${startOffset}.`);
    }
    if (nextOffset < startOffset || nextOffset > pageJournalLength) {
      throw new Error(`Lecture incomplète du journal GPS à la page ${pageCount} : offset ${nextOffset}/${pageJournalLength} invalide.`);
    }

    if (journalLength !== null && pageJournalLength < journalLength) {
      throw new Error(`Lecture du journal GPS interrompue : taille réduite de ${journalLength} à ${pageJournalLength} octets.`);
    }
    journalLength = Math.max(journalLength ?? 0, pageJournalLength);

    const payloads = page.points ?? [];
    const declaredPageCount = finiteNonNegative(page.pagePointCount);
    if (declaredPageCount !== null && declaredPageCount !== payloads.length) {
      throw new Error(`Lecture incomplète du journal GPS à la page ${pageCount} : ${payloads.length}/${declaredPageCount} points reçus.`);
    }

    validPointCount += payloads.length;
    for (const payload of payloads) {
      const position = nativePayloadToGpsPosition(payload);
      if (position) positions.push(position);
    }
    malformedLineCount += Math.trunc(finiteNonNegative(page.malformedLineCount) ?? 0);
    trailingPartial = page.trailingPartial === true;

    if (validPointCount > MAX_NATIVE_JOURNAL_POINTS) {
      throw new Error(`Journal GPS trop volumineux : plus de ${MAX_NATIVE_JOURNAL_POINTS} positions.`);
    }
    if (trailingPartial) {
      throw new Error(`Lecture incomplète du journal GPS à la page ${pageCount} : dernière ligne partielle à l'offset ${nextOffset}.`);
    }

    const hasMore = page.hasMore === true;
    const eofReached = page.eofReached === true;
    if (hasMore) {
      if (nextOffset <= offset) {
        throw new Error(`Lecture incomplète du journal GPS à la page ${pageCount} : offset bloqué à ${offset}.`);
      }
      offset = nextOffset;
      await pauseBetweenPages();
      continue;
    }

    if (!eofReached || nextOffset !== pageJournalLength) {
      throw new Error(
        `Lecture incomplète du journal GPS : ${positions.length} points lus, offset ${nextOffset}/${pageJournalLength}.`
      );
    }

    offset = nextOffset;
    complete = true;
  }

  return {
    sessionId,
    positions,
    pageCount,
    lastOffset: offset,
    journalLength: journalLength ?? 0,
    validPointCount,
    malformedLineCount,
    complete,
    trailingPartial
  };
}

function startNativeSessionJournalRead(sessionId: string): Promise<NativeGpsJournalReadResult> {
  const task = readNativeJournalPages(
    sessionId,
    (offset, maxPoints) => NativeGps.getSessionPointsChunk({
      sessionId,
      sinceOffset: offset,
      maxPoints
    })
  ).finally(() => {
    if (journalReadInFlight.get(sessionId) === task) journalReadInFlight.delete(sessionId);
  });
  journalReadInFlight.set(sessionId, task);
  return task;
}

export async function readNativeSessionJournal(
  sessionId: string,
  options: { forceFresh?: boolean } = {}
): Promise<NativeGpsJournalReadResult> {
  if (!sessionId || !isAndroidNativeGpsAvailable()) {
    return {
      sessionId,
      positions: [],
      pageCount: 0,
      lastOffset: 0,
      journalLength: 0,
      validPointCount: 0,
      malformedLineCount: 0,
      complete: true,
      trailingPartial: false
    };
  }

  if (options.forceFresh) {
    // A backfill read may have started while the native service was still
    // writing. Wait for it, then start a new snapshot after stop() so the final
    // seconds can never be omitted from the saved trace.
    while (journalReadInFlight.has(sessionId)) {
      await journalReadInFlight.get(sessionId)!.catch(() => undefined);
    }
    return startNativeSessionJournalRead(sessionId);
  }

  return journalReadInFlight.get(sessionId) ?? startNativeSessionJournalRead(sessionId);
}

export async function readNativeSessionPositions(sessionId: string): Promise<GpsPosition[]> {
  return (await readNativeSessionJournal(sessionId)).positions;
}

export function createAndroidNativeGpsProvider(): GpsProvider {
  return {
    id: 'android-native-location-service',
    label: 'GPS natif Android',
    kind: 'android-native',
    isAvailable: isAndroidNativeGpsAvailable,
    startWatching: (onPosition, onError, options, onBackfill): GpsProviderWatch => {
      let detached = false;
      let sessionReady = false;
      let providerSessionId: string | null = null;
      let lastNativeOffset = 0;
      let lastNativeEventAt = 0;
      let pollInFlight: Promise<void> | null = null;
      let pollRequestedAgain = false;
      let stopPromise: Promise<GpsPosition[]> | null = null;
      const seenPoints = new Set<string>();
      const seenOrder: string[] = [];
      const handles: Promise<PluginListenerHandle>[] = [];
      let storageWarningEmitted = false;

      const rememberPoint = (key: string) => {
        if (seenPoints.has(key)) return false;
        seenPoints.add(key);
        seenOrder.push(key);
        if (seenOrder.length > 8000) {
          const expired = seenOrder.splice(0, 2000);
          expired.forEach((item) => seenPoints.delete(item));
        }
        return true;
      };

      const emitPosition = (payload: NativeGpsPointPayload) => {
        if (payload.persisted === false && !storageWarningEmitted) {
          storageWarningEmitted = true;
          onError({
            code: 'storage',
            message: 'Journal GPS Android non sécurisé : écriture locale impossible. Libérez de l’espace avant de poursuivre.',
            recoverable: true
          });
        }
        const position = nativePayloadToGpsPosition(payload);
        if (!position) return;
        const key = `${position.timestamp}:${position.latitude.toFixed(7)}:${position.longitude.toFixed(7)}`;
        if (!rememberPoint(key)) return;
        if (!detached) onPosition(position);
      };

      const pollNativeBufferOnce = async () => {
        if (!sessionReady || detached || !providerSessionId) return;

        const bufferedPositions: GpsPosition[] = [];
        let pageCount = 0;
        let hasMore = true;
        let shouldBatch = false;

        while (hasMore && !detached) {
          const previousOffset = lastNativeOffset;
          const result = await NativeGps.getSessionPointsChunk({
            sessionId: providerSessionId,
            sinceOffset: lastNativeOffset,
            maxPoints: NATIVE_JOURNAL_PAGE_SIZE
          });
          const nextOffset = typeof result.nextOffset === 'number' && Number.isFinite(result.nextOffset)
            ? Math.max(0, result.nextOffset)
            : previousOffset;
          const payloads = result.points ?? [];
          hasMore = result.hasMore === true && nextOffset > previousOffset;
          lastNativeOffset = nextOffset;
          pageCount += 1;

          if (pageCount === 1) {
            shouldBatch = hasMore || payloads.length > NATIVE_BACKFILL_THRESHOLD;
          }

          if (shouldBatch) {
            for (const payload of payloads) {
              const position = nativePayloadToGpsPosition(payload);
              if (position) bufferedPositions.push(position);
            }
          } else {
            for (const payload of payloads) emitPosition(payload);
          }

          if (pageCount > 500) throw new Error('Rattrapage GPS interrompu : pagination incohérente.');
          if (hasMore) await yieldToUi();
        }

        if (shouldBatch && bufferedPositions.length > 0 && !detached) {
          if (onBackfill) onBackfill(bufferedPositions);
          else {
            // Defensive fallback for providers used without a batch consumer:
            // keep recent visibility without flooding the UI thread.
            const recent = bufferedPositions.slice(-NATIVE_BACKFILL_THRESHOLD);
            recent.forEach(onPosition);
          }
        }
      };

      const pollNativeBuffer = async () => {
        if (!sessionReady || detached) {
          pollRequestedAgain = true;
          return;
        }
        if (pollInFlight) {
          pollRequestedAgain = true;
          return pollInFlight;
        }
        pollInFlight = (async () => {
          do {
            pollRequestedAgain = false;
            await pollNativeBufferOnce();
          } while (pollRequestedAgain && !detached);
        })().finally(() => {
          pollInFlight = null;
        });
        return pollInFlight;
      };

      const removeListeners = () => {
        for (const handlePromise of handles) {
          handlePromise.then((handle) => handle.remove()).catch(() => undefined);
        }
      };

      handles.push(NativeGps.addListener('nativeGpsPoint', () => {
        lastNativeEventAt = Date.now();
        if (!sessionReady) {
          pollRequestedAgain = true;
          return;
        }
        if (!detached) pollNativeBuffer().catch((error) => onError(toProviderError(error)));
      }));
      handles.push(NativeGps.addListener('nativeGpsStatus', (payload) => {
        if (detached || payload.status !== 'error') return;
        const storageError = payload.journalWriteHealthy === false
          || (payload.lastError ?? '').toLowerCase().includes('écriture journal');
        if (storageError && storageWarningEmitted) return;
        if (storageError) storageWarningEmitted = true;
        onError({
          code: storageError ? 'storage' : 'unavailable',
          message: payload.lastError || (storageError
            ? 'Journal GPS Android non sécurisé.'
            : 'Signal GPS Android momentanément indisponible.'),
          recoverable: true
        });
      }));

      const sessionInfo = NativeGps.start(options)
        .then(async (result) => {
          const info = toSessionInfo(result);
          providerSessionId = info.sessionId;
          // On a resumed session, the historical journal is hydrated once by the
          // hook. Starting live polling at the current byte offset avoids replaying
          // thousands of old points through React after the screen wakes up.
          lastNativeOffset = info.resumed ? (info.journalOffset ?? 0) : 0;
          sessionReady = true;
          try {
            await pollNativeBuffer();
          } catch (error) {
            onError(toProviderError(error));
          }
          return info;
        })
        .catch((error) => {
          onError(toProviderError(error));
          throw error;
        });

      const pollId = window.setInterval(() => {
        if (detached || !sessionReady) return;
        const nativeEventsAreFlowing = lastNativeEventAt > 0 && Date.now() - lastNativeEventAt < POLL_NATIVE_BUFFER_MS * 2;
        if (nativeEventsAreFlowing) return;
        pollNativeBuffer().catch((error) => onError(toProviderError(error)));
      }, POLL_NATIVE_BUFFER_MS);

      return {
        sessionInfo,
        detach: () => {
          if (detached) return;
          detached = true;
          window.clearInterval(pollId);
          removeListeners();
        },
        stop: () => {
          if (stopPromise) return stopPromise;
          stopPromise = (async () => {
            window.clearInterval(pollId);
            detached = true;
            removeListeners();

            const info = await sessionInfo.catch(() => null);
            const stoppingSessionId = providerSessionId ?? info?.sessionId ?? null;
            await NativeGps.stop({ sessionId: stoppingSessionId });
            return [];
          })();
          return stopPromise;
        }
      };
    }
  };
}

export async function getNativeGpsRuntimeStatus(): Promise<NativeGpsStatusPayload | null> {
  if (!isAndroidNativeGpsAvailable()) return null;
  try {
    return await NativeGps.getStatus();
  } catch {
    return null;
  }
}


export async function requestCurrentGpsPosition(timeoutMs = 12000): Promise<GpsPosition> {
  if (isAndroidNativeGpsAvailable()) {
    const payload = await NativeGps.getCurrentPosition({ timeoutMs });
    const position = nativePayloadToGpsPosition(payload);
    if (!position) throw new Error('Position GPS Android invalide.');
    return position;
  }

  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    throw new Error('Géolocalisation indisponible sur cet appareil.');
  }

  return new Promise<GpsPosition>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          altitude: position.coords.altitude,
          altitudeAccuracy: position.coords.altitudeAccuracy,
          vitesse: position.coords.speed === null ? null : position.coords.speed * 1.94384,
          track: position.coords.heading,
          timestamp: position.timestamp,
          precision: position.coords.accuracy
        });
      },
      (error) => {
        const message = error.code === error.PERMISSION_DENIED
          ? 'Permission GPS refusée.'
          : error.code === error.TIMEOUT
            ? 'Délai de localisation GPS dépassé.'
            : 'Position GPS indisponible.';
        reject(new Error(message));
      },
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 15000 }
    );
  });
}
