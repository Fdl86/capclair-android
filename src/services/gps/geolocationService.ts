import type { AircraftProfile } from '../../domain/aircraft.types';
import type { GpsPosition } from '../../domain/gps.types';
import { distanceNm } from '../geo/distance';

// Au-delà de cette incertitude horizontale, un fix est trop dégradé pour être
// fiable. Il ne doit alimenter ni les instruments live, ni la trace.
export const MAX_PLAUSIBLE_PRECISION_M = 150;

// Au-delà de ce seuil, la position reste plausible mais le signal est affiché
// comme dégradé pour le pilote.
export const DEGRADED_PRECISION_M = 75;

// Altitude GPS affichée/exportée comme élévation uniquement si l'incertitude
// verticale est connue et raisonnable. L'altitude brute reste exportée en
// extension GPX pour le debug.
export const MAX_RELIABLE_ALTITUDE_ACCURACY_M = 100;

// Seuil par défaut volontairement plus strict que l'ancien 220 kt. Le seuil
// réel est calculé selon le profil avion quand il est disponible.
export const DEFAULT_MAX_TRACE_SPEED_KT = 160;

export function toGpsPosition(position: GeolocationPosition): GpsPosition {
  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    altitude: position.coords.altitude,
    altitudeAccuracy: position.coords.altitudeAccuracy,
    vitesse: position.coords.speed === null ? null : position.coords.speed * 1.94384,
    track: position.coords.heading,
    timestamp: position.timestamp,
    precision: position.coords.accuracy
  };
}

export function isPlausibleGpsPosition(position: GpsPosition): boolean {
  if (!Number.isFinite(position.latitude) || !Number.isFinite(position.longitude)) return false;
  if (position.latitude < -90 || position.latitude > 90) return false;
  if (position.longitude < -180 || position.longitude > 180) return false;
  if (position.precision !== null && position.precision > MAX_PLAUSIBLE_PRECISION_M) return false;
  return true;
}

export function isDegradedGpsPosition(position: GpsPosition): boolean {
  if (position.precision === null) return true;
  return position.precision > DEGRADED_PRECISION_M;
}

export function isReliableGpsAltitude(position: GpsPosition): boolean {
  return position.altitude !== null
    && position.altitudeAccuracy !== null
    && Number.isFinite(position.altitudeAccuracy)
    && position.altitudeAccuracy <= MAX_RELIABLE_ALTITUDE_ACCURACY_M;
}

export function getMaxTraceSpeedKtForAircraft(aircraft?: Pick<AircraftProfile, 'id' | 'model' | 'label' | 'cruiseTasKt'>): number {
  if (!aircraft) return DEFAULT_MAX_TRACE_SPEED_KT;

  const signature = `${aircraft.id} ${aircraft.model} ${aircraft.label}`.toLowerCase();
  if (signature.includes('c150') || signature.includes('cessna 150')) return 145;
  if (signature.includes('evektor') || signature.includes('sportstar')) return 160;

  const cruiseBasedLimit = Math.round(aircraft.cruiseTasKt * 1.55);
  return Math.min(180, Math.max(140, cruiseBasedLimit));
}

// Point quasi identique au précédent échantillon de trace, trop rapproché
// dans le temps : redondant, sans valeur ajoutée pour le tracé.
export function isRedundantTracePoint(position: GpsPosition, previous: GpsPosition | null): boolean {
  if (!previous) return false;
  const elapsedMs = position.timestamp - previous.timestamp;
  const deltaLat = Math.abs(position.latitude - previous.latitude);
  const deltaLon = Math.abs(position.longitude - previous.longitude);
  return elapsedMs < 2500 && deltaLat < 0.00008 && deltaLon < 0.00008;
}

function impliedSpeedKt(a: GpsPosition, b: GpsPosition): number | null {
  const elapsedHours = (b.timestamp - a.timestamp) / 3_600_000;
  if (elapsedHours <= 0) return null;
  return distanceNm(a, b) / elapsedHours;
}

export function isSpeedPlausible(
  position: GpsPosition,
  previous: GpsPosition | null,
  maxSpeedKt: number = DEFAULT_MAX_TRACE_SPEED_KT
): boolean {
  if (!previous) return true;
  const speedKt = impliedSpeedKt(previous, position);
  return speedKt === null || speedKt <= maxSpeedKt;
}

export type GpsRejectionReason = 'precision' | 'redundant' | 'speed';

export function classifyGpsPosition(
  position: GpsPosition,
  previous: GpsPosition | null,
  maxSpeedKt: number = DEFAULT_MAX_TRACE_SPEED_KT
): GpsRejectionReason | null {
  if (!isPlausibleGpsPosition(position)) return 'precision';
  if (isRedundantTracePoint(position, previous)) return 'redundant';
  if (!isSpeedPlausible(position, previous, maxSpeedKt)) return 'speed';
  return null;
}

export function isUsableGpsPosition(position: GpsPosition, previous: GpsPosition | null): boolean {
  return classifyGpsPosition(position, previous) === null;
}
