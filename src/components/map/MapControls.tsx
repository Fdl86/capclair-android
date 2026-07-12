import type { MapOrientationMode } from '../../mapEngine/mapTypes';

interface MapControlsProps {
  onRecenter: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  orientationMode?: MapOrientationMode;
  onToggleOrientation?: () => void;
  fullscreen?: boolean;
  onToggleFullscreen?: () => void;
  locating?: boolean;
}

function FullscreenIcon({ active }: { active: boolean }) {
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

function RecenterIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="5" />
      <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
    </svg>
  );
}

export function MapControls({
  onRecenter,
  onZoomIn,
  onZoomOut,
  orientationMode,
  onToggleOrientation,
  fullscreen = false,
  onToggleFullscreen,
  locating = false
}: MapControlsProps) {
  return (
    <div className={`map-controls ${onToggleOrientation || onToggleFullscreen ? 'map-controls-flight' : ''}`} aria-label="Contrôles carte">
      {onToggleFullscreen && (
        <button
          type="button"
          className="map-control-icon"
          onClick={onToggleFullscreen}
          aria-label={fullscreen ? 'Quitter le plein écran' : 'Afficher la carte en plein écran'}
          title={fullscreen ? 'Quitter le plein écran' : 'Plein écran'}
        >
          <FullscreenIcon active={fullscreen} />
        </button>
      )}

      <button
        type="button"
        className={`map-control-icon ${locating ? 'is-locating' : ''}`}
        onClick={() => { void onRecenter(); }}
        disabled={locating}
        aria-label={locating ? 'Recherche de la position GPS' : 'Recentrer la carte'}
        title={locating ? 'Recherche GPS...' : "Centrer sur l'avion"}
      >
        <RecenterIcon />
      </button>

      {onToggleOrientation && orientationMode && (
        <button
          type="button"
          className={`map-orientation-control ${orientationMode === 'track-up' ? 'active' : ''}`}
          onClick={onToggleOrientation}
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
      )}

      <button type="button" onClick={onZoomIn} aria-label="Zoom avant" title="Zoom avant">+</button>
      <button type="button" onClick={onZoomOut} aria-label="Zoom arrière" title="Zoom arrière">-</button>
    </div>
  );
}
