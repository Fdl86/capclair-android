import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReplayModel } from '../domain/replay.types';
import type { TerrainProfileData, TerrainProfilePhase } from '../domain/terrain.types';
import type { Trace } from '../domain/trace.types';
import {
  buildTerrainFingerprint,
  fetchTerrainProfile,
  interpolateTerrainElevation,
  loadTerrainProfileCache,
  saveTerrainProfileCache,
} from '../services/replay/terrainProfile';

interface TerrainProfileState {
  phase: TerrainProfilePhase;
  profile: TerrainProfileData | null;
  error: string | null;
  fromCache: boolean;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return String(error || 'Relief indisponible.');
}

export function useTerrainProfile(trace: Trace, model: ReplayModel) {
  const fingerprint = useMemo(
    () => buildTerrainFingerprint(trace.id, model),
    [model, trace.id],
  );
  const [visible, setVisible] = useState(true);
  const [retryToken, setRetryToken] = useState(0);
  const [state, setState] = useState<TerrainProfileState>({
    phase: 'idle',
    profile: null,
    error: null,
    fromCache: false,
  });

  useEffect(() => {
    if (model.points.length < 2) {
      setState({ phase: 'unavailable', profile: null, error: null, fromCache: false });
      return undefined;
    }

    const cached = loadTerrainProfileCache(trace.id, fingerprint);
    if (cached) {
      setState({ phase: 'ready', profile: cached, error: null, fromCache: true });
      return undefined;
    }

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setState({
        phase: 'offline',
        profile: null,
        error: 'Relief indisponible hors connexion pour cette trace.',
        fromCache: false,
      });
      return undefined;
    }

    const controller = new AbortController();
    setState({ phase: 'loading', profile: null, error: null, fromCache: false });
    void fetchTerrainProfile(trace.id, fingerprint, model, { signal: controller.signal })
      .then((profile) => {
        saveTerrainProfileCache(profile);
        setState({ phase: 'ready', profile, error: null, fromCache: false });
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setState({ phase: 'error', profile: null, error: errorMessage(error), fromCache: false });
      });
    return () => controller.abort();
  }, [fingerprint, model, retryToken, trace.id]);

  const retry = useCallback(() => {
    setVisible(true);
    setRetryToken((value) => value + 1);
  }, []);

  const elevationAtDistance = useCallback(
    (distanceNm: number) => interpolateTerrainElevation(state.profile, distanceNm),
    [state.profile],
  );

  return {
    ...state,
    visible,
    setVisible,
    retry,
    elevationAtDistance,
  };
}
