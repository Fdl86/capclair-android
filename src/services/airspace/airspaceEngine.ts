import type { AirspaceCatalogItem, AirspacePart, AirspaceType, BranchZoneBlock, BranchZoneProfile } from '../../domain/airspace.types';
import type { NavBranch, NavPoint, NavRoute } from '../../domain/navigation.types';

const SAMPLE_STEPS = 16;
const ROUTE_BBOX_MARGIN = 0.08;

const TYPE_PRIORITY: Record<AirspaceType, number> = {
  CTR: 100,
  TMA: 92,
  CTA: 84,
  RMZ: 78,
  TMZ: 76,
  R: 72,
  D: 70,
  P: 68,
  SIV: 42
};

function pointById(points: NavPoint[], id: string): NavPoint | null {
  return points.find((point) => point.id === id) ?? null;
}

function branchPoint(from: NavPoint, to: NavPoint, ratio: number) {
  return {
    latitude: from.latitude + (to.latitude - from.latitude) * ratio,
    longitude: from.longitude + (to.longitude - from.longitude) * ratio
  };
}

function bboxIntersects(a: [number, number, number, number], b: [number, number, number, number]): boolean {
  return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
}

function buildBranchBbox(from: NavPoint, to: NavPoint): [number, number, number, number] {
  return [
    Math.min(from.latitude, to.latitude) - ROUTE_BBOX_MARGIN,
    Math.min(from.longitude, to.longitude) - ROUTE_BBOX_MARGIN,
    Math.max(from.latitude, to.latitude) + ROUTE_BBOX_MARGIN,
    Math.max(from.longitude, to.longitude) + ROUTE_BBOX_MARGIN
  ];
}

function pointInPolygon(latitude: number, longitude: number, polygon: Array<[number, number]>): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const yi = polygon[i][0];
    const xi = polygon[i][1];
    const yj = polygon[j][0];
    const xj = polygon[j][1];
    const intersects = ((yi > latitude) !== (yj > latitude)) &&
      longitude < ((xj - xi) * (latitude - yi)) / ((yj - yi) || 1e-9) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function altitudeRelation(altitudeFt: number, part: AirspacePart): BranchZoneBlock['altitudeRelation'] {
  if (part.verticalUncertain) return 'uncertain';
  if (altitudeFt < part.floorFt) return 'below';
  if (altitudeFt > part.ceilingFt) return 'above';
  return 'inside';
}

function blockPriority(zone: AirspaceCatalogItem, part: AirspacePart, containsAltitude: boolean): number {
  let value = TYPE_PRIORITY[zone.type] ?? 10;
  if (containsAltitude) value += 100;
  if (part.verticalUncertain) value -= 15;
  if (zone.contacts.length) value += 8;
  return value;
}

function zoneLabel(block?: BranchZoneBlock): string {
  if (!block) return 'À confirmer';
  const classLabel = block.classCode ? ` ${block.classCode}` : '';
  return `${block.zoneType} ${block.zoneName}${classLabel}`;
}

function frequencyLabel(block?: BranchZoneBlock): string {
  if (!block?.contact?.frequency) return 'À confirmer';
  return block.contact.frequency;
}

function uniqueBlocks(blocks: BranchZoneBlock[]): BranchZoneBlock[] {
  const bestByKey = new Map<string, BranchZoneBlock>();
  for (const block of blocks) {
    const key = `${block.zoneId}:${block.floorFt}:${block.ceilingFt}:${block.startRatio.toFixed(2)}:${block.endRatio.toFixed(2)}`;
    const current = bestByKey.get(key);
    if (!current || block.priority > current.priority) bestByKey.set(key, block);
  }
  return [...bestByKey.values()];
}

function buildBlocksForBranch(route: NavRoute, branch: NavBranch, catalog: AirspaceCatalogItem[]): BranchZoneBlock[] {
  const from = pointById(route.points, branch.from);
  const to = pointById(route.points, branch.to);
  if (!from || !to) return [];

  const routeBbox = buildBranchBbox(from, to);
  const samples = Array.from({ length: SAMPLE_STEPS + 1 }, (_, index) => {
    const ratio = index / SAMPLE_STEPS;
    const point = branchPoint(from, to, ratio);
    return { ratio, ...point };
  });

  const blocks: BranchZoneBlock[] = [];

  for (const zone of catalog) {
    for (const part of zone.parts) {
      if (!bboxIntersects(routeBbox, part.bbox)) continue;

      const hitRatios = samples
        .filter((sample) => pointInPolygon(sample.latitude, sample.longitude, part.points))
        .map((sample) => sample.ratio);

      if (!hitRatios.length) continue;

      const relation = altitudeRelation(branch.altitudeFt, part);
      const containsPlannedAltitude = relation === 'inside' || relation === 'uncertain';
      const startRatio = Math.max(0, Math.min(...hitRatios) - 1 / SAMPLE_STEPS);
      const endRatio = Math.min(1, Math.max(...hitRatios) + 1 / SAMPLE_STEPS);
      const contact = zone.contacts[0];
      const status: BranchZoneBlock['status'] = containsPlannedAltitude
        ? relation === 'uncertain' ? 'confirm' : 'activeAltitude'
        : 'crossedOutAltitude';

      blocks.push({
        id: `${branch.id}:${zone.id}:${part.id}`,
        zoneId: zone.id,
        zoneName: zone.name,
        zoneType: zone.type,
        classCode: part.classCode,
        floorFt: part.floorFt,
        ceilingFt: part.ceilingFt,
        floorLabel: part.floorLabel,
        ceilingLabel: part.ceilingLabel,
        verticalUncertain: part.verticalUncertain,
        startRatio,
        endRatio,
        containsPlannedAltitude,
        altitudeRelation: relation,
        contact,
        priority: blockPriority(zone, part, containsPlannedAltitude),
        status
      });
    }
  }

  return uniqueBlocks(blocks).sort((a, b) => b.priority - a.priority || a.floorFt - b.floorFt);
}

export function buildZoneProfilesFromCatalog(route: NavRoute, catalog: AirspaceCatalogItem[]): Record<string, BranchZoneProfile> {
  const profiles: Record<string, BranchZoneProfile> = {};

  for (const branch of route.branches) {
    const blocks = buildBlocksForBranch(route, branch, catalog);
    const activeBlocks = blocks.filter((block) => block.containsPlannedAltitude);
    const primaryBlock = activeBlocks[0] ?? blocks[0];
    const secondaryBlocks = activeBlocks.filter((block) => block.id !== primaryBlock?.id).slice(0, 3);

    profiles[branch.id] = {
      branchId: branch.id,
      plannedAltitudeFt: branch.altitudeFt,
      blocks: blocks.slice(0, 18),
      activeBlocks,
      primaryBlock,
      secondaryBlocks,
      label: zoneLabel(primaryBlock),
      frequencyLabel: frequencyLabel(primaryBlock),
      caution: blocks.some((block) => block.verticalUncertain) || !primaryBlock || secondaryBlocks.length > 0
    };
  }

  return profiles;
}


export async function buildZoneProfiles(route: NavRoute): Promise<Record<string, BranchZoneProfile>> {
  const module = await import('../../data/airspaceCatalog');
  return buildZoneProfilesFromCatalog(route, module.AIRSPACE_CATALOG);
}
