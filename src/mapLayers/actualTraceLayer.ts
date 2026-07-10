import Feature from 'ol/Feature';
import MultiLineString from 'ol/geom/MultiLineString';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import { Stroke, Style } from 'ol/style';
import { fromLonLat } from 'ol/proj';
import type { GpsPosition } from '../domain/gps.types';

export type ActualTraceLayer = VectorLayer<VectorSource<Feature<MultiLineString>>>;

const TRACE_FEATURE_ID = 'actual-trace-line';

// Au-delà de cet écart entre deux points consécutifs de la trace, on
// considère qu'il y a eu une perte de signal (écran verrouillé, app en
// arrière-plan, zone sans réception...) plutôt qu'un déplacement réel : on
// coupe le tracé au lieu de relier les deux points par une fausse ligne
// droite qui ne correspond à rien de volé/roulé.
const TRACE_GAP_BREAK_MS = 15000;

function toSegments(positions: GpsPosition[]): number[][][] {
  const segments: number[][][] = [];
  let current: number[][] = [];

  positions.forEach((position, index) => {
    const previous = positions[index - 1];
    const isGap = previous !== undefined && position.timestamp - previous.timestamp > TRACE_GAP_BREAK_MS;
    if (isGap && current.length > 0) {
      segments.push(current);
      current = [];
    }
    current.push(fromLonLat([position.longitude, position.latitude]));
  });

  if (current.length > 0) segments.push(current);
  // Un segment à un seul point n'est pas une ligne valide : on l'écarte du
  // tracé (le marqueur avion affiche déjà la position courante ailleurs).
  return segments.filter((segment) => segment.length >= 2);
}

export function createActualTraceLayer(positions: GpsPosition[] = []): ActualTraceLayer {
  const feature = new Feature(new MultiLineString(toSegments(positions)));
  feature.setId(TRACE_FEATURE_ID);

  return new VectorLayer({
    source: new VectorSource({ features: [feature] }),
    style: new Style({
      stroke: new Stroke({ color: '#FF9A3D', width: 3, lineCap: 'round', lineJoin: 'round' })
    }),
    properties: { name: 'actual-trace' },
    renderBuffer: 32,
    zIndex: 21
  });
}

export function updateActualTraceLayer(layer: ActualTraceLayer, positions: GpsPosition[]): void {
  const feature = layer.getSource()?.getFeatureById(TRACE_FEATURE_ID);
  const geometry = feature?.getGeometry();
  if (!geometry) return;
  geometry.setCoordinates(toSegments(positions));
}
