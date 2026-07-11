import { useEffect, useMemo, useRef, useState } from 'react';
import type { AircraftProfile } from '../domain/aircraft.types';
import type { GpsPosition, GpsStatus, GpsTraceDiagnostics } from '../domain/gps.types';
import type { NavRoute } from '../domain/navigation.types';
import type { PlannedRouteSnapshot, Trace, TraceSource } from '../domain/trace.types';
import { distanceNm, totalDistanceNm } from '../services/geo/distance';
import { bearingDeg } from '../services/geo/bearing';
import {
  classifyGpsPosition,
  getMaxTraceSpeedKtForAircraft,
  isDegradedGpsPosition,
  isPlausibleGpsPosition,
  isReliableGpsAltitude
} from '../services/gps/geolocationService';
import { createGpsProviderSelection, type GpsProviderSelection } from '../services/gps/gpsProviderFactory';
import type { GpsProviderWatch } from '../services/gps/gpsProvider';
import { getNativeGpsRuntimeStatus } from '../services/gps/nativeGpsProvider';
import { markNativeSessionDeleted } from '../services/gps/nativeGpsSession';
import { hasSavableTrace } from '../services/traces/traceCollection';
import {
  clearPendingPlannedRoute,
  createPlannedRouteSnapshot,
  persistPendingPlannedRoute,
  readPendingPlannedRoute
} from '../services/traces/plannedRouteSnapshot';
import { interpolateSimulationPoint, simulationTotalSteps } from '../services/gps/simulationService';
import { getCrossTrackError, getProgressiveCrossTrackError, type CrossTrackResult } from '../services/geo/crossTrackError';

const TRACE_SAMPLE_INTERVAL_MS = 3000;
const TRACE_MAX_POINTS = 50000;
const MAX_CONSECUTIVE_TRACE_REJECTIONS = 5;
const STATIONARY_SPEED_KT_THRESHOLD = 5;
const STATIONARY_DRIFT_RADIUS_M = 60;
const MIN_TRACK_SPEED_KT = 8;
const MIN_TRACK_DISTANCE_M = 20;
const GPS_FROZEN_AFTER_MS = 12_000;
const GPS_RESUME_AFTER_GAP_MS = 12_000;

const emptyDiagnostics = (maxTraceSpeedKt: number): GpsTraceDiagnostics => ({
  rawReceived: 0,
  rejectedPrecision: 0,
  rejectedRedundant: 0,
  rejectedSpeed: 0,
  rejectedDrift: 0,
  forcedResync: 0,
  tracePoints: 0,
  gpsGaps: 0,
  gpsResumptions: 0,
  missingAltitude: 0,
  unreliableAltitude: 0,
  maxTraceSpeedKt
});

