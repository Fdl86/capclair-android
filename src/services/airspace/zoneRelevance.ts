import type { BranchZoneBlock } from '../../domain/airspace.types';
import type { ProfilePoint } from '../navigation/verticalProfileService';
import type { TerrainSample } from '../navigation/terrainService';

// Référentiels de planchers/plafonds dans le catalogue :
//  - "SFC"        -> surface : AMSL = terrain
//  - "x ft ASFC"  -> AGL     : AMSL = terrain + x (floorFt stocke x)
//  - "x ft AMSL"  -> absolu  : AMSL = floorFt
//  - "FLxxx"      -> absolu  : AMSL = floorFt (= xx00)
export type AltitudeRef = 'SFC' | 'ASFC' | 'AMSL';

export interface ZoneRelevance {
  penetrated: boolean;
  relation: 'penetrated' | 'below' | 'above' | 'near';
  minVerticalFt: number;
}

export interface ZoneRelevanceOptions {
  proximityFt: number; // marge pour classer "near" (zone frôlée)
  samples: number; // nombre de points testés sur l'emprise du bloc
}

export const DEFAULT_RELEVANCE_OPTIONS: ZoneRelevanceOptions = {
  proximityFt: 500,
  samples: 6
};

// Zones réglementées : toujours visibles pour la sécurité, même non pénétrées.
// On garde R (réglementée), P (interdite) et D (danger) : masquer une P ou une D
// qu'on longe serait un piège de sécurité, même si seule la R a été demandée.
const REGULATED_TYPES = new Set(['R', 'P', 'D']);

export function isRegulatedZone(zoneType: string): boolean {
  return REGULATED_TYPES.has(zoneType.toUpperCase());
}

function referenceFromLabel(label: string): AltitudeRef {
  const upper = label.toUpperCase();
  if (upper.includes('ASFC')) return 'ASFC'; // tester ASFC avant SFC (sous-chaîne)
  if (upper.includes('SFC')) return 'SFC';
  return 'AMSL';
}

function resolveAmsl(valueFt: number, label: string, terrainFt: number): number {
  switch (referenceFromLabel(label)) {
    case 'SFC':
      return terrainFt;
    case 'ASFC':
      return terrainFt + valueFt;
    default:
      return valueFt;
  }
}

function interpolate(ratio: number, points: { ratio: number; value: number }[]): number {
  if (points.length === 0) return 0;
  if (ratio <= points[0].ratio) return points[0].value;
  const last = points[points.length - 1];
  if (ratio >= last.ratio) return last.value;
  for (let i = 1; i < points.length; i += 1) {
    if (ratio <= points[i].ratio) {
      const prev = points[i - 1];
      const next = points[i];
      const span = next.ratio - prev.ratio || 1;
      const t = (ratio - prev.ratio) / span;
      return prev.value + (next.value - prev.value) * t;
    }
  }
  return last.value;
}

export function classifyBlock(
  block: Pick<BranchZoneBlock, 'floorFt' | 'ceilingFt' | 'floorLabel' | 'ceilingLabel'> & { globalStart: number; globalEnd: number },
  profile: ProfilePoint[],
  terrain: TerrainSample[],
  options: ZoneRelevanceOptions = DEFAULT_RELEVANCE_OPTIONS
): ZoneRelevance {
  const profilePoints = profile.map((point) => ({ ratio: point.distanceRatio, value: point.altitudeFt }));
  const terrainPoints = terrain.map((sample) => ({ ratio: sample.distanceRatio, value: sample.elevationFt }));

  const start = Math.min(block.globalStart, block.globalEnd);
  const end = Math.max(block.globalStart, block.globalEnd);
  const count = Math.max(2, options.samples);

  let penetrated = false;
  let minVertical = Number.POSITIVE_INFINITY;
  let signedAtMin = 0; // >0 : profil au-dessus du plafond (zone en dessous) ; <0 : profil sous le plancher (zone au-dessus)

  for (let i = 0; i < count; i += 1) {
    const ratio = start + ((end - start) * i) / (count - 1);
    const profileAlt = interpolate(ratio, profilePoints);
    const terrainFt = interpolate(ratio, terrainPoints);
    const floorAmsl = resolveAmsl(block.floorFt, block.floorLabel, terrainFt);
    const ceilingAmsl = resolveAmsl(block.ceilingFt, block.ceilingLabel, terrainFt);

    if (profileAlt >= floorAmsl && profileAlt <= ceilingAmsl) {
      penetrated = true;
      minVertical = 0;
      signedAtMin = 0;
      continue;
    }
    const distanceToFloor = floorAmsl - profileAlt; // >0 : sous le plancher
    const distanceToCeiling = profileAlt - ceilingAmsl; // >0 : au-dessus du plafond
    if (distanceToCeiling > 0 && distanceToCeiling < minVertical) {
      minVertical = distanceToCeiling;
      signedAtMin = 1;
    }
    if (distanceToFloor > 0 && distanceToFloor < minVertical) {
      minVertical = distanceToFloor;
      signedAtMin = -1;
    }
  }

  if (penetrated) return { penetrated: true, relation: 'penetrated', minVerticalFt: 0 };
  if (minVertical <= options.proximityFt) return { penetrated: false, relation: 'near', minVerticalFt: minVertical };
  return {
    penetrated: false,
    relation: signedAtMin >= 0 ? 'below' : 'above',
    minVerticalFt: Number.isFinite(minVertical) ? minVertical : 0
  };
}
