import type { GpsPosition } from '../../domain/gps.types';
import type { PlannedRouteSnapshot } from '../../domain/trace.types';

export type GpsProviderKind = 'web' | 'android-native' | 'native-placeholder';
export type GpsProviderErrorCode = 'denied' | 'unavailable' | 'timeout' | 'storage' | 'unknown';

export interface GpsProviderError {
  code: GpsProviderErrorCode;
  message: string;
  recoverable: boolean;
}

export interface GpsProviderStartOptions {
  routeId?: string;
  routeName?: string;
  plannedRoute?: PlannedRouteSnapshot;
}

export interface GpsProviderSessionInfo {
  sessionId: string | null;
  routeId?: string;
  routeName?: string;
  startedAt: number;
  resumed: boolean;
  notificationPermissionGranted?: boolean;
  plannedRoute?: PlannedRouteSnapshot;
}

export interface GpsProviderWatch {
  /** Detach UI listeners without stopping an Android foreground service. */
  detach: () => void;
  /** Flush pending native points, stop the provider, and return anything not yet emitted. */
  stop: () => Promise<GpsPosition[]>;
  sessionInfo?: Promise<GpsProviderSessionInfo>;
}

export interface GpsProvider {
  id: string;
  label: string;
  kind: GpsProviderKind;
  isAvailable: () => boolean;
  startWatching: (
    onPosition: (position: GpsPosition) => void,
    onError: (error: GpsProviderError) => void,
    options?: GpsProviderStartOptions
  ) => GpsProviderWatch;
}

export const noopGpsWatch: GpsProviderWatch = {
  detach: () => undefined,
  stop: async () => []
};
