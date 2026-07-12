import { useEffect, useState } from 'react';
import type { NavPoint, NavRoute } from '../domain/navigation.types';
import type { GpsTrackingState } from '../hooks/useGpsTracking';
import { OpenLayersMap } from '../components/map/OpenLayersMap';
import { MapLayerToggle } from '../components/map/MapLayerToggle';
import { CockpitBadge } from '../components/cockpit/CockpitBadge';
import { MetricCard } from '../components/cockpit/MetricCard';
import { RouteDeviationGauge } from '../components/cockpit/RouteDeviationGauge';
import { Button } from '../components/ui/Button';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { Card } from '../components/ui/Card';
import { distanceNm } from '../services/geo/distance';
import { isReliableGpsAltitude } from '../services/gps/geolocationService';
import type { GpsPosition } from '../domain/gps.types';
import type { MapBaseLayer, MapOrientationMode } from '../mapEngine/mapTypes';
import { useLocalStorageState } from '../hooks/useLocalStorageState';
import { hasSavableTrace } from '../services/traces/traceCollection';

interface TrackingScreenProps {
  route: NavRoute;
  mapBaseLayer: MapBaseLayer;
  onMapBaseLayerChange: (value: MapBaseLayer) => void;
  gps: GpsTrackingState;
  wakeLockActive: boolean;
}

function statusLabel(status: string): string {
  switch (status) {
    case 'active': return 'GPS actif';
    case 'degraded': return 'GPS dégradé';
    case 'frozen': return 'GPS gelé';
    case 'simulating': return 'SIM OK';
    case 'simulation-complete': return 'SIM terminée';
    case 'requesting': return 'Recherche GPS';
    case 'denied': return 'GPS refusé';
    case 'unavailable': return 'GPS perdu';
    case 'saving': return 'Sauvegarde...';
    case 'save-error': return 'Sauvegarde à reprendre';
    case 'stopped': return 'Sauvé';
    case 'stopped-no-trace': return 'Suivi arrêté';
    default: return 'GPS prêt';
  }
}

function statusTone(status: string): 'ok' | 'warn' | 'off' {
  if (status === 'active' || status === 'simulating' || status === 'stopped') return 'ok';
  if (status === 'degraded' || status === 'frozen' || status === 'requesting' || status === 'simulation-complete' || status === 'saving' || status === 'save-error') return 'warn';
  return 'off';
}

function formatClock(date = new Date()): string {
  return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function formatDuration(minutes: number): string {
  const safeMinutes = Math.max(0, Math.round(minutes));
  const hours = Math.floor(safeMinutes / 60);
  const mins = safeMinutes % 60;
  return hours > 0 ? `${hours}:${String(mins).padStart(2, '0')}` : `${mins} min`;
}

function routePointDistanceRemainingNm(route: NavRoute, currentPosition: GpsPosition | null, nextPoint: NavPoint | null, segmentIndex: number) {
  if (!currentPosition || !nextPoint || route.points.length < 2) return null;

  const nextPointIndex = Math.min(Math.max(segmentIndex + 1, 1), route.points.length - 1);
  let remaining = distanceNm(currentPosition, nextPoint);

  for (let index = nextPointIndex; index < route.points.length - 1; index += 1) {
    remaining += distanceNm(route.points[index], route.points[index + 1]);
  }

  return remaining;
}

function metricNumber(value: number | null | undefined, suffix: string, digits = 0) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '--';
  return `${value.toFixed(digits).replace('.', ',')} ${suffix}`;
}

function hudValue(value: number | null | undefined, suffix = '', digits = 0): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '--';
  return `${value.toFixed(digits).replace('.', ',')}${suffix ? ` ${suffix}` : ''}`;
}

function FullscreenToggleIcon({ active }: { active: boolean }) {
  return active ? (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 3v6H3M15 3v6h6M9 21v-6H3M15 21v-6h6" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5" />
    </svg>
  );
}

