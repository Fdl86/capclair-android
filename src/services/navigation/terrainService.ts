import type { NavRoute } from '../../domain/navigation.types';
import { apiPath } from '../../config/apiBaseUrl';

export interface TerrainSample {
  distanceRatio: number; // 0 -> 1 le long de la route
  elevationFt: number;
}

const METERS_TO_FEET = 3.28084;
const SENTINEL_METERS = -500; // l'API IGN renvoie des valeurs aberrantes (ex. -33509) près des côtes/mer
const DEFAULT_SAMPLING = 80;

const cache = new Map<string, TerrainSample[]>();

function routeSignature(route: NavRoute, sampling: number): string {
  return (
    route.points
      .map((point) => `${point.id}:${point.latitude.toFixed(4)},${point.longitude.toFixed(4)}`)
      .join('>') + `#${sampling}`
  );
}

// Valeur "pas de donnée" -> ramenée au niveau mer pour conserver un pas régulier.
function normalizeElevationMeters(meters: number): number {
  if (!Number.isFinite(meters) || meters <= SENTINEL_METERS) return 0;
  return meters;
}

export async function fetchTerrainProfile(route: NavRoute, sampling: number = DEFAULT_SAMPLING): Promise<TerrainSample[]> {
  if (route.points.length < 2) return [];

  const signature = routeSignature(route, sampling);
  const cached = cache.get(signature);
  if (cached) return cached;

  // On envoie uniquement les waypoints : c'est le paramètre sampling de l'API qui densifie le profil.
  const lon = route.points.map((point) => point.longitude).join('|');
  const lat = route.points.map((point) => point.latitude).join('|');
  const query = new URLSearchParams({ lon, lat, sampling: String(sampling) });

  try {
    const response = await fetch(apiPath(`/api/ign/elevation?${query.toString()}`));
    if (!response.ok) return [];

    const data: unknown = await response.json();
    const elevations = (data as { elevations?: unknown }).elevations;
    if (!Array.isArray(elevations) || elevations.length < 2) return [];

    const denominator = elevations.length - 1;
    const samples: TerrainSample[] = elevations.map((value, index) => ({
      distanceRatio: index / denominator,
      elevationFt: normalizeElevationMeters(typeof value === 'number' ? value : Number(value)) * METERS_TO_FEET
    }));

    cache.set(signature, samples);
    return samples;
  } catch (error) {
    return [];
  }
}
