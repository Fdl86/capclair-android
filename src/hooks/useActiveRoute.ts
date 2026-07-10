import { useMemo, useState } from 'react';
import type { BranchWind, FlightProfile, NavPoint, NavRoute } from '../domain/navigation.types';
import { useLocalStorageState } from './useLocalStorageState';
import { buildRoute, createAerodromePoint, createEmptyRoute, createManualWaypoint, relabelRoutePoints } from '../services/navigation/routeBuilder';
import { fetchWindAloftForRoute } from '../services/weather/windAloftClient';

const STORAGE_KEY = 'capclair.activeRoute.dev15_0_2.emptyRoute';
const defaultRoute = createEmptyRoute();

function pointCode(route: NavRoute, id: string): string {
  const point = route.points.find((item) => item.id === id);
  return point?.code ?? point?.nom ?? id.toUpperCase();
}

function branchLabel(route: NavRoute, branchId: string): string {
  const branch = route.branches.find((item) => item.id === branchId);
  if (!branch) return branchId;
  return `${pointCode(route, branch.from)}-${pointCode(route, branch.to)}`;
}



function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function segmentDistanceNm(point: Pick<NavPoint, 'latitude' | 'longitude'>, start: NavPoint, end: NavPoint): number {
  const averageLatRad = ((start.latitude + end.latitude + point.latitude) / 3) * Math.PI / 180;
  const x1 = 0;
  const y1 = 0;
  const x2 = (end.longitude - start.longitude) * Math.cos(averageLatRad) * 60;
  const y2 = (end.latitude - start.latitude) * 60;
  const xp = (point.longitude - start.longitude) * Math.cos(averageLatRad) * 60;
  const yp = (point.latitude - start.latitude) * 60;
  const segmentLengthSquared = x2 * x2 + y2 * y2;

  if (segmentLengthSquared <= 0.000001) {
    return Math.hypot(xp - x1, yp - y1);
  }

  const projection = clamp(((xp - x1) * x2 + (yp - y1) * y2) / segmentLengthSquared, 0, 1);
  const projectedX = x1 + projection * x2;
  const projectedY = y1 + projection * y2;
  return Math.hypot(xp - projectedX, yp - projectedY);
}

function nearestRouteSegmentIndex(points: NavPoint[], longitude: number, latitude: number): number {
  if (points.length < 2) return 0;

  const clickedPoint = { longitude, latitude };
  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (let index = 0; index < points.length - 1; index += 1) {
    const distance = segmentDistanceNm(clickedPoint, points[index], points[index + 1]);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  }

  return bestIndex;
}

function safeRoute(route: NavRoute): NavRoute {
  if (!route.points) return defaultRoute;
  return buildRoute(route.points, {
    profile: route.profile ?? defaultRoute.profile,
    branchAltitudeById: route.branchAltitudeById ?? {},
    branchWindById: route.branchWindById ?? {}
  });
}

