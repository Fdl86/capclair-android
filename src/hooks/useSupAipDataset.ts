import { useCallback, useEffect, useRef, useState } from 'react';
import type { SupAipDatasetBundle } from '../services/supaip/supAipDataset';
import { isSupAipDatasetStale } from '../services/supaip/supAipDataset';
import { loadBestLocalSupAipBundle, synchronizeSupAipBundle } from '../services/supaip/supAipRepository';

export type SupAipSyncState = 'loading' | 'ready' | 'checking' | 'updating' | 'error';

export interface SupAipDatasetState {
  bundle: SupAipDatasetBundle | null;
  state: SupAipSyncState;
  error: string | null;
  lastCheckedAtIso: string | null;
  lastChangedAtIso: string | null;
  stale: boolean;
  refresh: () => Promise<void>;
}

const CHECK_INTERVAL_MS = 30 * 60 * 1000;

export function useSupAipDataset(networkSyncEnabled = true): SupAipDatasetState {
  const [bundle, setBundle] = useState<SupAipDatasetBundle | null>(null);
  const [state, setState] = useState<SupAipSyncState>('loading');
  const [error, setError] = useState<string | null>(null);
  const [lastCheckedAtIso, setLastCheckedAtIso] = useState<string | null>(null);
  const [lastChangedAtIso, setLastChangedAtIso] = useState<string | null>(null);
  const activeBundleRef = useRef<SupAipDatasetBundle | null>(null);
  const requestRef = useRef<Promise<void> | null>(null);
  const networkSyncEnabledRef = useRef(networkSyncEnabled);

  useEffect(() => {
    activeBundleRef.current = bundle;
  }, [bundle]);

  useEffect(() => {
    networkSyncEnabledRef.current = networkSyncEnabled;
  }, [networkSyncEnabled]);

  const refresh = useCallback(async () => {
    if (requestRef.current) return requestRef.current;
    const operation = (async () => {
      const current = activeBundleRef.current;
      if (!current || !networkSyncEnabledRef.current) return;
      setState('checking');
      setError(null);
      try {
        const result = await synchronizeSupAipBundle(current);
        setLastCheckedAtIso(result.checkedAtIso);
        if (result.changed) {
          setState('updating');
          activeBundleRef.current = result.bundle;
          setBundle(result.bundle);
          setLastChangedAtIso(result.bundle.activatedAtIso);
        }
        setState('ready');
      } catch (cause) {
        setState('error');
        setError(cause instanceof Error ? cause.message : 'Contrôle SUP AIP impossible.');
      }
    })().finally(() => {
      requestRef.current = null;
    });
    requestRef.current = operation;
    return operation;
  }, []);

  useEffect(() => {
    let cancelled = false;
    void loadBestLocalSupAipBundle().then((loaded) => {
      if (cancelled) return;
      activeBundleRef.current = loaded;
      setBundle(loaded);
      setState('ready');
      if (networkSyncEnabledRef.current) void refresh();
    }).catch((cause) => {
      if (cancelled) return;
      setError(cause instanceof Error ? cause.message : 'Base SUP AIP indisponible.');
      setState('error');
    });
    return () => {
      cancelled = true;
    };
  }, [refresh]);


  useEffect(() => {
    if (networkSyncEnabled && bundle) void refresh();
  }, [bundle, networkSyncEnabled, refresh]);

  useEffect(() => {
    const interval = window.setInterval(() => void refresh(), CHECK_INTERVAL_MS);
    const online = () => void refresh();
    window.addEventListener('online', online);
    const visibility = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    window.addEventListener('focus', online);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('online', online);
      window.removeEventListener('focus', online);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [refresh]);

  return {
    bundle,
    state,
    error,
    lastCheckedAtIso,
    lastChangedAtIso,
    stale: isSupAipDatasetStale(bundle?.status ?? null),
    refresh
  };
}
