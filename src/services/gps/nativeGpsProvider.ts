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

interface NativeGpsNativePlugin {
  start(options?: GpsProviderStartOptions): Promise<NativeGpsStatusPayload & { started?: boolean }>;
  getCurrentPosition(options?: { timeoutMs?: number }): Promise<NativeGpsPointPayload>;
  stop(options?: { sessionId?: string | null }): Promise<NativeGpsStatusPayload & { stopped?: boolean }>;
  getStatus(): Promise<NativeGpsStatusPayload>;
  getPointsSince(options: { sinceOffset?: number; sinceTimestamp?: number }): Promise<NativeGpsStatusPayload & { points?: NativeGpsPointPayload[]; nextOffset?: number }>;
  getRecoverableSessions(options?: { includeSaved?: boolean }): Promise<{ sessions?: NativeRecoverableSessionPayload[] }>;
  getSessionPoints(options: { sessionId: string }): Promise<{ positions?: NativeGpsPointPayload[] }>;
  getSessionPointsChunk(options: { sessionId: string; sinceOffset?: number; maxPoints?: number }): Promise<{ points?: NativeGpsPointPayload[]; nextOffset?: number; hasMore?: boolean }>;
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

function yieldToUi(): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, 0));
}

export async function readNativeSessionPositions(sessionId: string): Promise<GpsPosition[]> {
  if (!sessionId || !isAndroidNativeGpsAvailable()) return [];

  const positions: GpsPosition[] = [];
  let offset = 0;
  let guard = 0;
  let hasMore = true;

  while (hasMore && positions.length < MAX_NATIVE_JOURNAL_POINTS) {
    const result = await NativeGps.getSessionPointsChunk({
      sessionId,
      sinceOffset: offset,
      maxPoints: NATIVE_JOURNAL_PAGE_SIZE
    });

    const nextOffset = typeof result.nextOffset === 'number' && Number.isFinite(result.nextOffset)
      ? Math.max(0, result.nextOffset)
      : offset;
    for (const payload of result.points ?? []) {
      const position = nativePayloadToGpsPosition(payload);
      if (position) positions.push(position);
    }

    hasMore = result.hasMore === true && nextOffset > offset;
    offset = nextOffset;
    guard += 1;
    if (guard > 500) throw new Error('Lecture du journal GPS interrompue : pagination incohérente.');
    if (hasMore) await yieldToUi();
  }

  return positions;
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
            if (!stoppingSessionId) return [];
            return readNativeSessionPositions(stoppingSessionId);
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
