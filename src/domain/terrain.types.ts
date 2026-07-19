export type TerrainProfileSource = 'open-meteo-copernicus-glo90';

export interface TerrainProfilePoint {
  distanceNm: number;
  elevationFt: number;
  latitude: number;
  longitude: number;
}

export interface TerrainProfileData {
  schemaVersion: 1;
  traceId: string;
  fingerprint: string;
  generatedAt: string;
  source: TerrainProfileSource;
  resolutionM: 90;
  points: TerrainProfilePoint[];
}

export type TerrainProfilePhase =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'offline'
  | 'error'
  | 'unavailable';