export function TrackingScreen({ route, mapBaseLayer, onMapBaseLayerChange, gps, wakeLockActive }: TrackingScreenProps) {
  const [confirmStop, setConfirmStop] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [orientationMode, setOrientationMode] = useLocalStorageState<MapOrientationMode>('capclair.trackingMapOrientation.v1', 'north-up');

  const isRecording = gps.status === 'active' || gps.status === 'degraded' || gps.status === 'frozen' || gps.status === 'simulating';
  const canStopTracking = isRecording || gps.status === 'simulation-complete' || gps.status === 'save-error';
  const traceIsSavable = hasSavableTrace(gps.positions.length);
  const isSavedTrace = gps.status === 'stopped';
  const traceForMap = gps.positions;

  const currentBranch = route.branches[gps.crossTrack.segmentIndex] ?? route.branches[0] ?? null;
  const magneticHeading = currentBranch ? Math.round(currentBranch.capCorrige) : null;

  const groundSpeed = gps.currentPosition?.vitesse ?? null;
  const altitude = gps.currentPosition && isReliableGpsAltitude(gps.currentPosition) ? gps.currentPosition.altitude : null;
  const altitudeFt = altitude !== null ? Math.round(altitude * 3.28084) : null;
  const currentTrack = gps.currentPosition?.track ?? null;
  const remainingDistanceNm = routePointDistanceRemainingNm(route, gps.currentPosition, gps.nextPoint, gps.crossTrack.segmentIndex);
  const eteMinutes = groundSpeed && groundSpeed > 5 && remainingDistanceNm !== null
    ? (remainingDistanceNm / groundSpeed) * 60
    : null;
  const eta = eteMinutes !== null ? new Date(Date.now() + eteMinutes * 60000) : null;

  useEffect(() => {
    if (!fullscreen) return undefined;

    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFullscreen(false);
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [fullscreen]);

  const toggleOrientation = () => {
    setOrientationMode((current) => current === 'track-up' ? 'north-up' : 'track-up');
  };

  return (
    <section className={`tracking-screen ${fullscreen ? 'is-fullscreen' : ''}`}>
      <div className="tracking-map-panel">
        <MapLayerToggle baseLayer={mapBaseLayer} onChange={onMapBaseLayerChange} />
        <OpenLayersMap
          route={route}
          trace={traceForMap}
          aircraft={gps.currentPosition}
          selectedPointId={gps.nextPoint?.id ?? null}
          compact
          baseLayer={mapBaseLayer}
          followAircraft={isRecording}
          orientationMode={orientationMode}
          allowUserRotation={orientationMode === 'north-up'}
          onRequestPosition={gps.requestCurrentPosition}
          locating={gps.locating}
          locationError={gps.locationError}
          fullscreen={fullscreen}
        />

        <div className="tracking-map-mode-controls" aria-label="Modes de la carte">
          <button
            type="button"
            className="tracking-map-mode-icon"
            onClick={() => setFullscreen((current) => !current)}
            aria-label={fullscreen ? 'Quitter le plein écran' : 'Afficher la carte en plein écran'}
            title={fullscreen ? 'Quitter le plein écran' : 'Plein écran'}
          >
            <FullscreenToggleIcon active={fullscreen} />
          </button>
          <button
            type="button"
            className={`tracking-map-orientation-control ${orientationMode === 'track-up' ? 'active' : ''}`}
            onClick={toggleOrientation}
            aria-label={orientationMode === 'track-up' ? 'Passer en nord en haut' : 'Passer en trajectoire en haut'}
            aria-pressed={orientationMode === 'track-up'}
            title={orientationMode === 'track-up' ? 'Trajectoire en haut' : 'Nord en haut'}
          >
            {orientationMode === 'track-up' ? (
              <><span>TRK</span><strong>UP</strong></>
            ) : (
              <><span>NORD</span><strong>UP</strong></>
            )}
          </button>
        </div>
      </div>

      {fullscreen && (
        <>
          <div className="tracking-fullscreen-topbar" aria-label="État du suivi">
            <div className="tracking-fullscreen-brand">
              <img src="/cap-clair-logo.svg" alt="" />
              <strong>CAP CLAIR</strong>
            </div>
            <span className={`tracking-status-chip ${statusTone(gps.status)}`}>{statusLabel(gps.status)}</span>
            <button type="button" className="tracking-orientation-chip" onClick={toggleOrientation}>
              {orientationMode === 'track-up' ? 'TRK UP' : 'NORD UP'}
            </button>
          </div>

          <div className="tracking-fullscreen-hud" aria-label="Informations de navigation">
            <div className="tracking-hud-grid">
              <div className="tracking-hud-cell tracking-hud-next">
                <span>Prochain</span>
                <strong>{gps.nextPoint?.nom ?? '--'}</strong>
              </div>
              <div className="tracking-hud-cell">
                <span>Dist</span>
                <strong>{hudValue(gps.nextPointDistance, 'NM', 1)}</strong>
              </div>
              <div className="tracking-hud-cell">
                <span>Cap mag</span>
                <strong>{magneticHeading !== null ? `${magneticHeading}°` : '--'}</strong>
              </div>
              <div className="tracking-hud-cell">
                <span>GS</span>
                <strong>{hudValue(groundSpeed, 'kt')}</strong>
              </div>
              <div className="tracking-hud-cell">
                <span>Alt GPS</span>
                <strong>{altitudeFt !== null ? `${altitudeFt.toLocaleString('fr-FR')} ft` : '--'}</strong>
              </div>
              <div className="tracking-hud-cell">
                <span>ETA</span>
                <strong>{eta ? formatClock(eta) : '--'}</strong>
              </div>
            </div>
            <div className="tracking-hud-mode">Mode suivi plein écran</div>
          </div>
        </>
      )}

      <aside className="tracking-panel">
        <div className="cockpit-badges">
          <CockpitBadge
            label={statusLabel(gps.status)}
            state={gps.status === 'active' || gps.status === 'simulating' || gps.status === 'stopped' ? 'ok' : gps.status === 'degraded' || gps.status === 'frozen' || gps.status === 'requesting' || gps.status === 'simulation-complete' || gps.status === 'saving' || gps.status === 'save-error' ? 'warn' : 'off'}
          />
          <CockpitBadge
            label={isRecording ? 'Trace REC' : gps.status === 'simulation-complete' ? 'Trace à sauver' : gps.status === 'stopped-no-trace' ? 'Aucune trace' : 'Trace prête'}
            state={isRecording ? 'rec' : gps.status === 'simulation-complete' ? 'warn' : 'off'}
          />
          <CockpitBadge label={wakeLockActive ? 'Écran actif' : isRecording ? 'Écran veille?' : 'Écran prêt'} state={wakeLockActive ? 'ok' : isRecording ? 'warn' : 'off'} />
        </div>

        {(gps.status === 'requesting' || gps.lastAccuracy !== null || gps.lastSignalAgeSec !== null || isSavedTrace) && (
          <Card className="gps-signal-card">
            <strong>{gps.status === 'requesting' ? 'Recherche position GPS...' : isSavedTrace ? 'Trace sauvegardée' : statusLabel(gps.status)}</strong>
            {isSavedTrace ? (
              <p>
                {gps.positions.length} points · {gps.distanceTravelledNm.toFixed(2).replace('.', ',')} NM · export disponible dans Mes traces.
              </p>
            ) : (
              <p>
                {gps.lastAccuracy !== null
                  ? `Précision H ${Math.round(gps.lastAccuracy)} m${gps.lastAltitudeAccuracy !== null ? ` · V ${Math.round(gps.lastAltitudeAccuracy)} m` : ' · V inconnue'}${gps.lastSignalAgeSec !== null ? ` · dernier fix ${gps.lastSignalAgeSec} s` : ''}`
                  : 'Acquisition haute précision en cours. Le premier fix peut prendre quelques secondes.'}
              </p>
            )}
            <p className="gps-provider-line">
              Source {gps.providerLabel} · seuil trace {gps.traceMaxSpeedKt} kt · {gps.nativeRuntime ? 'shell native' : 'web'}
            </p>
            {(isRecording || isSavedTrace) && (
              <p className="gps-diagnostics">
                Reçus {gps.diagnostics.rawReceived} · trace {gps.diagnostics.tracePoints} · précision {gps.diagnostics.rejectedPrecision} · saut {gps.diagnostics.rejectedSpeed} · gel {gps.diagnostics.gpsGaps} · reprise {gps.diagnostics.gpsResumptions} · alt. non fiable {gps.diagnostics.unreliableAltitude}
              </p>
            )}
          </Card>
        )}

        <div className="tracking-metrics-top">
          <MetricCard
            label="Prochain point"
            value={gps.nextPoint?.nom ?? '--'}
            detail={gps.nextPointDistance !== null ? `${gps.nextPointDistance.toFixed(1).replace('.', ',')} NM` : '--'}
            strong
          />
          <MetricCard label="Cap magnétique" value={magneticHeading !== null ? `${magneticHeading}°` : '--'} strong />
          <MetricCard label="ETA" value={eta ? formatClock(eta) : '--'} detail={eteMinutes !== null ? `dans ${formatDuration(eteMinutes)}` : '--'} strong />
        </div>

        <RouteDeviationGauge result={gps.crossTrack} />

        {gps.notificationWarning && (
          <Card className="gps-warning">
            <strong>Notification Android</strong>
            <p>{gps.notificationWarning}</p>
          </Card>
        )}

        {gps.noticeMessage && (
          <Card className="gps-signal-card">
            <strong>Suivi</strong>
            <p>{gps.noticeMessage}</p>
          </Card>
        )}

        {gps.errorMessage && (
          <Card className="gps-warning">
            <strong>État GPS</strong>
            <p>{gps.errorMessage}</p>
          </Card>
        )}

        <div className="cockpit-value-grid">
          <MetricCard label="GS" value={metricNumber(groundSpeed, 'kt')} />
          <MetricCard label="ALT" value={altitudeFt !== null ? `${altitudeFt.toLocaleString('fr-FR')} ft` : '--'} />
          <MetricCard label="TRK GPS" value={currentTrack !== null ? `${Math.round(currentTrack)}°` : '--'} />
          <MetricCard label="ETE dest" value={eteMinutes !== null ? formatDuration(eteMinutes) : '--'} />
        </div>

        <div className="tracking-actions">
          {!canStopTracking && gps.status !== 'saving' && <Button variant="primary" onClick={gps.startGps}>Démarrer GPS</Button>}
          {!canStopTracking && gps.status !== 'saving' && <Button variant="secondary" onClick={gps.startSimulation}>Tester simulation</Button>}
          {gps.status === 'saving' && <Button variant="secondary" disabled>Finalisation...</Button>}
          {canStopTracking && gps.status !== 'saving' && (
            <Button variant="danger" onClick={() => setConfirmStop(true)}>
              {gps.status === 'save-error' ? 'Réessayer la sauvegarde' : traceIsSavable ? 'Arrêter et sauvegarder' : 'Arrêter le GPS'}
            </Button>
          )}
        </div>
      </aside>

      <ConfirmDialog
        open={confirmStop}
        title="Arrêter le suivi ?"
        message={traceIsSavable
          ? "La trace actuelle sera sauvegardée localement. Cette action met fin à l'enregistrement."
          : "Le suivi GPS sera arrêté. La trace est trop courte pour être enregistrée."}
        confirmLabel="Arrêter"
        onCancel={() => setConfirmStop(false)}
        onConfirm={() => {
          setConfirmStop(false);
          gps.stopAndSave();
        }}
      />
    </section>
  );
}
