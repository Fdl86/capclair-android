import type { NavPoint } from '../../domain/navigation.types';
import { Button } from '../ui/Button';

interface RoutePointListProps {
  points: NavPoint[];
  selectedPointId: string | null;
  onSelect: (pointId: string) => void;
  onRemove: (pointId: string) => void;
}

function chipLabel(point: NavPoint, index: number) {
  if (point.type === 'depart') return 'D';
  if (point.type === 'destination') return 'A';
  return point.code ?? `WP${index}`;
}

function roleLabel(point: NavPoint) {
  if (point.type === 'depart') return 'Départ';
  if (point.type === 'destination') return 'Arrivée';
  return 'Point tournant';
}

export function RoutePointList({ points, selectedPointId, onSelect, onRemove }: RoutePointListProps) {
  if (points.length === 0) {
    return <div className="route-point-list empty">Saisir un départ et une arrivée pour créer la navigation.</div>;
  }

  return (
    <div className="route-point-list">
      {points.map((point, index) => (
        <div key={point.id} className={`route-point ${selectedPointId === point.id ? 'active' : ''}`} onClick={() => onSelect(point.id)} role="button" tabIndex={0}>
          <span className="point-chip">{chipLabel(point, index)}</span>
          <div className="route-point-main">
            <strong>{point.code ?? point.nom}</strong>
            <small>{roleLabel(point)}</small>
          </div>
          {point.type === 'waypoint' && (
            <Button variant="ghost" className="route-point-remove" onClick={(event) => { event.stopPropagation(); onRemove(point.id); }}>
              X
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}
