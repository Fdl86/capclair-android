import { describe, expect, it } from 'vitest';
import type { BriefingRouteSnapshot, PibRouteContext } from '../../../domain/notam.types';
import { parseNotams } from '../notamParser';

const context: PibRouteContext = {
  type: null, productionTimeIso: null, departureTimeIso: '2026-07-23T08:00:00Z', durationRaw: null,
  flightRules: 'VFR', departure: 'LFBI', destination: 'LFBI', alternates: [],
  floorFl: null, ceilingFl: null, radiusNm: null, halfCorridorNm: 15
};
const route: BriefingRouteSnapshot = {
  routeId: 'loop', routeName: 'LFBI - LFBI', departure: 'LFBI', destination: 'LFBI', alternates: [],
  departureTimeIso: context.departureTimeIso, maxAltitudeFt: 3500,
  points: [
    { id: 'dep', nom: 'LFBI', code: 'LFBI', type: 'depart', latitude: 46.58, longitude: 0.30 },
    { id: 'wp', nom: 'WP1', code: 'WP1', type: 'waypoint', latitude: 46.8, longitude: 0.8 },
    { id: 'arr', nom: 'LFBI', code: 'LFBI', type: 'destination', latitude: 46.58, longitude: 0.30 }
  ],
  signature: 'loop-signature'
};

describe('NOTAM relevance on a loop route', () => {
  it('labels the shared aerodrome as departure and arrival', () => {
    const text = `LFFF-A1234/26\nQ) LFFF/QFAAH/IV/NBO/A/000/999/4635N00018E005\nA) LFBI\nB) 2607230600\nC) 2607231800\nE) AERODROME HOURS OF SERVICE MODIFIED`;
    const notams = parseNotams(text, context, route);
    expect(notams).toHaveLength(1);
    expect(notams[0].routeRelevance).toBe('departure-destination');
  });
});
