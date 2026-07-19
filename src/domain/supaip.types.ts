export type SupAipDisplayMode = 'off' | 'route' | 'all';

export type SupAipActivationMode = 'schedule' | 'notam' | 'windows' | 'published';

export interface SupAipActivationWindow {
  from: string;
  to: string;
}

export interface SupAipProperties {
  id: string;
  name: string;
  zoneType: string;
  supAip: string;
  title: string;
  validFrom: string;
  validTo: string;
  activationMode: SupAipActivationMode;
  activationText: string;
  activationWindowsUtc?: SupAipActivationWindow[];
  lowerLimit: string;
  upperLimit: string;
  frequency?: string;
  sourcePdf: string;
  sourcePage?: string;
  beta?: boolean;
  dataScope?: string;
  geometrySource?:
    | 'automatic'
    | 'automatic-layout-v2'
    | 'automatic-layout-v3'
    | 'automatic-text-v2'
    | 'manual-override'
    | 'previous-parser-safety-fallback'
    | 'previous-parser-partial-safety-fallback'
    | 'previous-parser-regression-fallback';
  geometryConfidence?: 'high' | 'medium';
  geometryWarnings?: string[];
  verticalLimitsExtracted?: boolean;
  verticalLimitNotice?: string | null;
  sourcePageNumber?: number | null;
  sourceFingerprint?: string;
  parserVersion?: string;
}

export type SupAipVisualStatus = 'active' | 'conditional' | 'published' | 'upcoming' | 'expired' | 'unknown';

export interface SupAipSelection extends SupAipProperties {
  visualStatus: SupAipVisualStatus;
}
