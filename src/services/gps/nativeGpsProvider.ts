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
  positions?: NativeGpsPointPayload[];
  plannedRoute?: PlannedRouteSnapshot;
}

interface NativeGpsNativePlugin {
  start(options?: GpsProviderStartOptions): Promise<NativeGpsStatusPayload & { started?: boolean }>;
  getCurrentPosition(options?: { timeoutMs?: number }): Promise<NativeGpsPointPayload>;
  stop(options?: { sinceOffset?: number; sinceTimestamp?: number }): Promise<NativeGpsStatusPayload & { stopped?: boolean; points?: NativeGpsPointPayload[]; completePoints?: NativeGpsPointPayload[]; nextOffset?: number }>;
  getStatus(): Promise<NativeGpsStatusPayload>;
  getPointsSince(options: { sinceOffset?: number; sinceTimestamp?: number }): Promise<NativeGpsStatusPayload & { points?: NativeGpsPointPayload[]; nextOffset?: number }>;
  getRecoverableSessions(options?: { includeSaved?: boolean }): Promise<{ sessions?: NativeRecoverableSessionPayload[] }>;
  getSessionPoints(options: { sessionId: string }): Promise<{ positions?: NativeGpsPointPayload[] }>;
  markSessionSaved(options: { sessionId: string; traceId: string }): Promise<{ saved?: boolean }>;
  deleteSession(options: { sessionId: string }): Promise<{ deleted?: boolean }>;
  addListener(eventName: 'nativeGpsPoint', listenerFunc: (point: NativeGpsPointPayload) => void): Promise<PluginListenerHandle>;
  addListener(eventName: 'nativeGpsStatus', listenerFunc: (status: NativeGpsStatusPayload) => void): Promise<PluginListenerHandle>;
}

export const NativeGps = registerPlugin<NativeGpsNativePlugin>('NativeGps');
const POLL_NATIVE_BUFFER_MS = 4000;

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
    plannedRoute: payload.plannedRoute
  };
}

export function isAndroidNativeGpsAvailable(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

export function createAndroidNativeGpsProvider(): GpsProvider {
  return {
    id: 'android-native-location-service',
    label: 'GPS natif Android',
    kind: 'android-native',
    isAvailable: isAndroidNativeGpsAvailable,
    startWatching: (onPosition, onError, options): GpsProviderWatch => {
      let detached = false;
      let lastNativeTimestamp = 0;
      let lastNativeOffset = 0;
      let lastNativeEventAt = 0;
      let pollInFlight: Promise<void> | null = null;
      let pollRequestedAgain = false;
      const seenPoints = new Set<string>();
      const handles: Promise<PluginListenerHandle>[] = [];
      let completePointsOnStop: GpsPosition[] = [];
      let storageWarningEmitted = false;

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
        if (seenPoints.has(key)) return;
        seenPoints.add(key);
        if (seenPoints.size > 5000) seenPoints.clear();
        lastNativeTimestamp = Math.max(lastNativeTimestamp, position.timestamp);
        if (!detached) onPosition(position);
      };

      const pollNativeBufferOnce = async () => {
        const result = await NativeGps.getPointsSince({
          sinceOffset: lastNativeOffset,
          // The byte offset is authoritative. A timestamp fallback can discard
          // older journal points when a live bridge event arrives after WebView
          // suspension but before the incremental reader catches up.
          sinceTimestamp: 0
        });
        if (typeof result.nextOffset === 'number' && Number.isFinite(result.nextOffset)) {
          lastNativeOffset = Math.max(0, result.nextOffset);
        }
        for (const point of result.points ?? []) emitPosition(point);
      };

      const pollNativeBuffer = async () => {
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
        // Read from the durable journal instead of emitting the bridge payload
        // directly. The JSONL append happens before this event, so serialized
        // offset reads preserve chronological order even after UI suspension.
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
          try {
            await pollNativeBuffer();
          } catch (error) {
            onError(toProviderError(error));
          }
          return toSessionInfo(result);
        })
        .catch((error) => {
          onError(toProviderError(error));
          throw error;
        });

      const pollId = window.setInterval(() => {
        if (detached) return;
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
        stop: async () => {
          window.clearInterval(pollId);
          try {
            await pollNativeBuffer();
            const result = await NativeGps.stop({
              sinceOffset: lastNativeOffset,
              sinceTimestamp: lastNativeTimestamp
            });
            if (typeof result.nextOffset === 'number' && Number.isFinite(result.nextOffset)) {
              lastNativeOffset = Math.max(0, result.nextOffset);
            }
            for (const point of result.points ?? []) emitPosition(point);
            completePointsOnStop = (result.completePoints ?? [])
              .map(nativePayloadToGpsPosition)
              .filter((point): point is GpsPosition => point !== null);
          } finally {
            detached = true;
            removeListeners();
          }
          return completePointsOnStop;
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
