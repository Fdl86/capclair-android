import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import { Icon, Style } from 'ol/style';
import { fromLonLat } from 'ol/proj';
import type { GpsPosition } from '../domain/gps.types';
import { AIRCRAFT_ICON_SRC, aircraftScaleForZoom } from './aircraftIcon';

export type AircraftLayer = VectorLayer<VectorSource<Feature<Point>>>;

const AIRCRAFT_FEATURE_ID = 'aircraft-marker';
const LAST_HEADING_PROPERTY = 'lastReliableTrackDeg';

function normalizeHeading(value: number): number { return ((Math.round(value) % 360) + 360) % 360; }
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
      scale: aircraftScaleForZoom(zoom)
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
