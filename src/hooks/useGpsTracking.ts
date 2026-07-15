import { useEffect, useMemo, useRef, useState } from 'react';
import type { AircraftProfile } from '../domain/aircraft.types';
import type { GpsPosition, GpsStatus, GpsTraceDiagnostics } from '../domain/gps.types';
import type { NavRoute } from '../domain/navigation.types';
import type { NativeJournalVerification, PlannedRouteSnapshot, Trace, TraceSource } from '../domain/trace.types';
import { distanceNm, totalDistanceNm } from '../services/geo/distance';
import { bearingDeg } from '../services/geo/bearing';
import {
  classifyGpsPosition,
  getMaxTraceSpeedKtForAircraft,
  isDegradedGpsPosition,
  isPlausibleGpsPosition,
  isRecentGpsPosition,
  isReliableGpsAltitude
} from '../services/gps/geolocationService';
import { createGpsProviderSelection, type GpsProviderSelection } from '../services/gps/gpsProviderFactory';
import type { GpsProviderWatch } from '../services/gps/gpsProvider';
import {
  getNativeGpsRuntimeStatus,
  readNativeSessionJournal,
  readNativeSessionPositions,
  requestCurrentGpsPosition
} from '../services/gps/nativeGpsProvider';
import { createNativeJournalVerification, markNativeSessionDeleted } from '../services/gps/nativeGpsSession';
import {
  createStationaryKeepalive,
  GPS_RESUME_AFTER_GAP_MS,
  MAX_CONSECUTIVE_TRACE_REJECTIONS,
  MIN_TRACK_DISTANCE_M,
  MIN_TRACK_SPEED_KT,
  reconstructNativeTrace,
  STATIONARY_DRIFT_RADIUS_M,
  STATIONARY_KEEPALIVE_MS,
  STATIONARY_SPEED_KT_THRESHOLD,
  TRACE_MAX_POINTS,
  TRACE_SAMPLE_INTERVAL_MS,
  type NativeTraceReconstructionResult
} from '../services/gps/nativeTraceReconstruction';
import { hasSavableTrace } from '../services/traces/traceCollection';
import {
  clearPendingPlannedRoute,
  createPlannedRouteSnapshot,
  persistPendingPlannedRoute,
  readPendingPlannedRoute
} from '../services/traces/plannedRouteSnapshot';
import { interpolateSimulationPoint, simulationTotalSteps } from '../services/gps/simulationService';
import { getCrossTrackError, getProgressiveCrossTrackError, type CrossTrackResult } from '../services/geo/crossTrackError';

