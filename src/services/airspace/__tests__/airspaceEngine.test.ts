import { describe, expect, it } from 'vitest';
import type { AirspaceCatalogItem } from '../../../domain/airspace.types';
import type { NavPoint } from '../../../domain/navigation.types';
import { buildRoute } from '../../navigation/routeBuilder';
import { buildZoneProfilesFromCatalog } from '../airspaceEngine';

const departure: NavPoint = { id: 'dep', nom: 'DEP', code: 'DEP', type: 'depart', latitude: 0, longitude: 0 };
const destination: NavPoint = { id: 'arr', nom: 'ARR', code: 'ARR', type: 'destination', latitude: 0, longitude: 1 };
const catalog: AirspaceCatalogItem[] = [{
  id: 'narrow-zone',
  name: 'NARROW',
  type: 'R',
  contacts: [],
  parts: [{
    id: 'narrow-part',
    name: 'NARROW',
    floorFt: 0,
    ceilingFt: 5000,
    floorLabel: 'SFC',
    ceilingLabel: '5000 ft AMSL',
    classCode: '',
    verticalUncertain: false,
    bbox: [-0.005, 0.30, 0.005, 0.31],
    points: [[-0.005, 0.30], [-0.005, 0.31], [0.005, 0.31], [0.005, 0.30]]
  }]
}];

describe('airspace branch intersection', () => {
  it('detects a narrow zone with exact entry and exit ratios', () => {
    const route = buildRoute([departure, destination], { profile: { defaultAltitudeFt: 2500 } });
    const profile = buildZoneProfilesFromCatalog(route, catalog)[route.branches[0].id];
    expect(profile.blocks).toHaveLength(1);
    expect(profile.blocks[0].startRatio).toBeCloseTo(0.30, 6);
    expect(profile.blocks[0].endRatio).toBeCloseTo(0.31, 6);
    expect(profile.blocks[0].containsPlannedAltitude).toBe(true);
  });
});