export function useGpsTracking(
  route: NavRoute,
  onTraceReady: (trace: Trace) => boolean | Promise<boolean>,
  aircraft?: AircraftProfile
) {
  const traceMaxSpeedKt = useMemo(() => getMaxTraceSpeedKtForAircraft(aircraft), [aircraft]);
  const [status, setStatus] = useState<GpsStatus>('idle');
  const [positions, setPositions] = useState<GpsPosition[]>([]);
  const [currentPosition, setCurrentPosition] = useState<GpsPosition | null>(null);
  const [crossTrack, setCrossTrack] = useState<CrossTrackResult>(() => getCrossTrackError(null, route.points));
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [notificationWarning, setNotificationWarning] = useState<string | null>(null);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);
  const [lastAccuracy, setLastAccuracy] = useState<number | null>(null);
  const [lastAltitudeAccuracy, setLastAltitudeAccuracy] = useState<number | null>(null);
  const [lastSignalAtState, setLastSignalAtState] = useState<number | null>(null);
  const [lastSignalAgeSec, setLastSignalAgeSec] = useState<number | null>(null);
  const [providerSelection, setProviderSelection] = useState<GpsProviderSelection>(() => createGpsProviderSelection());

  const gpsWatch = useRef<GpsProviderWatch | null>(null);
  const simTimer = useRef<number | null>(null);
  const simStep = useRef(0);
  const startTime = useRef<number | null>(null);
  const sessionId = useRef<string | null>(null);
  const traceSource = useRef<TraceSource>('legacy');
  const plannedRouteSnapshot = useRef<PlannedRouteSnapshot | undefined>(undefined);
  const positionsRef = useRef<GpsPosition[]>([]);
  const statusRef = useRef<GpsStatus>('idle');
  const lastSignalAt = useRef<number | null>(null);
  const lastLivePosition = useRef<GpsPosition | null>(null);
  const lastTraceSampleAt = useRef<number | null>(null);
  const activeSegmentIndex = useRef<number | null>(null);
  const traceRejectionStreak = useRef(0);
  const groundAnchor = useRef<GpsPosition | null>(null);
  const lastTraceSample = useRef<GpsPosition | null>(null);
  const freezeRecorded = useRef(false);
  const [diagnostics, setDiagnostics] = useState<GpsTraceDiagnostics>(() => emptyDiagnostics(traceMaxSpeedKt));
  const diagnosticsRef = useRef<GpsTraceDiagnostics>(emptyDiagnostics(traceMaxSpeedKt));

  const bumpDiagnostics = (key: keyof Omit<GpsTraceDiagnostics, 'maxTraceSpeedKt'>) => {
    diagnosticsRef.current = { ...diagnosticsRef.current, [key]: diagnosticsRef.current[key] + 1 };
    setDiagnostics(diagnosticsRef.current);
  };

  const updateStatus = (next: GpsStatus) => {
    statusRef.current = next;
    setStatus(next);
  };

  const distanceTravelledNm = useMemo(() => totalDistanceNm(positions), [positions]);

  const detachGpsWatch = () => {
    gpsWatch.current?.detach();
    gpsWatch.current = null;
  };

  const stopGpsWatch = async () => {
    const watch = gpsWatch.current;
    gpsWatch.current = null;
    if (!watch) return [];
    return watch.stop();
  };

  const clearSimulation = () => {
    if (simTimer.current !== null) {
      window.clearInterval(simTimer.current);
      simTimer.current = null;
    }
  };

  const resetTrackingData = () => {
    positionsRef.current = [];
    setPositions([]);
    setCurrentPosition(null);
    setLastAccuracy(null);
    setLastAltitudeAccuracy(null);
    setLastSignalAtState(null);
    setLastSignalAgeSec(null);
    lastSignalAt.current = null;
    lastLivePosition.current = null;
    lastTraceSampleAt.current = null;
    activeSegmentIndex.current = null;
    traceRejectionStreak.current = 0;
    groundAnchor.current = null;
    lastTraceSample.current = null;
    freezeRecorded.current = false;
    diagnosticsRef.current = emptyDiagnostics(traceMaxSpeedKt);
    setDiagnostics(diagnosticsRef.current);
    setCrossTrack(getCrossTrackError(null, route.points));
  };

  const appendTraceSample = (position: GpsPosition, force = false) => {
    const previousSampleAt = lastTraceSampleAt.current;
    const shouldSample = force || previousSampleAt === null || position.timestamp - previousSampleAt >= TRACE_SAMPLE_INTERVAL_MS;
    if (!shouldSample) return;

    if (positionsRef.current.length >= TRACE_MAX_POINTS) {
      setErrorMessage('Trace très longue : limite d’affichage atteinte. Le journal natif complet reste conservé sur disque.');
      return;
    }

    lastTraceSampleAt.current = position.timestamp;
    lastTraceSample.current = position;
    positionsRef.current = [...positionsRef.current, position];
    setPositions(positionsRef.current);
  };

  const enrichPositionTrack = (position: GpsPosition): GpsPosition => {
    const gpsTrack = position.track;
    const hasReliableGpsTrack = typeof gpsTrack === 'number'
      && Number.isFinite(gpsTrack)
      && typeof position.vitesse === 'number'
      && position.vitesse >= MIN_TRACK_SPEED_KT;

    if (hasReliableGpsTrack) return position;

    const previous = lastLivePosition.current;
    if (!previous) return position;

    const distanceM = distanceNm(previous, position) * 1852;
    const hasMotion = distanceM >= MIN_TRACK_DISTANCE_M
      || (typeof position.vitesse === 'number' && position.vitesse >= MIN_TRACK_SPEED_KT);

    if (!hasMotion) {
      return previous.track !== null ? { ...position, track: previous.track } : position;
    }

    return { ...position, track: bearingDeg(previous, position) };
  };

  const acceptLivePosition = (position: GpsPosition) => {
    lastLivePosition.current = position;
    setCurrentPosition(position);

    const nextCrossTrack = getProgressiveCrossTrackError(position, route.points, activeSegmentIndex.current);
    activeSegmentIndex.current = nextCrossTrack.segmentIndex;
    setCrossTrack(nextCrossTrack);
  };

  const updateGpsSignalTiming = () => {
    const now = Date.now();
    const previousSignalAt = lastSignalAt.current;

    if (previousSignalAt !== null && now - previousSignalAt > GPS_RESUME_AFTER_GAP_MS) {
      bumpDiagnostics('gpsResumptions');
    }

    freezeRecorded.current = false;
    lastSignalAt.current = now;
    setLastSignalAtState(now);
    setLastSignalAgeSec(0);
  };

  const ingestPosition = (rawPosition: GpsPosition, forceTraceSample = false, source: 'gps' | 'simulation' = 'gps') => {
    const position = source === 'gps' ? enrichPositionTrack(rawPosition) : rawPosition;
    setLastAccuracy(position.precision);
    setLastAltitudeAccuracy(position.altitudeAccuracy);
    bumpDiagnostics('rawReceived');

    if (source === 'gps') updateGpsSignalTiming();

    if (position.altitude === null) bumpDiagnostics('missingAltitude');
    else if (!isReliableGpsAltitude(position)) bumpDiagnostics('unreliableAltitude');

    if (!isPlausibleGpsPosition(position)) {
      if (source === 'gps') updateStatus('degraded');
      bumpDiagnostics('rejectedPrecision');
      return;
    }

    if (source === 'gps') {
      updateStatus(isDegradedGpsPosition(position) ? 'degraded' : 'active');
      setErrorMessage(null);
    }

    const previousTraceSample = lastTraceSample.current;
    const reason = forceTraceSample ? null : classifyGpsPosition(position, previousTraceSample, traceMaxSpeedKt);

    if (forceTraceSample) {
      traceRejectionStreak.current = 0;
      groundAnchor.current = null;
      acceptLivePosition(position);
      appendTraceSample(position, true);
      bumpDiagnostics('tracePoints');
      return;
    }

    if (reason === null) {
      const reportedSpeedKt = position.vitesse;
      const isLowReportedSpeed = reportedSpeedKt !== null && reportedSpeedKt < STATIONARY_SPEED_KT_THRESHOLD;

      if (isLowReportedSpeed && groundAnchor.current) {
        const driftM = distanceNm(groundAnchor.current, position) * 1852;
        if (driftM <= STATIONARY_DRIFT_RADIUS_M) {
          bumpDiagnostics('rejectedDrift');
          return;
        }
      }

      traceRejectionStreak.current = 0;
      groundAnchor.current = isLowReportedSpeed ? position : null;
      acceptLivePosition(position);
      appendTraceSample(position);
      bumpDiagnostics('tracePoints');
      return;
    }

    if (reason === 'redundant') {
      bumpDiagnostics('rejectedRedundant');
      acceptLivePosition(position);
      return;
    }

    if (reason === 'speed') {
      bumpDiagnostics('rejectedSpeed');
      if (previousTraceSample) {
        traceRejectionStreak.current += 1;
        if (traceRejectionStreak.current >= MAX_CONSECUTIVE_TRACE_REJECTIONS) {
          traceRejectionStreak.current = 0;
          groundAnchor.current = null;
          acceptLivePosition(position);
          appendTraceSample(position, true);
          bumpDiagnostics('forcedResync');
          bumpDiagnostics('tracePoints');
        }
      }
    }
  };

  const startGpsInternal = async (resumeExistingSession: boolean) => {
    await stopGpsWatch().catch(() => []);
    clearSimulation();
    setErrorMessage(null);
    setNoticeMessage(null);
    setNotificationWarning(null);
    resetTrackingData();
    startTime.current = Date.now();
    sessionId.current = null;
    plannedRouteSnapshot.current = resumeExistingSession
      ? readPendingPlannedRoute() ?? createPlannedRouteSnapshot(route)
      : createPlannedRouteSnapshot(route);
    persistPendingPlannedRoute(plannedRouteSnapshot.current);

    const nextSelection = createGpsProviderSelection();
    setProviderSelection(nextSelection);
    traceSource.current = nextSelection.provider.kind === 'android-native' ? 'android-native' : 'web';

    if (!nextSelection.provider.isAvailable()) {
      updateStatus('unavailable');
      setErrorMessage('GPS indisponible sur cet appareil. Mode simulation disponible.');
      clearPendingPlannedRoute();
      plannedRouteSnapshot.current = undefined;
      return;
    }

    updateStatus('requesting');

    const watch = nextSelection.provider.startWatching(
      (position) => ingestPosition(position, false, 'gps'),
      (error) => {
        if (error.code === 'denied') {
          detachGpsWatch();
          updateStatus('denied');
          setErrorMessage('Permission GPS refusée. Mode simulation disponible.');
          clearPendingPlannedRoute();
          plannedRouteSnapshot.current = undefined;
          return;
        }

        const liveStatus = statusRef.current === 'active' || statusRef.current === 'degraded' || statusRef.current === 'frozen';
        if (!liveStatus && error.code === 'unavailable') updateStatus('unavailable');
        if (liveStatus && statusRef.current !== 'frozen') updateStatus('degraded');

        setErrorMessage(
          liveStatus
            ? 'Signal GPS momentanément faible. Le suivi continue dès la prochaine position.'
            : error.message || 'Recherche GPS en cours. Placez le téléphone près d’une fenêtre ou en extérieur si le signal tarde.'
        );
      },
      { routeId: route.id, routeName: route.nom }
    );

    gpsWatch.current = watch;
    watch.sessionInfo?.then((info) => {
      sessionId.current = info.sessionId;
      startTime.current = info.startedAt;
      if (info.notificationPermissionGranted === false) {
        setNotificationWarning('Notifications Android refusées : le GPS peut continuer, mais l’indicateur système sera moins visible.');
      }
    }).catch(() => undefined);
  };

  const startGps = () => startGpsInternal(false);

  const startSimulation = async () => {
    if (route.points.length < 2) {
      updateStatus('unavailable');
      setErrorMessage('Simulation indisponible : saisir un départ et une arrivée.');
      return;
    }

    await stopGpsWatch().catch(() => []);
    clearSimulation();
    updateStatus('simulating');
    setErrorMessage(null);
    setNoticeMessage(null);
    setNotificationWarning(null);
    resetTrackingData();
    startTime.current = Date.now();
    sessionId.current = null;
    traceSource.current = 'simulation';
    plannedRouteSnapshot.current = createPlannedRouteSnapshot(route);
    persistPendingPlannedRoute(plannedRouteSnapshot.current);
    simStep.current = 0;

    const totalSteps = simulationTotalSteps(route.points);
    ingestPosition(interpolateSimulationPoint(route.points, simStep.current), true, 'simulation');

    simTimer.current = window.setInterval(() => {
      simStep.current += 1;
      const finalStep = simStep.current >= totalSteps;
      ingestPosition(interpolateSimulationPoint(route.points, simStep.current), finalStep, 'simulation');

      if (finalStep) {
        clearSimulation();
        updateStatus('simulation-complete');
        setErrorMessage('Simulation terminée. Vous pouvez sauvegarder la trace.');
      }
    }, 1000);
  };

  const stopAndSave = async () => {
    if (statusRef.current === 'saving') return;
    updateStatus('saving');
    setErrorMessage('Finalisation du journal GPS...');
    clearSimulation();

    try {
      await stopGpsWatch();
      const currentPositions = positionsRef.current;
      const livePosition = lastLivePosition.current;
      const finalPositions = livePosition && currentPositions.at(-1)?.timestamp !== livePosition.timestamp
        ? [...currentPositions, livePosition]
        : currentPositions;
      positionsRef.current = finalPositions;
      setPositions(finalPositions);

      if (!hasSavableTrace(finalPositions.length)) {
        const nativeDeleted = await markNativeSessionDeleted(sessionId.current).catch(() => false);
        updateStatus('stopped-no-trace');
        setErrorMessage(null);
        setNoticeMessage(
          nativeDeleted
            ? 'Suivi arrêté - trace trop courte, aucune trace enregistrée.'
            : 'Suivi arrêté - trace trop courte. Le journal natif vide n’a pas pu être nettoyé, sans impact sur les traces sauvegardées.'
        );
        clearPendingPlannedRoute();
        plannedRouteSnapshot.current = undefined;
        return;
      }

      const startedAtMs = startTime.current ?? finalPositions[0]?.timestamp ?? Date.now();
      const endedAtMs = finalPositions.at(-1)?.timestamp ?? Date.now();
      const trace: Trace = {
        schemaVersion: 3,
        id: `trace-${Date.now()}`,
        sessionId: sessionId.current,
        routeId: route.id,
        routeName: route.nom,
        date: new Date(endedAtMs).toISOString(),
        startedAt: new Date(startedAtMs).toISOString(),
        endedAt: new Date(endedAtMs).toISOString(),
        source: traceSource.current,
        positions: finalPositions,
        plannedRoute: plannedRouteSnapshot.current,
        dureeSec: Math.max(0, Math.round((endedAtMs - startedAtMs) / 1000)),
        distanceNm: Number(totalDistanceNm(finalPositions).toFixed(2)),
        diagnostics: diagnosticsRef.current
      };

      const saved = await onTraceReady(trace);
      if (!saved) {
        updateStatus('save-error');
        setErrorMessage('Sauvegarde locale impossible. Le journal natif reste disponible pour récupération au prochain lancement.');
        return;
      }

      updateStatus('stopped');
      setErrorMessage(null);
      setNoticeMessage(null);
      clearPendingPlannedRoute();
      plannedRouteSnapshot.current = undefined;
    } catch (error) {
      setNoticeMessage(null);
      updateStatus('save-error');
      setErrorMessage(error instanceof Error ? error.message : 'Finalisation de la trace impossible.');
    }
  };

  useEffect(() => {
    activeSegmentIndex.current = null;
    setCrossTrack(getCrossTrackError(currentPosition, route.points));
  }, [route.points]);

  useEffect(() => {
    diagnosticsRef.current = { ...diagnosticsRef.current, maxTraceSpeedKt: traceMaxSpeedKt };
    setDiagnostics(diagnosticsRef.current);
  }, [traceMaxSpeedKt]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const signalAt = lastSignalAt.current;
      if (signalAt === null) return;

      const ageMs = Date.now() - signalAt;
      setLastSignalAgeSec(Math.floor(ageMs / 1000));

      const isLiveGpsStatus = statusRef.current === 'active' || statusRef.current === 'degraded' || statusRef.current === 'frozen';
      if (isLiveGpsStatus && ageMs > GPS_FROZEN_AFTER_MS) {
        if (statusRef.current !== 'frozen') {
          updateStatus('frozen');
          setErrorMessage('Aucun point GPS récent. Position gelée jusqu’au prochain fix valide.');
        }

        if (!freezeRecorded.current) {
          freezeRecorded.current = true;
          bumpDiagnostics('gpsGaps');
        }
      }
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;
    getNativeGpsRuntimeStatus().then((nativeStatus) => {
      if (cancelled || !nativeStatus?.running || gpsWatch.current) return;
      startGpsInternal(true).catch(() => undefined);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      // React/WebView may be recreated while the Android foreground service is still recording.
      // Detach UI listeners only; do not stop the native service here.
      detachGpsWatch();
      clearSimulation();
    };
  }, []);

  const nextPoint = route.points[crossTrack.segmentIndex + 1] ?? route.points.at(-1) ?? null;
  const nextPointDistance = currentPosition && nextPoint ? distanceNm(currentPosition, nextPoint) : null;

  return {
    status,
    positions,
    currentPosition,
    crossTrack,
    distanceTravelledNm,
    nextPoint,
    nextPointDistance,
    errorMessage,
    notificationWarning,
    noticeMessage,
    lastAccuracy,
    lastAltitudeAccuracy,
    lastSignalAt: lastSignalAtState,
    lastSignalAgeSec,
    diagnostics,
    traceSampleIntervalMs: TRACE_SAMPLE_INTERVAL_MS,
    traceMaxPoints: TRACE_MAX_POINTS,
    traceMaxSpeedKt,
    providerLabel: providerSelection.provider.label,
    providerKind: providerSelection.provider.kind,
    nativeRuntime: providerSelection.nativeRuntime,
    nativeProviderPrepared: providerSelection.nativeProviderPrepared,
    startGps,
    startSimulation,
    stopAndSave
  };
}

export type GpsTrackingState = ReturnType<typeof useGpsTracking>;
