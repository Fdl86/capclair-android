import { describe, expect, it } from 'vitest';
import type { NavPoint } from '../../../domain/navigation.types';
import type { SupAipDatasetBundle } from '../supAipDataset';
import { buildSupAipPublicationCatalog } from '../supAipCatalog';

const route: NavPoint[] = [
  { id: 'dep', nom: 'DEP', code: 'DEP', type: 'depart', latitude: 0, longitude: 0 },
  { id: 'arr', nom: 'ARR', code: 'ARR', type: 'destination', latitude: 0, longitude: 1 }
];

const bundle = {
  manifest: {
    publications: [{
      supAip: '001/26', title: 'Zone au milieu de la branche', spatial: true,
      mappedGeometryCount: 1, expectedNamedGeometryCount: 1, declaredZoneCount: 1,
      missingVerticalCount: 0, status: 'complete', partial: false,
      conservative: false, fallback: false, sourcePdf: 'https://example.test/sup.pdf'
    }]
  },
  unmapped: { publications: [] },
  geoJson: {
    features: [{
      type: 'Feature',
      properties: {
        id: 'zone-mid', name: 'ZONE MID', zoneType: 'ZRT', supAip: '001/26',
        title: 'Zone au milieu de la branche', validFrom: '2026-07-01T00:00:00Z',
        validTo: '2026-08-01T00:00:00Z', activationMode: 'published', activationText: 'Publié',
        lowerLimit: 'SFC', upperLimit: 'FL 095', sourcePdf: 'https://example.test/sup.pdf',
        verticalLimitsExtracted: true
      },
      geometry: {
        type: 'Polygon',
        coordinates: [[[0.49, -0.01], [0.51, -0.01], [0.51, 0.01], [0.49, 0.01], [0.49, -0.01]]]
      }
    }]
  }
} as unknown as SupAipDatasetBundle;

describe('SUP AIP route relevance', () => {
  it('uses the complete route segment instead of only route endpoints', () => {
    const publication = buildSupAipPublicationCatalog(bundle, route, null, 25)[0];
    expect(publication.routeDistanceNm).toBe(0);
    expect(publication.routeRelevant).toBe(true);
  });
});
