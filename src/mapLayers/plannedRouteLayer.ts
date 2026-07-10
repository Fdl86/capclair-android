import Feature from 'ol/Feature';
import LineString from 'ol/geom/LineString';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import { Stroke, Style } from 'ol/style';
import { fromLonLat } from 'ol/proj';
import type { NavPoint } from '../domain/navigation.types';

export function createPlannedRouteLayer(points: NavPoint[]) {
  const coordinates = points.map((point) => fromLonLat([point.longitude, point.latitude]));
  const feature = new Feature(new LineString(coordinates));

  return new VectorLayer({
    source: new VectorSource({ features: [feature] }),
    style: new Style({
      stroke: new Stroke({ color: '#18AEEF', width: 3, lineCap: 'round', lineJoin: 'round' })
    }),
    properties: { name: 'planned-route' },
    zIndex: 20
  });
}