const GPS_FROZEN_AFTER_MS = 12_000;

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
  const [, setPositionsRevision] = useState(0);
  const [distanceTravelledNm, setDistanceTravelledNm] = useState(0);
  const [currentPosition, setCurrentPosition] = useState<GpsPosition | null>(null);
  const [crossTrack, setCrossTrack] = useState<CrossTrackResult>(() => getCrossTrackError(null, route.points));
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [notificationWarning, setNotificationWarning] = useState<string | null>(null);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);
  const [persistenceWarning, setPersistenceWarning] = useState<string | null>(null);
  const [lastAccuracy, setLastAccuracy] = useState<number | null>(null);
  const [lastAltitudeAccuracy, setLastAltitudeAccuracy] = useState<number | null>(null);
  const [lastSignalAtState, setLastSignalAtState] = useState<number | null>(null);
  const [lastSignalAgeSec, setLastSignalAgeSec] = useState<number | null>(null);
  const [providerSelection, setProviderSelection] = useState<GpsProviderSelection>(() => createGpsProviderSelection());
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [recordingStartedAt, setRecordingStartedAt] = useState<number | null>(null);
  const [recordingElapsedSec, setRecordingElapsedSec] = useState(0);

  const gpsWatch = useRef<GpsProviderWatch | null>(null);
  const simTimer = useRef<number | null>(null);
  const simStep = useRef(0);
  const startTime = useRef<number | null>(null);
  const sessionId = useRef<string | null>(null);
  const recordingRouteId = useRef(route.id);
  const recordingRouteName = useRef(route.nom);
  const traceSource = useRef<TraceSource>('legacy');
  const plannedRouteSnapshot = useRef<PlannedRouteSnapshot | undefined>(undefined);
  const positionsRef = useRef<GpsPosition[]>([]);
  const segmentStartIndicesRef = useRef<number[]>([]);
  const distanceTravelledNmRef = useRef(0);
  const statusRef = useRef<GpsStatus>('idle');
  const stopPromiseRef = useRef<Promise<void> | null>(null);
  const pendingFinalTraceRef = useRef<Trace | null>(null);
  const hydrationSerialRef = useRef(0);
  const nativeBackfillPromiseRef = useRef<Promise<void> | null>(null);
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
  const locatePromiseRef = useRef<Promise<GpsPosition | null> | null>(null);

  const bumpDiagnostics = (key: keyof Omit<GpsTraceDiagnostics, 'maxTraceSpeedKt'>) => {
    diagnosticsRef.current = { ...diagnosticsRef.current, [key]: diagnosticsRef.current[key] + 1 };
    setDiagnostics(diagnosticsRef.current);
  };

  const updateStatus = (next: GpsStatus) => {
    statusRef.current = next;
    setStatus(next);
  };

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
    segmentStartIndicesRef.current = [];
    distanceTravelledNmRef.current = 0;
    setDistanceTravelledNm(0);
    setPositionsRevision((revision) => revision + 1);
    setCurrentPosition(null);
    setLastAccuracy(null);
    setLastAltitudeAccuracy(null);
    setLastSignalAtState(null);
    setLastSignalAgeSec(null);
    setRecordingElapsedSec(0);
    setPersistenceWarning(null);
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

  const appendTraceSample = (position: GpsPosition, force = false): boolean => {
    const previousSampleAt = lastTraceSampleAt.current;
    const shouldSample = force || previousSampleAt === null || position.timestamp - previousSampleAt >= TRACE_SAMPLE_INTERVAL_MS;
    if (!shouldSample) return false;

    if (positionsRef.current.length >= TRACE_MAX_POINTS) {
      setErrorMessage('Trace très longue : limite d’affichage atteinte. Le journal natif complet reste conservé sur disque.');
      return false;
    }

    const previous = positionsRef.current.at(-1);
    const startsNewSegment = Boolean(
      previous && position.timestamp - previous.timestamp > GPS_RESUME_AFTER_GAP_MS
    );
    if (startsNewSegment && segmentStartIndicesRef.current.at(-1) !== positionsRef.current.length) {
      segmentStartIndicesRef.current.push(positionsRef.current.length);
    }

    lastTraceSampleAt.current = position.timestamp;
    lastTraceSample.current = position;
    positionsRef.current.push(position);
    if (previous && !startsNewSegment) {
      distanceTravelledNmRef.current += distanceNm(previous, position);
      setDistanceTravelledNm(distanceTravelledNmRef.current);
    }
    setPositionsRevision((revision) => revision + 1);
    return true;
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

  const applyReconstructedTrace = (rebuilt: NativeTraceReconstructionResult) => {
    positionsRef.current = rebuilt.positions;
    segmentStartIndicesRef.current = rebuilt.segmentStartIndices;
    diagnosticsRef.current = rebuilt.diagnostics;
    distanceTravelledNmRef.current = rebuilt.distanceNm;
    setDiagnostics(rebuilt.diagnostics);
    setDistanceTravelledNm(rebuilt.distanceNm);

    const endpoint = rebuilt.positions.at(-1) ?? null;
    lastTraceSample.current = endpoint;
    lastTraceSampleAt.current = endpoint?.timestamp ?? null;
    traceRejectionStreak.current = 0;
    groundAnchor.current = endpoint?.vitesse !== null
      && endpoint?.vitesse !== undefined
      && endpoint.vitesse < STATIONARY_SPEED_KT_THRESHOLD
      ? endpoint
      : null;
    if (endpoint) acceptLivePosition(endpoint);
    setPositionsRevision((revision) => revision + 1);
  };

  const yieldToUi = () => new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });

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
      if (appendTraceSample(position, true)) bumpDiagnostics('tracePoints');
      return;
    }

    if (reason === null) {
      const reportedSpeedKt = position.vitesse;
      const isLowReportedSpeed = reportedSpeedKt !== null && reportedSpeedKt < STATIONARY_SPEED_KT_THRESHOLD;

      if (isLowReportedSpeed && groundAnchor.current) {
        const driftM = distanceNm(groundAnchor.current, position) * 1852;
        if (driftM <= STATIONARY_DRIFT_RADIUS_M) {
          acceptLivePosition(position);
          const keepaliveDue = lastTraceSampleAt.current === null
            || position.timestamp - lastTraceSampleAt.current >= STATIONARY_KEEPALIVE_MS;
          if (keepaliveDue) {
            if (appendTraceSample(createStationaryKeepalive(groundAnchor.current, position), true)) {
              bumpDiagnostics('tracePoints');
            }
          } else {
            bumpDiagnostics('rejectedDrift');
          }
          return;
        }
      }

      traceRejectionStreak.current = 0;
      groundAnchor.current = isLowReportedSpeed ? position : null;
      acceptLivePosition(position);
      if (appendTraceSample(position)) bumpDiagnostics('tracePoints');
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
          const appended = appendTraceSample(position, true);
          bumpDiagnostics('forcedResync');
          if (appended) bumpDiagnostics('tracePoints');
        }
      }
    }
  };

  const startGpsInternal = async (resumeExistingSession: boolean) => {
    await stopGpsWatch().catch(() => []);
    clearSimulation();
    const hydrationSerial = hydrationSerialRef.current + 1;
    hydrationSerialRef.current = hydrationSerial;
    pendingFinalTraceRef.current = null;
    setErrorMessage(null);
    setNoticeMessage(null);
    setNotificationWarning(null);
    setLocationError(null);
    resetTrackingData();
    startTime.current = Date.now();
    setRecordingStartedAt(startTime.current);
    setRecordingElapsedSec(0);
    sessionId.current = null;
    recordingRouteId.current = route.id;
    recordingRouteName.current = route.nom;
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

        if (error.code === 'storage') {
          updateStatus('degraded');
          setPersistenceWarning(error.message || 'Journal GPS Android non sécurisé.');
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
      { routeId: route.id, routeName: route.nom, plannedRoute: plannedRouteSnapshot.current },
      (backfillPositions) => {
        if (statusRef.current === 'saving' || statusRef.current === 'stopped') return;
        const activeSessionId = sessionId.current;
        if (!activeSessionId) {
          const rebuilt = reconstructNativeTrace(
            [...positionsRef.current, ...backfillPositions],
            traceMaxSpeedKt
          );
          if (rebuilt.positions.length > 0) applyReconstructedTrace(rebuilt);
          return;
        }
        if (nativeBackfillPromiseRef.current) return;

        const backfillSerial = hydrationSerialRef.current;
        setNoticeMessage('Rattrapage du journal GPS Android en cours...');
        const task = (async () => {
          const fullJournal = await readNativeSessionPositions(activeSessionId);
          await yieldToUi();
          if (
            hydrationSerialRef.current !== backfillSerial
            || sessionId.current !== activeSessionId
            || statusRef.current === 'saving'
            || statusRef.current === 'stopped'
          ) return;
          const rebuilt = reconstructNativeTrace(
            [...fullJournal, ...positionsRef.current],
            traceMaxSpeedKt
          );
          if (rebuilt.positions.length > 0) applyReconstructedTrace(rebuilt);
          setNoticeMessage('Trace affichée resynchronisée avec le journal Android.');
          window.setTimeout(() => {
            if (hydrationSerialRef.current === backfillSerial) setNoticeMessage(null);
          }, 2500);
        })().catch((error) => {
          const message = error instanceof Error ? error.message : 'Lecture du journal GPS impossible.';
          setPersistenceWarning(`Rattrapage du suivi impossible : ${message}`);
        }).finally(() => {
          if (nativeBackfillPromiseRef.current === task) nativeBackfillPromiseRef.current = null;
        });
        nativeBackfillPromiseRef.current = task;
      }
    );

    gpsWatch.current = watch;
    watch.sessionInfo?.then(async (info) => {
      sessionId.current = info.sessionId;
      recordingRouteId.current = info.routeId ?? recordingRouteId.current;
      recordingRouteName.current = info.routeName ?? recordingRouteName.current;
      startTime.current = info.startedAt;
      setRecordingStartedAt(info.startedAt);
      if (info.resumed && info.plannedRoute?.points?.length) {
        plannedRouteSnapshot.current = info.plannedRoute;
        persistPendingPlannedRoute(info.plannedRoute);
      }
      if (info.notificationPermissionGranted === false) {
        setNotificationWarning('Notifications Android refusées : le GPS peut continuer, mais l’indicateur système sera moins visible.');
      }

      if (info.resumed && info.sessionId) {
        setNoticeMessage('Reprise du suivi : reconstruction du journal GPS en cours...');
        try {
          const nativeHistory = await readNativeSessionPositions(info.sessionId);
          await yieldToUi();
          const stillCurrent = hydrationSerialRef.current === hydrationSerial
            && sessionId.current === info.sessionId
            && statusRef.current !== 'saving'
            && statusRef.current !== 'stopped';
          if (!stillCurrent) return;

          const rebuilt = reconstructNativeTrace(
            [...nativeHistory, ...positionsRef.current],
            traceMaxSpeedKt
          );
          if (rebuilt.positions.length > 0) applyReconstructedTrace(rebuilt);
          setNoticeMessage('Suivi GPS repris depuis le journal Android complet.');
          window.setTimeout(() => {
            if (hydrationSerialRef.current === hydrationSerial) setNoticeMessage(null);
          }, 2500);
        } catch (error) {
          if (hydrationSerialRef.current !== hydrationSerial) return;
          const message = error instanceof Error ? error.message : 'Lecture du journal GPS impossible.';
          setPersistenceWarning(`Reprise du journal GPS incomplète : ${message}`);
        }
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
    hydrationSerialRef.current += 1;
    pendingFinalTraceRef.current = null;
    updateStatus('simulating');
    setErrorMessage(null);
    setNoticeMessage(null);
    setNotificationWarning(null);
    setLocationError(null);
    resetTrackingData();
    startTime.current = Date.now();
    setRecordingStartedAt(startTime.current);
    setRecordingElapsedSec(0);
    sessionId.current = null;
    recordingRouteId.current = route.id;
    recordingRouteName.current = route.nom;
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

  const performStopAndSave = async () => {
    if (statusRef.current === 'stopped' && !pendingFinalTraceRef.current) return;

    updateStatus('saving');
    setErrorMessage('Finalisation du journal GPS...');
    setNoticeMessage('Veuillez patienter, la trace complète est relue depuis Android.');
    clearSimulation();
    hydrationSerialRef.current += 1;
    await yieldToUi();

    try {
      let trace = pendingFinalTraceRef.current;

      if (!trace) {
        await stopGpsWatch();
        let completeNativeJournal: GpsPosition[] = [];
        let nativeJournalVerification: NativeJournalVerification | undefined;
        if (traceSource.current === 'android-native' && sessionId.current) {
          const journal = await readNativeSessionJournal(sessionId.current, { forceFresh: true });
          completeNativeJournal = journal.positions;
          nativeJournalVerification = createNativeJournalVerification(journal);
        }

        let finalPositions = positionsRef.current;
        let finalSegments = segmentStartIndicesRef.current;
        let finalDistanceNm = distanceTravelledNmRef.current;

        if (traceSource.current === 'android-native') {
          if (completeNativeJournal.length >= 2) {
            const rebuilt = reconstructNativeTrace(completeNativeJournal, traceMaxSpeedKt);
            if (rebuilt.positions.length >= 2) {
              applyReconstructedTrace(rebuilt);
              finalPositions = rebuilt.positions;
              finalSegments = rebuilt.segmentStartIndices;
              finalDistanceNm = rebuilt.distanceNm;
            }
          }
        } else {
          const livePosition = lastLivePosition.current;
          if (
            livePosition
            && finalPositions.at(-1)?.timestamp !== livePosition.timestamp
            && finalPositions.length < TRACE_MAX_POINTS
          ) {
            const previous = finalPositions.at(-1);
            finalPositions = [...finalPositions, livePosition];
            positionsRef.current = finalPositions;
            if (previous) finalDistanceNm += distanceNm(previous, livePosition);
            distanceTravelledNmRef.current = finalDistanceNm;
            setDistanceTravelledNm(finalDistanceNm);
            setPositionsRevision((revision) => revision + 1);
          }
        }

        if (!hasSavableTrace(finalPositions.length)) {
          const nativeDeleted = await markNativeSessionDeleted(sessionId.current).catch(() => false);
          pendingFinalTraceRef.current = null;
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
        const stableTraceId = sessionId.current
          ? `trace-${sessionId.current}`
          : `trace-${startedAtMs}`;
        trace = {
          schemaVersion: 5,
          id: stableTraceId,
          sessionId: sessionId.current,
          routeId: recordingRouteId.current,
          routeName: recordingRouteName.current,
          date: new Date(endedAtMs).toISOString(),
          startedAt: new Date(startedAtMs).toISOString(),
          endedAt: new Date(endedAtMs).toISOString(),
          source: traceSource.current,
          positions: finalPositions,
          plannedRoute: plannedRouteSnapshot.current,
          segmentStartIndices: finalSegments,
          dureeSec: Math.max(0, Math.round((endedAtMs - startedAtMs) / 1000)),
          distanceNm: Number((traceSource.current === 'android-native'
            ? finalDistanceNm
            : totalDistanceNm(finalPositions)).toFixed(2)),
          diagnostics: diagnosticsRef.current,
          nativeJournalVerification
        };
        pendingFinalTraceRef.current = trace;
      }

      setNoticeMessage('Sauvegarde locale de la trace complète...');
      await yieldToUi();
      const saved = await onTraceReady(trace);
      if (!saved) {
        updateStatus('save-error');
        setErrorMessage('Sauvegarde locale impossible. La trace finalisée reste prête : appuyez de nouveau sur Arrêter et sauvegarder après avoir libéré de l’espace.');
        setNoticeMessage(null);
        return;
      }

      pendingFinalTraceRef.current = null;
      updateStatus('stopped');
      setErrorMessage(null);
      setNoticeMessage(null);
      clearPendingPlannedRoute();
      plannedRouteSnapshot.current = undefined;
      sessionId.current = null;
      setRecordingStartedAt(null);
    } catch (error) {
      setNoticeMessage(null);
      updateStatus('save-error');
      setErrorMessage(error instanceof Error ? error.message : 'Finalisation de la trace impossible. Le journal Android reste conservé.');
    }
  };

  const stopAndSave = (): Promise<void> => {
    if (stopPromiseRef.current) return stopPromiseRef.current;
    const task = performStopAndSave().finally(() => {
      stopPromiseRef.current = null;
    });
    stopPromiseRef.current = task;
    return task;
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

  useEffect(() => {
    const recordingStatus = status === 'requesting'
      || status === 'active'
      || status === 'degraded'
      || status === 'frozen'
      || status === 'simulating';

    if (!recordingStatus || recordingStartedAt === null) return undefined;

    const updateElapsed = () => {
      setRecordingElapsedSec(Math.max(0, Math.floor((Date.now() - recordingStartedAt) / 1000)));
    };

    updateElapsed();
    const timer = window.setInterval(updateElapsed, 1000);
    return () => window.clearInterval(timer);
  }, [recordingStartedAt, status]);

  const requestCurrentPosition = (): Promise<GpsPosition | null> => {
    if (locatePromiseRef.current) return locatePromiseRef.current;

    const liveTracking = statusRef.current === 'active'
      || statusRef.current === 'degraded'
      || statusRef.current === 'frozen'
      || statusRef.current === 'simulating';
    const recentPosition = isRecentGpsPosition(currentPosition);
    if (currentPosition && (liveTracking || recentPosition)) {
      setLocationError(null);
      return Promise.resolve(currentPosition);
    }

    setLocating(true);
    setLocationError(null);
    const request = requestCurrentGpsPosition(12_000)
      .then((position) => {
        if (!isPlausibleGpsPosition(position)) throw new Error('Position GPS trop imprécise pour le centrage.');
        setCurrentPosition(position);
        setCrossTrack(getProgressiveCrossTrackError(position, route.points, activeSegmentIndex.current));
        setLastAccuracy(position.precision);
        setLastAltitudeAccuracy(position.altitudeAccuracy);
        const locatedAt = Date.now();
        lastSignalAt.current = locatedAt;
        setLastSignalAtState(locatedAt);
        setLastSignalAgeSec(0);
        setLocationError(null);
        return position;
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : 'Localisation GPS impossible.';
        setLocationError(message);
        return null;
      })
      .finally(() => {
        setLocating(false);
        locatePromiseRef.current = null;
      });

    locatePromiseRef.current = request;
    return request;
  };

  const nextPoint = route.points[crossTrack.segmentIndex + 1] ?? route.points.at(-1) ?? null;
  const nextPointDistance = currentPosition && nextPoint ? distanceNm(currentPosition, nextPoint) : null;

  const positions = positionsRef.current;

  return {
    status,
    positions,
    currentPosition,
    crossTrack,
    distanceTravelledNm,
    nextPoint,
    nextPointDistance,
    errorMessage: persistenceWarning ?? errorMessage,
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
    locating,
    locationError,
    recordingStartedAt,
    recordingElapsedSec,
    requestCurrentPosition,
    startGps,
    startSimulation,
    stopAndSave
  };
}

export type GpsTrackingState = ReturnType<typeof useGpsTracking>;
