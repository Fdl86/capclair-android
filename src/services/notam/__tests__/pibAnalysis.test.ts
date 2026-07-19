import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { BriefingRouteSnapshot } from '../../../domain/notam.types';
import { analyzePibText } from '../pibAnalysis';
import { hashSupAipBundle, validateSupAipBundle, type SupAipDatasetBundle } from '../../supaip/supAipDataset';

const root = process.cwd();

function readJson(fileName: string) {
  return JSON.parse(fs.readFileSync(path.join(root, 'public', 'data', fileName), 'utf8')) as unknown;
}

async function bundle(): Promise<SupAipDatasetBundle> {
  const validated = validateSupAipBundle({
    status: readJson('supaip-status.json'),
    manifest: readJson('supaip-manifest.json'),
    unmapped: readJson('supaip-unmapped.json'),
    geoJson: readJson('supaip-current.geojson')
  });
  return {
    ...validated,
    source: 'embedded',
    activatedAtIso: '2026-07-19T00:00:00.000Z',
    integrityHash: await hashSupAipBundle(validated)
  };
}

const routeSnapshot: BriefingRouteSnapshot = {
  routeId: 'test-lfbi-lfou',
  routeName: 'LFBI - LFOU',
  departure: 'LFBI',
  destination: 'LFOU',
  alternates: [],
  departureTimeIso: '2026-07-16T10:00:00.000Z',
  maxAltitudeFt: 5500,
  points: [
    { id: 'lfbi', nom: 'Poitiers', code: 'LFBI', type: 'depart', latitude: 46.5877, longitude: 0.3067 },
    { id: 'lfou', nom: 'Cholet', code: 'LFOU', type: 'destination', latitude: 47.0821, longitude: -0.8771 }
  ],
  signature: 'test-lfbi-lfou'
};

describe('PIB SOFIA Android analysis', () => {
  it('parses the real LFBI-LFOU fixture and reconciles its SUP AIP references locally', async () => {
    const text = fs.readFileSync(path.join(root, 'src', 'services', 'notam', '__fixtures__', 'sofia-lfbi-lfou.txt'), 'utf8');
    const activeBundle = await bundle();
    const analysis = await analyzePibText({
      text,
      sourceKind: 'text',
      sourceFileName: null,
      routeSnapshot,
      supAipBundle: activeBundle
    });
    expect(analysis.summary.totalNotams).toBe(36);
    expect(analysis.summary.supAipReferenceCount).toBe(3);
    expect(analysis.notams).toHaveLength(36);
    expect(analysis.reconciliations).toHaveLength(3);
    expect(analysis.supAipDatasetRevision).toBe(activeBundle.status.datasetRevision);
  });
});
