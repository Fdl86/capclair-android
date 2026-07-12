import type { ReplaySpeed } from '../../domain/replay.types';

interface ReplayPlaybackOverlayProps {
  activeTimeMs: number;
  totalTimeMs: number;
  playing: boolean;
  onTogglePlayback: () => void;
  onRestart: () => void;
}

interface ReplaySpeedControlsProps {
  speed: ReplaySpeed;
  onSpeedChange: (speed: ReplaySpeed) => void;
}

function duration(valueMs: number): string {
  const totalSeconds = Math.max(0, Math.round(valueMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

const SPEEDS: ReplaySpeed[] = [1, 5, 10, 20];

export function ReplayPlaybackOverlay({
  activeTimeMs,
  totalTimeMs,
  playing,
  onTogglePlayback,
  onRestart
}: ReplayPlaybackOverlayProps) {
  return (
    <div className="replay-playback-overlay" aria-label="Commandes de lecture du replay">
      <button
        type="button"
        className="replay-play-button"
        onClick={onTogglePlayback}
        aria-label={playing ? 'Mettre le replay en pause' : 'Lire le replay'}
      >
        {playing ? <span className="replay-pause-icon">Ⅱ</span> : <span className="replay-play-icon" />}
      </button>
      <div className="replay-clock-inline">
        <strong>{duration(activeTimeMs)}</strong>
        <span>/ {duration(totalTimeMs)}</span>
      </div>
      <button type="button" className="replay-restart" onClick={onRestart} aria-label="Revenir au début du replay">
        <span aria-hidden="true">↶</span> Début
      </button>
    </div>
  );
}

export function ReplaySpeedControls({ speed, onSpeedChange }: ReplaySpeedControlsProps) {
  return (
    <div className="replay-controls">
      <div className="replay-speed-grid" aria-label="Vitesse du replay">
        {SPEEDS.map((value) => (
          <button
            key={value}
            type="button"
            className={speed === value ? 'active' : ''}
            aria-pressed={speed === value}
            onClick={() => onSpeedChange(value)}
          >
            ×{value}
          </button>
        ))}
      </div>
    </div>
  );
}
