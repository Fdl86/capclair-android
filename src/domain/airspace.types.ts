export type AirspaceType = 'CTR' | 'TMA' | 'CTA' | 'SIV' | 'RMZ' | 'TMZ' | 'R' | 'D' | 'P';

export interface AirspaceContact {
  service: string;
  callsign: string;
  frequency: string;
}

export interface AirspacePart {
  id: string;
  name: string;
  floorFt: number;
  ceilingFt: number;
  floorLabel: string;
  ceilingLabel: string;
  classCode: string;
  verticalUncertain: boolean;
  bbox: [number, number, number, number];
  points: Array<[number, number]>;
}

export interface AirspaceCatalogItem {
  id: string;
  name: string;
  type: AirspaceType;
  contacts: AirspaceContact[];
  parts: AirspacePart[];
}

export interface BranchZoneBlock {
  id: string;
  zoneId: string;
  zoneName: string;
  zoneType: AirspaceType;
  classCode: string;
  floorFt: number;
  ceilingFt: number;
  floorLabel: string;
  ceilingLabel: string;
  verticalUncertain: boolean;
  startRatio: number;
  endRatio: number;
  containsPlannedAltitude: boolean;
  altitudeRelation: 'inside' | 'below' | 'above' | 'uncertain';
  contact?: AirspaceContact;
  priority: number;
  status: 'activeAltitude' | 'crossedOutAltitude' | 'confirm';
}

export interface BranchZoneProfile {
  branchId: string;
  plannedAltitudeFt: number;
  blocks: BranchZoneBlock[];
  activeBlocks: BranchZoneBlock[];
  primaryBlock?: BranchZoneBlock;
  secondaryBlocks: BranchZoneBlock[];
  label: string;
  frequencyLabel: string;
  caution: boolean;
}
