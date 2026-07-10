import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import { Icon, Style } from 'ol/style';
import { fromLonLat } from 'ol/proj';
import type { GpsPosition } from '../domain/gps.types';

export type AircraftLayer = VectorLayer<VectorSource<Feature<Point>>>;

const AIRCRAFT_FEATURE_ID = 'aircraft-marker';
const LAST_HEADING_PROPERTY = 'lastReliableTrackDeg';

const AIRCRAFT_SVG = encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
  <path d="M32 4 L38 30 L60 38 L60 47 L40 42 L38 55 L47 60 L47 63 L32 59 L17 63 L17 60 L26 55 L24 42 L4 47 L4 38 L26 30 Z" fill="#07111c" opacity="0.96"/>
  <path d="M32 7 L37 31 L58 39 L58 44 L39 40 L36 54 L44 58 L44 60 L32 56 L20 60 L20 58 L28 54 L25 40 L6 44 L6 39 L27 31 Z" fill="#eaf8ff" stroke="#59cfff" stroke-width="2.2" stroke-linejoin="round"/>
  <path d="M32 8 L36 31 L32 37 L28 31 Z" fill="#59cfff" opacity="0.95"/>
  <path d="M29 39 L35 39 L35 54 L32 56 L29 54 Z" fill="#c7eefc" opacity="0.9"/>
</svg>
`);
const AIRCRAFT_ICON_SRC = `data:image/svg+xml;charset=UTF-8,${AIRCRAFT_SVG}`;

function clamp(value: number, min: number, max: number): number { return Math.max(min, Math.min(max, value)); }
function normalizeHeading(value: number): number { return ((Math.round(value) % 360) + 360) % 360; }
function scaleForZoom(zoom?: number): number {
  if (typeof zoom !== 'number' || !Number.isFinite(zoom)) return 0.62;
  const safeZoom = clamp(zoom, 6, 14);
  const normalized = (safeZoom - 6) / 8;
  return Number((0.52 + normalized * 0.28).toFixed(3));
}
function headingForPosition(layer: AircraftLayer, position: GpsPosition | null): number {
  if (!position) return Number(layer.get(LAST_HEADING_PROPERTY) ?? 0);
  const hasTrack = typeof position.track === 'number' && Number.isFinite(position.track);
  const hasReliableSpeed = typeof position.vitesse === 'number' && position.vitesse >= 5;
  if (hasTrack && hasReliableSpeed) {
    const heading = normalizeHeading(position.track as number);
    layer.set(LAST_HEADING_PROPERTY, heading);
    return heading;
  }
  return Number(layer.get(LAST_HEADING_PROPERTY) ?? 0);
}
function createAircraftStyle(headingDeg: number, zoom?: number): Style {
  return new Style({
    image: new Icon({
      src: AIRCRAFT_ICON_SRC,
      anchor: [0.5, 0.5],
      anchorXUnits: 'fraction',
      anchorYUnits: 'fraction',
      rotation: (normalizeHeading(headingDeg) * Math.PI) / 180,
      rotateWithView: true,
      scale: scaleForZoom(zoom)
    })
  });
}
export function createAircraftLayer(position: GpsPosition | null = null, zoom?: number): AircraftLayer {
  const source = new VectorSource<Feature<Point>>();
  const layer = new VectorLayer({ source, style: createAircraftStyle(0, zoom), properties: { name: 'aircraft', [LAST_HEADING_PROPERTY]: 0 }, renderBuffer: 96, zIndex: 80 });
  updateAircraftLayer(layer, position, zoom);
  return layer;
}
export function updateAircraftLayer(layer: AircraftLayer, position: GpsPosition | null, zoom?: number): void {
  const source = layer.getSource(); if (!source) return;
  const previousFeature = source.getFeatureById(AIRCRAFT_FEATURE_ID) as Feature<Point> | null;
  if (!position) { if (previousFeature) source.removeFeature(previousFeature); return; }
  const heading = headingForPosition(layer, position);
  const coordinate = fromLonLat([position.longitude, position.latitude]);
  if (previousFeature) previousFeature.getGeometry()?.setCoordinates(coordinate); else { const feature = new Feature(new Point(coordinate)); feature.setId(AIRCRAFT_FEATURE_ID); source.addFeature(feature); }
  layer.setStyle(createAircraftStyle(heading, zoom));
}
