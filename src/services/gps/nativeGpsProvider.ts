import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import type { GpsPosition } from '../../domain/gps.types';
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
}

interface NativeGpsNativePlugin {
  start(options?: GpsProviderStartOptions): Promise<NativeGpsStatusPayload & { started?: boolean }>;
  getCurrentPosition(options?: { timeoutMs?: number }): Promise<NativeGpsPointPayload>;
  stop(): Promise<NativeGpsStatusPayload & { stopped?: boolean; points?: NativeGpsPointPayload[] }>;
  getStatus(): Promise<NativeGpsStatusPayload>;
  getPointsSince(options: { sinceTimestamp: number }): Promise<NativeGpsStatusPayload & { points?: NativeGpsPointPayload[] }>;
  getRecoverableSessions(): Promise<{ sessions?: NativeRecoverableSessionPayload[] }>;
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
    startedAt: typeof payload.startedAt === 'number' && Number.isFinite(payload.startedAt) ? payload.startedAt : Date.now(),
    resumed: payload.resumed === true,
    notificationPermissionGranted: payload.notificationPermissionGranted
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
      const seenPoints = new Set<string>();
      const handles: Promise<PluginListenerHandle>[] = [];
      const emittedOnStop: GpsPosition[] = [];

      const emitPosition = (payload: NativeGpsPointPayload, collectOnStop = false) => {
        const position = nativePayloadToGpsPosition(payload);
        if (!position) return;
        const key = `${position.timestamp}:${position.latitude.toFixed(7)}:${position.longitude.toFixed(7)}`;
        if (seenPoints.has(key)) return;
        seenPoints.add(key);
        if (seenPoints.size > 5000) seenPoints.clear();
        lastNativeTimestamp = Math.max(lastNativeTimestamp, position.timestamp);
        if (collectOnStop) emittedOnStop.push(position);
        if (!detached) onPosition(position);
      };

      const pollNativeBuffer = async (collectOnStop = false) => {
        const result = await NativeGps.getPointsSince({ sinceTimestamp: lastNativeTimestamp });
        for (const point of result.points ?? []) emitPosition(point, collectOnStop);
      };

      const removeListeners = () => {
        for (const handlePromise of handles) {
          handlePromise.then((handle) => handle.remove()).catch(() => undefined);
        }
      };

      handles.push(NativeGps.addListener('nativeGpsPoint', (point) => {
        if (!detached) emitPosition(point);
      }));
      handles.push(NativeGps.addListener('nativeGpsStatus', (payload) => {
        if (detached || payload.status !== 'error') return;
        onError({
          code: 'unavailable',
          message: payload.lastError || 'Signal GPS Android momentanément indisponible.',
          recoverable: true
        });
      }));

      const sessionInfo = NativeGps.start(options)
        .then(async (result) => {
          await pollNativeBuffer();
          return toSessionInfo(result);
        })
        .catch((error) => {
          onError(toProviderError(error));
          throw error;
        });

      const pollId = window.setInterval(() => {
        if (detached) return;
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
            await pollNativeBuffer(true);
            const result = await NativeGps.stop();
            for (const point of result.points ?? []) emitPosition(point, true);
          } finally {
            detached = true;
            removeListeners();
          }
          return emittedOnStop;
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
