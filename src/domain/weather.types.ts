export interface AerodromeWeather {
  icao: string;
  requestedIcao: string;
  stationIcao: string;
  stationDistanceKm: number;
  metarRaw?: string;
  tafRaw?: string;
  updatedAtIso?: string;
  source?: string;
  status: 'idle' | 'ok' | 'missing' | 'error';
}

export interface WeatherCandidate {
  icao: string;
  distanceKm: number;
}

export interface AerodromeWeatherRequestItem {
  icao: string;
  latitude: number;
  longitude: number;
  candidates: WeatherCandidate[];
}
