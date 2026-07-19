import { useEffect, useState } from "react";
import type { NavPoint, NavRoute } from "../domain/navigation.types";
import type { GpsTrackingState } from "../hooks/useGpsTracking";
import { OpenLayersMap } from "../components/map/OpenLayersMap";
import { MapLayerToggle } from "../components/map/MapLayerToggle";
import { Button } from "../components/ui/Button";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { Card } from "../components/ui/Card";
import { distanceNm } from "../services/geo/distance";
import { isReliableGpsAltitude } from "../services/gps/geolocationService";
import type { GpsPosition } from "../domain/gps.types";
import type { MapBaseLayer, MapOrientationMode } from "../mapEngine/mapTypes";
import { useLocalStorageState } from "../hooks/useLocalStorageState";
import { hasSavableTrace } from "../services/traces/traceCollection";
import {
  getGpsPositionUiState,
  getRecordingUiState,
} from "../services/gps/gpsUiState";

interface TrackingScreenProps {
  route: NavRoute;
  mapBaseLayer: MapBaseLayer;
  onMapBaseLayerChange: (value: MapBaseLayer) => void;
  gps: GpsTrackingState;
  wakeLockActive: boolean;
  activityBlockedReason?: string | null;
}

function statusLabel(status: string): string {
  switch (status) {
    case "active":
      return "GPS actif";
    case "degraded":
      return "GPS dégradé";
    case "frozen":
      return "GPS gelé";
    case "simulating":
      return "SIM OK";
    case "simulation-complete":
      return "SIM terminée";
    case "requesting":
      return "Recherche GPS";
    case "denied":
      return "GPS refusé";
    case "unavailable":
      return "GPS perdu";
    case "saving":
      return "Sauvegarde...";
    case "save-error":
      return "Sauvegarde à reprendre";
    case "stopped":
      return "Sauvé";
    case "stopped-no-trace":
      return "Suivi arrêté";
    default:
      return "GPS prêt";
  }
}

function statusTone(status: string): "ok" | "warn" | "off" {
  if (status === "active" || status === "simulating" || status === "stopped")
    return "ok";
  if (
    status === "degraded" ||
    status === "frozen" ||
    status === "requesting" ||
    status === "simulation-complete" ||
    status === "saving" ||
    status === "save-error"
  )
    return "warn";
  return "off";
}

function formatClock(date = new Date()): string {
  return date.toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(minutes: number): string {
  const safeMinutes = Math.max(0, Math.round(minutes));
  const hours = Math.floor(safeMinutes / 60);
  const mins = safeMinutes % 60;
  return hours > 0
    ? `${hours}:${String(mins).padStart(2, "0")}`
    : `${mins} min`;
}

function routePointDistanceRemainingNm(
  route: NavRoute,
  currentPosition: GpsPosition | null,
  nextPoint: NavPoint | null,
  segmentIndex: number,
) {
  if (!currentPosition || !nextPoint || route.points.length < 2) return null;

  const nextPointIndex = Math.min(
    Math.max(segmentIndex + 1, 1),
    route.points.length - 1,
  );
  let remaining = distanceNm(currentPosition, nextPoint);

  for (
    let index = nextPointIndex;
    index < route.points.length - 1;
    index += 1
  ) {
    remaining += distanceNm(route.points[index], route.points[index + 1]);
  }

  return remaining;
}

function metricNumber(
  value: number | null | undefined,
  suffix: string,
  digits = 0,
) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  return `${value.toFixed(digits).replace(".", ",")} ${suffix}`;
}

function hudValue(
  value: number | null | undefined,
  suffix = "",
  digits = 0,
): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  return `${value.toFixed(digits).replace(".", ",")}${suffix ? ` ${suffix}` : ""}`;
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

