import type { CrossTrackResult } from '../../services/geo/crossTrackError';

interface RouteDeviationGaugeProps {
  result: CrossTrackResult;
}

export function RouteDeviationGauge({ result }: RouteDeviationGaugeProps) {
  const sideLabel = result.side === 'sur_route' ? 'OK' : result.side.toUpperCase();
  const offset = Math.max(-42, Math.min(42, result.side === 'gauche' ? -result.distanceNm * 28 : result.side === 'droite' ? result.distanceNm * 28 : 0));

  return (
    <section className="deviation-gauge" aria-label="Écart route">
      <span>Écart route</span>
      <div className="deviation-value">
        <strong>{result.distanceNm.toFixed(1).replace('.', ',')}</strong>
        <em>NM</em>
        <b>{sideLabel}</b>
      </div>
      <div className="deviation-scale">
        <span>Gauche</span>
        <div className="scale-line">
          <i style={{ transform: `translateX(${offset}px)` }} />
        </div>
        <span>Droite</span>
      </div>
    </section>
  );
}
