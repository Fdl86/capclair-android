export interface GpsPosition {
  latitude: number;
  longitude: number;
  altitude: number | null;
  altitudeAccuracy: number | null;
  vitesse: number | null;
  track: number | null;
  timestamp: number;
  precision: number | null;
}

export type GpsStatus =
  | 'idle'
  | 'requesting'
  | 'active'
  | 'degraded'
  | 'frozen'
  | 'denied'
  | 'unavailable'
  | 'simulating'
  | 'simulation-complete'
  | 'saving'
  | 'save-error'
  | 'stopped'
  | 'stopped-no-trace';

export interface GpsTraceDiagnostics {
  rawReceived: number;
  rejectedPrecision: number;
  rejectedRedundant: number;
  rejectedSpeed: number;
  rejectedDrift: number;
  forcedResync: number;
  tracePoints: number;
  gpsGaps: number;
  gpsResumptions: number;
  missingAltitude: number;
  unreliableAltitude: number;
  maxTraceSpeedKt: number;
}
