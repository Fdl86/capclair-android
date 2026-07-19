import { useMemo, useState } from 'react';
import type { Trace } from '../domain/trace.types';
import type { MapBaseLayer } from '../mapEngine/mapTypes';
import { AltitudeProfile } from '../components/replay/AltitudeProfile';
import { ReplayPlaybackOverlay, ReplaySpeedControls } from '../components/replay/ReplayControls';
import { ReplayMap } from '../components/replay/ReplayMap';
import { MapLayerToggle } from '../components/map/MapLayerToggle';
import { useTraceReplay } from '../hooks/useTraceReplay';
import { useTerrainProfile } from '../hooks/useTerrainProfile';
import { buildReplayModel } from '../services/replay/traceReplayModel';
import { getCrossTrackError } from '../services/geo/crossTrackError';

interface TraceReplayScreenProps {
  trace: Trace;
  mapBaseLayer: MapBaseLayer;
  onMapBaseLayerChange: (value: MapBaseLayer) => void;
  onBack: () => void;
}

function metric(value: number | null | undefined, suffix: string, digits = 0): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '--';
  return `${value.toFixed(digits).replace('.', ',')} ${suffix}`;
}

function formatGap(durationMs: number): string {
  const seconds = Math.round(durationMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return minutes > 0 ? `${minutes} min ${String(remaining).padStart(2, '0')} s` : `${remaining} s`;
}

export function TraceReplayScreen({ trace, mapBaseLayer, onMapBaseLayerChange, onBack }: TraceReplayScreenProps) {
  const model = useMemo(() => buildReplayModel(trace), [trace]);
  const replay = useTraceReplay(model);
  const terrain = useTerrainProfile(trace, model);
  const hasPlannedRoute = (trace.plannedRoute?.points.length ?? 0) >= 2;
  const [showPlannedRoute, setShowPlannedRoute] = useState(hasPlannedRoute);
  const [followAircraft, setFollowAircraft] = useState(true);
  const plannedPoints = trace.plannedRoute?.points ?? [];
  const crossTrack = replay.sample && hasPlannedRoute ? getCrossTrackError(replay.sample.position, plannedPoints) : null;
  const traceDate = new Date(trace.startedAt ?? trace.date);
  const replayDistanceNm = replay.sample?.cumulativeDistanceNm
    ?? (replay.activeTimeMs >= model.totalActiveTimeMs ? model.totalDistanceNm : null);
  const terrainElevationFt = terrain.visible && replay.sample
    ? terrain.elevationAtDistance(replay.sample.cumulativeDistanceNm)
    : null;
  const estimatedHeightFt = replay.sample?.altitudeFt !== null
    && replay.sample?.altitudeFt !== undefined
    && terrainElevationFt !== null
    ? replay.sample.altitudeFt - terrainElevationFt
    : null;
  const dateLabel = Number.isNaN(traceDate.getTime())
    ? ''
    : traceDate.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase();

  if (model.points.length < 2) {
    return (
      <section className="replay-screen replay-unavailable">
        <header className="replay-header">
          <button type="button" className="replay-back" onClick={onBack} aria-label="Retour aux traces">‹</button>
          <div><span>Replay</span><strong>{trace.routeName}</strong></div>
        </header>
        <div className="replay-empty">
          <strong>Replay indisponible</strong>
          <p>Cette trace ne contient pas assez de positions valides.</p>
          <button type="button" className="btn btn-secondary" onClick={onBack}>Retour aux traces</button>
        </div>
      </section>
    );
  }

  return (
    <section className="replay-screen">
      <header className="replay-header">
        <button type="button" className="replay-back" onClick={onBack} aria-label="Retour aux traces">‹</button>
        <div className="replay-title">
          <span>Replay</span>
          <strong>{trace.routeName}</strong>
        </div>
        <div className="replay-date">
          <strong>{dateLabel}</strong>
          <span>{model.points.length.toLocaleString('fr-FR')} points · {model.segments.length} segment{model.segments.length > 1 ? 's' : ''}</span>
        </div>
      </header>

      <div className="replay-metrics">
        <div><span>Heure</span><strong>{replay.sample ? new Date(replay.sample.timestamp).toLocaleTimeString('fr-FR') : '--'}</strong></div>
        <div><span>Vitesse sol</span><strong>{metric(replay.sample?.speedKt, 'kt')}</strong></div>
        <div>
          <span>Altitude GPS</span>
          <strong>{metric(replay.sample?.altitudeFt, 'ft')}</strong>
          {terrain.phase === 'loading' ? (
            <small>Relief en cours de chargement</small>
          ) : terrainElevationFt !== null ? (
            <small>Sol {metric(terrainElevationFt, 'ft')} · H sol estimée {metric(estimatedHeightFt, 'ft')}</small>
          ) : (
            <small>Relief non disponible</small>
          )}
        </div>
        <div><span>Distance</span><strong>{metric(replayDistanceNm, 'NM', 1)}</strong><small>sur {model.totalDistanceNm.toFixed(1).replace('.', ',')} NM</small></div>
      </div>

      <div className="replay-map-panel">
        <MapLayerToggle baseLayer={mapBaseLayer} onChange={onMapBaseLayerChange} />
        <div className="replay-map-modes">
          <button
            type="button"
            className={showPlannedRoute ? 'active' : ''}
            disabled={!hasPlannedRoute}
            aria-pressed={showPlannedRoute}
            title={hasPlannedRoute ? 'Afficher ou masquer la route prévue' : 'Route prévue non enregistrée pour cette trace'}
            onClick={() => setShowPlannedRoute((current) => !current)}
          >
            <i /> Route prévue
          </button>
          <button
            type="button"
            className={followAircraft ? 'active' : ''}
            aria-pressed={followAircraft}
            onClick={() => setFollowAircraft((current) => !current)}
          >
            {followAircraft ? 'Suivi avion' : 'Vue globale'}
          </button>
        </div>
        <ReplayMap
          model={model}
          aircraft={replay.sample?.position ?? null}
          plannedRoute={trace.plannedRoute}
          showPlannedRoute={showPlannedRoute}
          baseLayer={mapBaseLayer}
          followAircraft={followAircraft}
        />
        {crossTrack && (
          <div className="replay-cross-track-map">
            <span>Écart route</span>
            <strong>{crossTrack.distanceNm.toFixed(1).replace('.', ',')} NM</strong>
            <small>{crossTrack.side === 'gauche' ? 'à gauche' : crossTrack.side === 'droite' ? 'à droite' : 'sur la route'}</small>
          </div>
        )}
        <ReplayPlaybackOverlay
          activeTimeMs={replay.activeTimeMs}
          totalTimeMs={model.totalActiveTimeMs}
          playing={replay.playing}
          onTogglePlayback={replay.togglePlayback}
          onRestart={replay.restart}
        />
        {replay.gapNoticeMs !== null && (
          <div className="replay-gap-notice">Coupure GPS · {formatGap(replay.gapNoticeMs)} ignorée</div>
        )}
      </div>

      <AltitudeProfile
        model={model}
        sample={replay.sample}
        terrainProfile={terrain.profile}
        terrainPhase={terrain.phase}
        terrainVisible={terrain.visible}
        terrainError={terrain.error}
        terrainFromCache={terrain.fromCache}
        onTerrainVisibleChange={terrain.setVisible}
        onRetryTerrain={terrain.retry}
        onSeekDistance={replay.seekDistance}
      />

      <div className="replay-speed-area">
        <ReplaySpeedControls speed={replay.speed} onSpeedChange={replay.changeSpeed} />
        {model.discardedPointCount > 0 && <p className="replay-data-warning">{model.discardedPointCount} point(s) invalide(s) ignoré(s).</p>}
      </div>
    </section>
  );
}
