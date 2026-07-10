interface MapControlsProps {
  onRecenter: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
}

export function MapControls({ onRecenter, onZoomIn, onZoomOut }: MapControlsProps) {
  return (
    <div className="map-controls" aria-label="Contrôles carte">
      <button type="button" onClick={onRecenter} aria-label="Recentrer la carte">⌖</button>
      <button type="button" onClick={onZoomIn} aria-label="Zoom avant">+</button>
      <button type="button" onClick={onZoomOut} aria-label="Zoom arrière">-</button>
    </div>
  );
}
