import { useEffect, useRef, useState } from 'react';

type WakeLockSentinelLike = {
  released?: boolean;
  release: () => Promise<void>;
  addEventListener?: (type: 'release', listener: () => void) => void;
};

type NavigatorWithWakeLock = Navigator & {
  wakeLock?: {
    request: (type: 'screen') => Promise<WakeLockSentinelLike>;
  };
};

export function useScreenWakeLock(enabled: boolean): boolean {
  const [active, setActive] = useState(false);
  const wakeLockRef = useRef<WakeLockSentinelLike | null>(null);

  useEffect(() => {
    let cancelled = false;

    const releaseWakeLock = async () => {
      const sentinel = wakeLockRef.current;
      wakeLockRef.current = null;
      setActive(false);
      if (sentinel && !sentinel.released) {
        try {
          await sentinel.release();
        } catch {
          // Wake Lock release can fail silently on some Android WebViews.
        }
      }
    };

    const requestWakeLock = async () => {
      const navigatorWithWakeLock = navigator as NavigatorWithWakeLock;
      if (!enabled || wakeLockRef.current || !navigatorWithWakeLock.wakeLock) {
        setActive(Boolean(wakeLockRef.current));
        return;
      }

      try {
        const sentinel = await navigatorWithWakeLock.wakeLock.request('screen');
        if (cancelled || !enabled) {
          await sentinel.release();
          return;
        }

        wakeLockRef.current = sentinel;
        setActive(true);
        sentinel.addEventListener?.('release', () => {
          if (wakeLockRef.current === sentinel) {
            wakeLockRef.current = null;
            setActive(false);
          }
        });
      } catch {
        setActive(false);
      }
    };

    if (enabled) {
      void requestWakeLock();
    } else {
      void releaseWakeLock();
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && enabled && !wakeLockRef.current) {
        void requestWakeLock();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      void releaseWakeLock();
    };
  }, [enabled]);

  return active;
}
