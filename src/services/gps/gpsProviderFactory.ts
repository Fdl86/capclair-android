import { Capacitor } from '@capacitor/core';
import type { GpsProvider } from './gpsProvider';
import { createAndroidNativeGpsProvider } from './nativeGpsProvider';
import { createWebGpsProvider } from './webGpsProvider';

export interface GpsProviderSelection {
  provider: GpsProvider;
  nativeRuntime: boolean;
  nativeProviderPrepared: boolean;
}

export function createGpsProviderSelection(): GpsProviderSelection {
  const nativeRuntime = Capacitor.isNativePlatform();
  const androidNativeProvider = createAndroidNativeGpsProvider();
  if (androidNativeProvider.isAvailable()) {
    return { provider: androidNativeProvider, nativeRuntime, nativeProviderPrepared: true };
  }
  return { provider: createWebGpsProvider(nativeRuntime), nativeRuntime, nativeProviderPrepared: nativeRuntime };
}
