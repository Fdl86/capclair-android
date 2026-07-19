import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  SUP_AIP_VERTICAL_NOTICE,
  hashSupAipBundle,
  validateSupAipBundle
} from '../supAipDataset';

const root = process.cwd();

function readJson(fileName: string) {
  return JSON.parse(fs.readFileSync(path.join(root, 'public', 'data', fileName), 'utf8')) as unknown;
}

function embeddedInput() {
  return {
    status: readJson('supaip-status.json'),
    manifest: readJson('supaip-manifest.json'),
    unmapped: readJson('supaip-unmapped.json'),
    geoJson: readJson('supaip-current.geojson')
  };
}

describe('SUP AIP Android dataset safety contract', () => {
  it('validates the complete embedded fallback and its vertical limits', async () => {
    const bundle = validateSupAipBundle(embeddedInput());
    expect(bundle.status.listingPublicationCount).toBe(107);
    expect(bundle.geoJson.features).toHaveLength(404);
    expect(bundle.geoJson.features.filter((feature) => feature.properties.verticalLimitsExtracted === false)).toHaveLength(2);
    expect(bundle.geoJson.features.filter((feature) => feature.properties.verticalLimitNotice === SUP_AIP_VERTICAL_NOTICE)).toHaveLength(2);
    expect(await hashSupAipBundle(bundle)).toMatch(/^(?:[a-f0-9]{64}|fnv-[a-f0-9]+)$/);
  });

  it('rejects a cross-file revision mismatch before activation', () => {
    const input = embeddedInput() as any;
    input.manifest.datasetRevision = 'tampered';
    expect(() => validateSupAipBundle(input)).toThrow(/Révisions SUP AIP incohérentes/);
  });

  it('rejects forbidden vertical wording and an invalid missing-limit notice', () => {
    const first = embeddedInput() as any;
    first.geoJson.features[0].properties.lowerLimit = 'À vérifier';
    expect(() => validateSupAipBundle(first)).toThrow(/Limites verticales interdites/);

    const second = embeddedInput() as any;
    const missing = second.geoJson.features.find((feature: any) => feature.properties.verticalLimitsExtracted === false);
    missing.properties.verticalLimitNotice = 'À vérifier - À vérifier';
    expect(() => validateSupAipBundle(second)).toThrow(/Message de limites verticales invalide/);
  });

  it('keeps all SUP AIP map features independent of altitude filters', () => {
    const source = fs.readFileSync(path.join(root, 'src', 'components', 'briefing', 'BriefingMap.tsx'), 'utf8');
    expect(source).toContain('supSourceRef.current.addFeatures(supFeatures)');
    expect(source).not.toContain('maxDisplayFlightLevel');
    expect(source).not.toContain('applySupAipVisibility');
    expect(source).not.toContain("mode === 'off'");
  });
});