export function TrackingScreen({
  route,
  mapBaseLayer,
  onMapBaseLayerChange,
  gps,
  wakeLockActive,
  activityBlockedReason,
}: TrackingScreenProps) {
  const [confirmStop, setConfirmStop] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [orientationMode, setOrientationMode] =
    useLocalStorageState<MapOrientationMode>(
      "capclair.trackingMapOrientation.v1",
      "north-up",
    );

  const isRecording =
    gps.status === "active" ||
    gps.status === "degraded" ||
    gps.status === "frozen" ||
    gps.status === "simulating";
  const isAcquiring = gps.status === "requesting";
  const canStopTracking =
    isRecording ||
    isAcquiring ||
    gps.status === "simulation-complete" ||
    gps.status === "save-error";
  const traceIsSavable = hasSavableTrace(gps.positions.length);
  const isSavedTrace = gps.status === "stopped";
  const traceForMap = gps.positions;

  const currentBranch =
    route.branches[gps.crossTrack.segmentIndex] ?? route.branches[0] ?? null;
  const magneticHeading = currentBranch
    ? Math.round(currentBranch.capCorrige)
    : null;

  const groundSpeed = gps.currentPosition?.vitesse ?? null;
  const altitude =
    gps.currentPosition && isReliableGpsAltitude(gps.currentPosition)
      ? gps.currentPosition.altitude
      : null;
  const altitudeFt = altitude !== null ? Math.round(altitude * 3.28084) : null;
  const currentTrack = gps.currentPosition?.track ?? null;
  const remainingDistanceNm = routePointDistanceRemainingNm(
    route,
    gps.currentPosition,
    gps.nextPoint,
    gps.crossTrack.segmentIndex,
  );
  const eteMinutes =
    groundSpeed && groundSpeed > 5 && remainingDistanceNm !== null
      ? (remainingDistanceNm / groundSpeed) * 60
      : null;
  const eta =
    eteMinutes !== null ? new Date(Date.now() + eteMinutes * 60000) : null;
  const gpsMap = getGpsPositionUiState({
    status: gps.status,
    locating: gps.locating,
    locationError: gps.locationError,
    currentPosition: gps.currentPosition,
    lastAccuracy: gps.lastAccuracy,
    lastSignalAgeSec: gps.lastSignalAgeSec,
  });
  const recordingUi = getRecordingUiState(gps.status, gps.recordingElapsedSec);
  const deviationSide =
    gps.crossTrack.side === "sur_route"
      ? "sur la route"
      : `à ${gps.crossTrack.side}`;

  useEffect(() => {
    if (!fullscreen) return undefined;

    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFullscreen(false);
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [fullscreen]);

  const toggleOrientation = () => {
    setOrientationMode((current) =>
      current === "track-up" ? "north-up" : "track-up",
    );
  };

  return (
    <section className={`tracking-screen ${fullscreen ? "is-fullscreen" : ""}`}>
      <div className="tracking-map-panel">
        <MapLayerToggle
          baseLayer={mapBaseLayer}
          onChange={onMapBaseLayerChange}
        />
        {!fullscreen && (
          <div
            className={`tracking-gps-map-status ${gpsMap.tone}`}
            title={gpsMap.detail}
            aria-label={`${gpsMap.label}. ${gpsMap.detail}`}
          >
            <i aria-hidden="true" />
            <span>{gpsMap.label}</span>
          </div>
        )}
        <OpenLayersMap
          route={route}
          trace={traceForMap}
          aircraft={gps.currentPosition}
          selectedPointId={gps.nextPoint?.id ?? null}
          compact
          baseLayer={mapBaseLayer}
          followAircraft={isRecording}
          orientationMode={orientationMode}
          allowUserRotation={orientationMode === "north-up"}
          onRequestPosition={gps.requestCurrentPosition}
          locating={gps.locating}
          locationError={gps.locationError}
          fullscreen={fullscreen}
          recordingControlState={
            fullscreen ? recordingUi.controlState : undefined
          }
          onRecordingControl={
            fullscreen
              ? () => {
                  if (canStopTracking) setConfirmStop(true);
                  else if (gps.status !== "saving" && !activityBlockedReason)
                    void gps.startGps();
                }
              : undefined
          }
          recordingControlDisabled={
            gps.status === "saving" || Boolean(activityBlockedReason)
          }
        />

        {!fullscreen && gps.currentPosition && route.points.length >= 2 && (
          <div
            className="tracking-route-deviation-map"
            aria-label={`Écart route ${gps.crossTrack.distanceNm.toFixed(1)} mille nautique ${deviationSide}`}
          >
            <span>Écart route</span>
            <strong>
              {gps.crossTrack.distanceNm.toFixed(1).replace(".", ",")} NM
            </strong>
            <small>{deviationSide}</small>
          </div>
        )}

        <div
          className="tracking-map-mode-controls"
          aria-label="Modes de la carte"
        >
          <button
            type="button"
            className="tracking-map-mode-icon"
            onClick={() => setFullscreen((current) => !current)}
            aria-label={
              fullscreen
                ? "Quitter le plein écran"
                : "Afficher la carte en plein écran"
            }
            title={fullscreen ? "Quitter le plein écran" : "Plein écran"}
          >
            <FullscreenToggleIcon active={fullscreen} />
          </button>
          <button
            type="button"
            className={`tracking-map-orientation-control ${orientationMode === "track-up" ? "active" : ""}`}
            onClick={toggleOrientation}
            aria-label={
              orientationMode === "track-up"
                ? "Passer en nord en haut"
                : "Passer en trajectoire en haut"
            }
            aria-pressed={orientationMode === "track-up"}
            title={
              orientationMode === "track-up"
                ? "Trajectoire en haut"
                : "Nord en haut"
            }
          >
            {orientationMode === "track-up" ? (
              <>
                <span>TRK</span>
                <strong>UP</strong>
              </>
            ) : (
              <>
                <span>NORD</span>
                <strong>UP</strong>
              </>
            )}
          </button>
        </div>
      </div>

      {fullscreen && (
        <>
          <div
            className="tracking-fullscreen-topbar"
            aria-label="État du suivi"
          >
            <div className="tracking-fullscreen-brand">
              <img src="/cap-clair-logo.svg" alt="" />
              <strong>CAP CLAIR</strong>
            </div>
            <span
              className={`tracking-position-chip ${gpsMap.tone}`}
              title={gpsMap.detail}
            >
              {gpsMap.label}
            </span>
            <button
              type="button"
              className="tracking-orientation-chip"
              onClick={toggleOrientation}
            >
              {orientationMode === "track-up" ? "TRK UP" : "NORD UP"}
            </button>
            <span className={`tracking-recording-chip ${recordingUi.tone}`}>
              {recordingUi.label}
            </span>
          </div>

          <div
            className="tracking-fullscreen-hud"
            aria-label="Informations de navigation"
          >
            <div className="tracking-hud-grid">
              <div className="tracking-hud-cell tracking-hud-next">
                <span>Prochain</span>
                <strong>{gps.nextPoint?.nom ?? "--"}</strong>
              </div>
              <div className="tracking-hud-cell">
                <span>Dist</span>
                <strong>{hudValue(gps.nextPointDistance, "NM", 1)}</strong>
              </div>
              <div className="tracking-hud-cell">
                <span>Cap mag</span>
                <strong>
                  {magneticHeading !== null ? `${magneticHeading}°` : "--"}
                </strong>
              </div>
              <div className="tracking-hud-cell">
                <span>GS</span>
                <strong>{hudValue(groundSpeed, "kt")}</strong>
              </div>
              <div className="tracking-hud-cell">
                <span>Alt GPS</span>
                <strong>
                  {altitudeFt !== null
                    ? `${altitudeFt.toLocaleString("fr-FR")} ft`
                    : "--"}
                </strong>
              </div>
              <div className="tracking-hud-cell">
                <span>ETA</span>
                <strong>{eta ? formatClock(eta) : "--"}</strong>
              </div>
            </div>
            <div className="tracking-hud-mode">Mode suivi plein écran</div>
          </div>
        </>
      )}

      <aside className="tracking-panel">
        <div
          className="tracking-live-grid"
          aria-label="Données GPS principales"
        >
          <div className="tracking-live-metric">
            <span>Vitesse sol</span>
            <strong>{metricNumber(groundSpeed, "kt")}</strong>
          </div>
          <div className="tracking-live-metric">
            <span>Alt GPS</span>
            <strong>
              {altitudeFt !== null
                ? `${altitudeFt.toLocaleString("fr-FR")} ft`
                : "--"}
            </strong>
          </div>
          <div className="tracking-live-metric">
            <span>Route GPS</span>
            <strong>
              {currentTrack !== null ? `${Math.round(currentTrack)}°` : "--"}
            </strong>
          </div>
          <div
            className={`tracking-live-metric tracking-precision ${gpsMap.tone}`}
          >
            <span>Précision</span>
            <strong>
              {gps.lastAccuracy !== null
                ? `${Math.round(gps.lastAccuracy)} m`
                : "--"}
            </strong>
          </div>
        </div>

        <div className="tracking-next-strip" aria-label="Prochaine étape">
          <div className="tracking-next-main">
            <span>Prochain point</span>
            <strong>{gps.nextPoint?.nom ?? "--"}</strong>
          </div>
          <div>
            <span>Distance</span>
            <strong>
              {gps.nextPointDistance !== null
                ? `${gps.nextPointDistance.toFixed(1).replace(".", ",")} NM`
                : "--"}
            </strong>
          </div>
          <div>
            <span>Cap mag</span>
            <strong>
              {magneticHeading !== null ? `${magneticHeading}°` : "--"}
            </strong>
          </div>
          <div>
            <span>ETA</span>
            <strong>{eta ? formatClock(eta) : "--"}</strong>
            <small>
              {eteMinutes !== null ? formatDuration(eteMinutes) : ""}
            </small>
          </div>
        </div>

        {gps.notificationWarning && (
          <Card className="gps-warning tracking-alert-card">
            <strong>Notification Android</strong>
            <p>{gps.notificationWarning}</p>
          </Card>
        )}

        {gps.noticeMessage && (
          <Card className="gps-signal-card tracking-alert-card">
            <strong>Suivi</strong>
            <p>{gps.noticeMessage}</p>
          </Card>
        )}

        {gps.errorMessage && (
          <Card className="gps-warning tracking-alert-card">
            <strong>État GPS</strong>
            <p>{gps.errorMessage}</p>
          </Card>
        )}

        {activityBlockedReason && !canStopTracking && (
          <Card className="gps-warning tracking-alert-card">
            <strong>Action temporairement indisponible</strong>
            <p>{activityBlockedReason}</p>
          </Card>
        )}

        <div className="tracking-actions tracking-actions-compact">
          {!canStopTracking && gps.status !== "saving" && (
            <Button
              variant="primary"
              onClick={gps.startGps}
              disabled={Boolean(activityBlockedReason)}
            >
              Démarrer l'enregistrement
            </Button>
          )}
          {!canStopTracking && gps.status !== "saving" && (
            <Button
              variant="secondary"
              onClick={gps.startSimulation}
              disabled={Boolean(activityBlockedReason)}
            >
              Tester simulation
            </Button>
          )}
          {gps.status === "saving" && (
            <Button variant="secondary" disabled>
              Finalisation...
            </Button>
          )}
          {canStopTracking && gps.status !== "saving" && (
            <Button variant="danger" onClick={() => setConfirmStop(true)}>
              {gps.status === "save-error"
                ? "Réessayer la sauvegarde"
                : isAcquiring
                  ? "Arrêter l'acquisition"
                  : traceIsSavable
                    ? "Arrêter et sauvegarder"
                    : "Arrêter l'enregistrement"}
            </Button>
          )}
        </div>

        <details className="tracking-diagnostics-panel">
          <summary>
            <span>Détails GPS et trace</span>
            <strong>{statusLabel(gps.status)}</strong>
          </summary>
          <div className="tracking-diagnostics-content">
            <div className="tracking-diagnostic-badges">
              <span className={statusTone(gps.status)}>
                {statusLabel(gps.status)}
              </span>
              <span className={isRecording ? "rec" : "off"}>
                {isRecording
                  ? "Trace REC"
                  : isSavedTrace
                    ? "Trace sauvée"
                    : "Trace prête"}
              </span>
              <span
                className={wakeLockActive ? "ok" : isRecording ? "warn" : "off"}
              >
                {wakeLockActive ? "Écran actif" : "Écran prêt"}
              </span>
            </div>
            <p>{gpsMap.detail}</p>
            <p>
              Source {gps.providerLabel} · seuil trace {gps.traceMaxSpeedKt} kt
              · {gps.nativeRuntime ? "shell native" : "web"}
            </p>
            {(isRecording || isSavedTrace) && (
              <p>
                Reçus {gps.diagnostics.rawReceived} · trace{" "}
                {gps.diagnostics.tracePoints} · précision{" "}
                {gps.diagnostics.rejectedPrecision} · saut{" "}
                {gps.diagnostics.rejectedSpeed} · gel {gps.diagnostics.gpsGaps}{" "}
                · reprise {gps.diagnostics.gpsResumptions} · alt. non fiable{" "}
                {gps.diagnostics.unreliableAltitude}
              </p>
            )}
            {isSavedTrace && (
              <p>
                {gps.positions.length} points ·{" "}
                {gps.distanceTravelledNm.toFixed(2).replace(".", ",")} NM ·
                export disponible dans Mes traces.
              </p>
            )}
          </div>
        </details>
      </aside>

      <ConfirmDialog
        open={confirmStop}
        title="Arrêter l’enregistrement ?"
        message={
          traceIsSavable
            ? "La trace actuelle sera sauvegardée localement. Cette action met fin à l’enregistrement."
            : isAcquiring
              ? "L’acquisition GPS sera arrêtée. Aucune trace ne sera créée."
              : "L’enregistrement sera arrêté. La trace est trop courte pour être sauvegardée."
        }
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
