import type { GpsPosition } from '../../domain/gps.types';

export type GpsProviderKind = 'web' | 'android-native' | 'native-placeholder';
export type GpsProviderErrorCode = 'denied' | 'unavailable' | 'timeout' | 'unknown';

export interface GpsProviderError {
  code: GpsProviderErrorCode;
  message: string;
  recoverable: boolean;
}

export interface GpsProviderStartOptions {
  routeId?: string;
  routeName?: string;
}

export interface GpsProviderSessionInfo {
  sessionId: string | null;
  startedAt: number;
  resumed: boolean;
  notificationPermissionGranted?: boolean;
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
