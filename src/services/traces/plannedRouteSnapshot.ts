import type { NavRoute } from '../../domain/navigation.types';
import type { PlannedRouteSnapshot } from '../../domain/trace.types';

const STORAGE_KEY = 'capclair.activePlannedRoute.v1';
const MAX_AGE_MS = 48 * 60 * 60 * 1000;

interface PendingPlannedRoute {
  savedAt: number;
  snapshot: PlannedRouteSnapshot;
}

export function createPlannedRouteSnapshot(route: NavRoute, capturedAt = new Date()): PlannedRouteSnapshot | undefined {
  const points = route.points
    .filter((point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude))
    .map((point) => ({
      id: point.id,
      nom: point.nom,
      code: point.code,
      type: point.type,
      latitude: point.latitude,
      longitude: point.longitude
    }));

  if (points.length < 2) return undefined;
  return {
    routeId: route.id,
    routeName: route.nom,
    capturedAt: capturedAt.toISOString(),
    points
  };
}

export function persistPendingPlannedRoute(snapshot: PlannedRouteSnapshot | undefined): void {
  try {
    if (!snapshot) {
      window.localStorage.removeItem(STORAGE_KEY);
      return;
    }
    const pending: PendingPlannedRoute = { savedAt: Date.now(), snapshot };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(pending));
  } catch {
    // Best effort only: trace recording must never depend on this metadata.
  }
}

export function readPendingPlannedRoute(): PlannedRouteSnapshot | undefined {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return undefined;
    const pending = JSON.parse(raw) as PendingPlannedRoute;
    if (!pending?.snapshot || !Number.isFinite(pending.savedAt) || Date.now() - pending.savedAt > MAX_AGE_MS) {
      window.localStorage.removeItem(STORAGE_KEY);
      return undefined;
    }
    return pending.snapshot.points?.length >= 2 ? pending.snapshot : undefined;
  } catch {
    return undefined;
  }
}

export function clearPendingPlannedRoute(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Best effort only.
  }
}
