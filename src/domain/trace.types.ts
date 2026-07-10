import type { GpsPosition, GpsTraceDiagnostics } from './gps.types';

export type TraceSource = 'android-native' | 'web' | 'simulation' | 'legacy';

export interface Trace {
  schemaVersion?: number;
  id: string;
  sessionId?: string | null;
  routeId: string;
  routeName: string;
  date: string;
  startedAt?: string;
  endedAt?: string;
  source?: TraceSource;
  positions: GpsPosition[];
  dureeSec: number;
  distanceNm: number;
  diagnostics?: GpsTraceDiagnostics;
}
