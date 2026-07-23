import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import { Circle as CircleStyle, Fill, Stroke, Style, Text } from 'ol/style';
import { fromLonLat } from 'ol/proj';
import type { NavPoint } from '../domain/navigation.types';

function waypointLabel(point: NavPoint, index: number) {
  if (point.type === 'depart') return 'D';
  if (point.type === 'destination') return 'A';
  return String(index);
}

function sameEndpoint(left: NavPoint, right: NavPoint): boolean {
  if (left.code && right.code && left.code === right.code) return true;
  return Math.abs(left.latitude - right.latitude) < 1e-8
    && Math.abs(left.longitude - right.longitude) < 1e-8;
}

export function createWaypointLayer(points: NavPoint[], selectedPointId: string | null) {
  const departure = points.find((point) => point.type === 'depart');
  const destination = points.find((point) => point.type === 'destination');
  const sharedEndpoint = departure && destination && sameEndpoint(departure, destination)
    ? { departure, destination }
    : null;

  const visiblePoints = sharedEndpoint
    ? points.filter((point) => point.id !== sharedEndpoint.destination.id)
    : points;

  const features = visiblePoints.map((point) => {
    const originalIndex = points.findIndex((candidate) => candidate.id === point.id);
    const isSharedEndpoint = Boolean(sharedEndpoint && point.id === sharedEndpoint.departure.id);
    const feature = new Feature(new Point(fromLonLat([point.longitude, point.latitude])));
    feature.set('label', isSharedEndpoint ? 'D/A' : waypointLabel(point, originalIndex));
    feature.set('selected', isSharedEndpoint
      ? selectedPointId === sharedEndpoint?.departure.id || selectedPointId === sharedEndpoint?.destination.id
      : point.id === selectedPointId);
    return feature;
  });

  return new VectorLayer({
    source: new VectorSource({ features }),
    style: (feature) => {
      const selected = Boolean(feature.get('selected'));
      const label = String(feature.get('label'));
      return new Style({
        image: new CircleStyle({
          radius: label === 'D/A' ? (selected ? 12 : 10) : (selected ? 10 : 8),
          fill: new Fill({ color: selected ? '#F3F7FA' : '#18AEEF' }),
          stroke: new Stroke({ color: '#07111C', width: 2 })
        }),
        text: new Text({
          text: label,
          font: label === 'D/A' ? '800 9px system-ui' : '800 11px system-ui',
          fill: new Fill({ color: selected ? '#050B12' : '#F3F7FA' })
        })
      });
    },
    properties: { name: 'waypoints' },
    zIndex: 30
  });
}
