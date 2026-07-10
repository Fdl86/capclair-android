import type { MapBaseLayer } from '../../mapEngine/mapTypes';

interface MapLayerToggleProps {
  baseLayer: MapBaseLayer;
  onChange: (value: MapBaseLayer) => void;
}

export function MapLayerToggle({ baseLayer, onChange }: MapLayerToggleProps) {
  return (
    <div className="map-layer-toggle map-layer-toggle-wide" aria-label="Fond de carte">
      <span>Fond carte</span>
      <button type="button" className={baseLayer === 'free' ? 'active' : ''} onClick={() => onChange('free')}>
        openAIP
      </button>
      <button type="button" className={baseLayer === 'oaci' ? 'active' : ''} onClick={() => onChange('oaci')}>
        OACI 1/500k
      </button>
    </div>
  );
}
