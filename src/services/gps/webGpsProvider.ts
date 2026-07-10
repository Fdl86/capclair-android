import { toGpsPosition } from './geolocationService';
import type { GpsProvider, GpsProviderError, GpsProviderWatch } from './gpsProvider';
import { noopGpsWatch } from './gpsProvider';

function toProviderError(error: GeolocationPositionError): GpsProviderError {
  if (error.code === error.PERMISSION_DENIED) {
    return {
      code: 'denied',
      message: 'Permission GPS refusée.',
      recoverable: false
    };
  }

  if (error.code === error.TIMEOUT) {
    return {
      code: 'timeout',
      message: 'Aucun fix GPS reçu dans le délai prévu.',
      recoverable: true
    };
  }

  if (error.code === error.POSITION_UNAVAILABLE) {
    return {
      code: 'unavailable',
      message: 'Position GPS indisponible momentanément.',
      recoverable: true
    };
  }

  return {
    code: 'unknown',
    message: error.message || 'Erreur GPS inconnue.',
    recoverable: true
  };
}

export function createWebGpsProvider(nativeShellFallback = false): GpsProvider {
  return {
    id: nativeShellFallback ? 'web-geolocation-fallback' : 'web-geolocation',
    label: nativeShellFallback ? 'GPS web fallback Capacitor' : 'GPS navigateur',
    kind: 'web',
    isAvailable: () => typeof navigator !== 'undefined' && 'geolocation' in navigator,
    startWatching: (onPosition, onError): GpsProviderWatch => {
      if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
        onError({
          code: 'unavailable',
          message: 'GPS indisponible sur cet appareil.',
          recoverable: false
        });
        return noopGpsWatch;
      }

      const watchId = navigator.geolocation.watchPosition(
        (position) => onPosition(toGpsPosition(position)),
        (error) => onError(toProviderError(error)),
        {
          enableHighAccuracy: true,
          maximumAge: 0,
          timeout: 15000
        }
      );

      let detached = false;
      const clear = () => {
        if (detached) return;
        detached = true;
        navigator.geolocation.clearWatch(watchId);
      };

      return {
        detach: clear,
        stop: async () => {
          clear();
          return [];
        },
        sessionInfo: Promise.resolve({
          sessionId: null,
          startedAt: Date.now(),
          resumed: false
        })
      };
    }
  };
}
