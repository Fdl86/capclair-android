import type { NavPoint, NavRoute } from '../../domain/navigation.types';

function endpoint(points: NavPoint[], type: 'depart' | 'destination'): NavPoint | undefined {
  return points.find((point) => point.type === type)
    ?? (type === 'depart' ? points[0] : points.at(-1));
}

export function isLoopRoutePoints(points: NavPoint[]): boolean {
  if (points.length < 2) return false;
  const departure = endpoint(points, 'depart');
  const destination = endpoint(points, 'destination');
  if (!departure || !destination) return false;
  if (departure.code && destination.code) {
    return departure.code.trim().toUpperCase() === destination.code.trim().toUpperCase();
  }
  return Math.abs(departure.latitude - destination.latitude) < 1e-8
    && Math.abs(departure.longitude - destination.longitude) < 1e-8;
}

export function isIncompleteLoopRoute(route: Pick<NavRoute, 'points' | 'branches' | 'distanceTotale'>): boolean {
  return isLoopRoutePoints(route.points)
    && (route.points.length < 3 || route.branches.length < 2 || route.distanceTotale <= 0.01);
}

export function isRouteReady(route: Pick<NavRoute, 'points' | 'branches' | 'distanceTotale'>): boolean {
  if (route.points.length < 2 || route.branches.length === 0 || route.distanceTotale <= 0.01) return false;
  return !isIncompleteLoopRoute(route);
}

export function routeReadinessMessage(route: Pick<NavRoute, 'points' | 'branches' | 'distanceTotale'>): string | null {
  if (isIncompleteLoopRoute(route)) return 'Boucle à compléter : ajoutez au moins un point tournant.';
  if (route.points.length < 2) return 'Route incomplète : départ et arrivée nécessaires.';
  if (route.branches.length === 0 || route.distanceTotale <= 0.01) return 'Route à compléter : ajoutez un point distinct.';
  return null;
}