export function useActiveRoute() {
  const [route, setRoute] = useLocalStorageState<NavRoute>(STORAGE_KEY, defaultRoute);
  const [selectedPointId, setSelectedPointId] = useState<string | null>(route.points[1]?.id ?? route.points[0]?.id ?? null);
  const [routeMessage, setRouteMessage] = useState('Route prête');
  const [weatherStatus, setWeatherStatus] = useState('Vent non chargé');

  const normalizedRoute = useMemo(() => safeRoute(route), [route]);
  const selectedPoint = useMemo(() => normalizedRoute.points.find((point) => point.id === selectedPointId) ?? null, [normalizedRoute.points, selectedPointId]);

  const rebuild = (
    points: NavPoint[] = normalizedRoute.points,
    profile: Partial<FlightProfile> = normalizedRoute.profile,
    branchAltitudeById = normalizedRoute.branchAltitudeById,
    branchWindById: Record<string, BranchWind> = normalizedRoute.branchWindById,
    message = 'Route mise à jour'
  ) => {
    const nextRoute = buildRoute(relabelRoutePoints(points), { profile, branchAltitudeById, branchWindById });
    setRoute(nextRoute);
    setRouteMessage(message);
    return nextRoute;
  };

  const setDepartureCode = (code: string): boolean => {
    const point = createAerodromePoint(code, 'depart');
    if (!point) {
      setRouteMessage(`Code départ inconnu : ${code.trim().toUpperCase()}`);
      return false;
    }
    const existingDestination = normalizedRoute.points.find((item) => item.type === 'destination') ?? normalizedRoute.points.at(-1);
    const nextPoints = existingDestination && existingDestination.id !== point.id ? [point, existingDestination] : [point];
    rebuild(nextPoints, normalizedRoute.profile, {}, {}, `Départ ${point.code}`);
    setWeatherStatus('Vent à rafraîchir');
    setSelectedPointId(point.id);
    return true;
  };

  const setDestinationCode = (code: string): boolean => {
    const point = createAerodromePoint(code, 'destination');
    if (!point) {
      setRouteMessage(`Code arrivée inconnu : ${code.trim().toUpperCase()}`);
      return false;
    }
    const existingDeparture = normalizedRoute.points.find((item) => item.type === 'depart') ?? normalizedRoute.points[0];
    const nextPoints = existingDeparture && existingDeparture.id !== point.id ? [existingDeparture, point] : [point];
    rebuild(nextPoints, normalizedRoute.profile, {}, {}, `Arrivée ${point.code}`);
    setWeatherStatus('Vent à rafraîchir');
    setSelectedPointId(point.id);
    return true;
  };

  const addWaypointAt = (longitude: number, latitude: number) => {
    if (normalizedRoute.points.length < 2) {
      setRouteMessage('Choisir un départ et une arrivée avant d’ajouter un point.');
      return;
    }

    const insertIndex = nearestRouteSegmentIndex(normalizedRoute.points, longitude, latitude) + 1;
    const nextWaypointNumber = normalizedRoute.points.filter((point) => point.type === 'waypoint' && point.source !== 'aerodrome').length + 1;
    const point = createManualWaypoint(latitude, longitude, nextWaypointNumber);
    const points = [...normalizedRoute.points];
    points.splice(insertIndex, 0, point);
    rebuild(points, normalizedRoute.profile, normalizedRoute.branchAltitudeById, {}, `${point.code} ajouté`);
    setWeatherStatus('Vent à rafraîchir');
    setSelectedPointId(point.id);
  };

  const removePoint = (pointId: string) => {
    const point = normalizedRoute.points.find((item) => item.id === pointId);
    if (!point || point.type !== 'waypoint') return;
    const points = normalizedRoute.points.filter((item) => item.id !== pointId);
    rebuild(points, normalizedRoute.profile, normalizedRoute.branchAltitudeById, {}, `${point.code ?? point.nom} supprimé`);
    setWeatherStatus('Vent à rafraîchir');
    setSelectedPointId(points[1]?.id ?? points[0]?.id ?? null);
  };

  const reverseRoute = () => {
    if (normalizedRoute.points.length < 2) {
      setRouteMessage('Route incomplète : départ et arrivée nécessaires.');
      return;
    }

    const points = normalizedRoute.points.slice().reverse().map((point, index, array) => ({
      ...point,
      type: index === 0 ? 'depart' as const : index === array.length - 1 ? 'destination' as const : 'waypoint' as const,
      id: `${index === 0 ? 'depart' : index === array.length - 1 ? 'destination' : 'waypoint'}-${point.code?.toLowerCase() ?? point.id}`
    }));
    rebuild(points, normalizedRoute.profile, {}, {}, 'Route inversée');
    setWeatherStatus('Vent à rafraîchir');
    setSelectedPointId(points[1]?.id ?? points[0]?.id ?? null);
  };

  const setTasKt = (tasKt: number) => {
    const profile = { ...normalizedRoute.profile, tasKt };
    rebuild(normalizedRoute.points, profile, normalizedRoute.branchAltitudeById, normalizedRoute.branchWindById, `TAS ${Math.round(tasKt)} kt`);
  };

  const setDefaultAltitudeFt = (defaultAltitudeFt: number) => {
    const profile = { ...normalizedRoute.profile, defaultAltitudeFt };
    // On préserve les altitudes réglées par branche ; seules les branches sans override
    // suivent la nouvelle altitude par défaut. Le vent est réinitialisé (dépend de l'altitude).
    rebuild(normalizedRoute.points, profile, normalizedRoute.branchAltitudeById, {}, `Altitude défaut ${Math.round(defaultAltitudeFt)} ft`);
    setWeatherStatus('Vent à rafraîchir');
  };

  const setDepartureTimeIso = (departureTimeIso: string) => {
    const profile = { ...normalizedRoute.profile, departureTimeIso };
    rebuild(normalizedRoute.points, profile, normalizedRoute.branchAltitudeById, {}, 'Heure de départ mise à jour');
    setWeatherStatus('Vent à rafraîchir');
  };

  const setBranchAltitudeFt = (branchId: string, altitudeFt: number) => {
    if (!Number.isFinite(altitudeFt)) {
      setRouteMessage('Altitude branche invalide.');
      return;
    }
    const normalizedAltitudeFt = Math.max(500, Math.min(12500, Math.round(altitudeFt / 100) * 100));
    const nextAltitudes = { ...normalizedRoute.branchAltitudeById, [branchId]: normalizedAltitudeFt };
    const nextWinds = { ...normalizedRoute.branchWindById };
    delete nextWinds[branchId];
    rebuild(normalizedRoute.points, normalizedRoute.profile, nextAltitudes, nextWinds, `Altitude branche ${normalizedAltitudeFt} ft`);
    setWeatherStatus('Vent à rafraîchir');
  };

  const refreshWinds = async () => {
    if (normalizedRoute.branches.length === 0) {
      setWeatherStatus('Route incomplète');
      return;
    }

    setWeatherStatus('Météo-France en cours...');
    const analysisTimeIso = new Date().toISOString();

    try {
      const routeAtAnalysisTime = rebuild(
        normalizedRoute.points,
        { ...normalizedRoute.profile, departureTimeIso: analysisTimeIso },
        normalizedRoute.branchAltitudeById,
        normalizedRoute.branchWindById,
        'Analyse météo en cours'
      );

      const winds = await fetchWindAloftForRoute(routeAtAnalysisTime, analysisTimeIso);
      const next = rebuild(routeAtAnalysisTime.points, routeAtAnalysisTime.profile, routeAtAnalysisTime.branchAltitudeById, {
        ...routeAtAnalysisTime.branchWindById,
        ...winds
      }, 'Vent mis à jour');
      const loaded = Object.keys(winds).length;
      const missingBranches = next.branches.filter((branch) => !winds[branch.id]).map((branch) => branchLabel(next, branch.id));
      setWeatherStatus(
        loaded === next.branches.length
          ? `Vent OK ${loaded}/${next.branches.length}`
          : loaded > 0
            ? `Vent partiel ${loaded}/${next.branches.length} - manque ${missingBranches.slice(0, 2).join(', ')}`
            : 'Météo-France non reçu'
      );
    } catch {
      setWeatherStatus('Erreur Météo-France');
    }
  };

  const resetRoute = () => {
    setRoute(defaultRoute);
    setSelectedPointId(null);
    setRouteMessage('Nouvelle navigation vide : saisir départ et arrivée.');
    setWeatherStatus('Vent non chargé');
  };

  return {
    route: normalizedRoute,
    selectedPoint,
    selectedPointId,
    routeMessage,
    weatherStatus,
    setSelectedPointId,
    setDepartureCode,
    setDestinationCode,
    addWaypointAt,
    removePoint,
    reverseRoute,
    setTasKt,
    setDefaultAltitudeFt,
    setDepartureTimeIso,
    setBranchAltitudeFt,
    refreshWinds,
    resetRoute
  };
}
