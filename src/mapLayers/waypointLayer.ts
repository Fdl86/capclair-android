import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import { Circle as CircleStyle, Fill, Stroke, Style, Text } from 'ol/style';
import { fromLonLat } from 'ol/proj';
import type { NavPoint } from '../domain/navigation.types';

function waypointLabel(point: NavPoint, index: number) {
  if (point.type === 'depart') return 'A';
  if (point.type === 'destination') return 'D';
  return String(index);
}

export function createWaypointLayer(points: NavPoint[], selectedPointId: string | null) {
  const features = points.map((point, index) => {
    const feature = new Feature(new Point(fromLonLat([point.longitude, point.latitude])));
    feature.set('label', waypointLabel(point, index));
    feature.set('selected', point.id === selectedPointId);
    return feature;
  });

  return new VectorLayer({
    source: new VectorSource({ features }),
    style: (feature) => {
      const selected = Boolean(feature.get('selected'));
      return new Style({
        image: new CircleStyle({
          radius: selected ? 10 : 8,
          fill: new Fill({ color: selected ? '#F3F7FA' : '#18AEEF' }),
          stroke: new Stroke({ color: '#07111C', width: 2 })
        }),
        text: new Text({
          text: String(feature.get('label')),
          font: '800 11px system-ui',
          fill: new Fill({ color: selected ? '#050B12' : '#F3F7FA' })
        })
      });
    },
    properties: { name: 'waypoints' },
    zIndex: 30
  });
}
