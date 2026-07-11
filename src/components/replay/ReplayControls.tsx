import type { ReplaySpeed } from '../../domain/replay.types';

interface ReplayControlsProps {
  activeTimeMs: number;
  totalTimeMs: number;
  playing: boolean;
  speed: ReplaySpeed;
  onTogglePlayback: () => void;
  onRestart: () => void;
  onSeek: (activeTimeMs: number) => void;
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

export function ReplayControls({
  activeTimeMs,
  totalTimeMs,
  playing,
  speed,
  onTogglePlayback,
  onRestart,
  onSeek,
  onSpeedChange
}: ReplayControlsProps) {
  return (
    <div className="replay-controls">
      <div className="replay-play-row">
        <button type="button" className="replay-play-button" onClick={onTogglePlayback} aria-label={playing ? 'Mettre le replay en pause' : 'Lire le replay'}>
          {playing ? <span className="replay-pause-icon">Ⅱ</span> : <span className="replay-play-icon" />}
        </button>
        <div className="replay-clock">
          <strong>{duration(activeTimeMs)}</strong>
          <span>sur {duration(totalTimeMs)}</span>
        </div>
        <button type="button" className="replay-restart" onClick={onRestart}>Début</button>
      </div>

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

      <input
        className="replay-time-slider"
        type="range"
        min={0}
        max={Math.max(1, totalTimeMs)}
        step={100}
        value={Math.min(activeTimeMs, Math.max(1, totalTimeMs))}
        onChange={(event) => onSeek(Number(event.target.value))}
        aria-label="Position dans le replay"
      />
      <p className="replay-scrub-help">Touchez le profil ou déplacez le curseur pour examiner le vol.</p>
    </div>
  );
}
