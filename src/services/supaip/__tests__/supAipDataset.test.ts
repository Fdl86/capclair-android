import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  SUP_AIP_VERTICAL_NOTICE,
  hashSupAipBundle,
  isSupAipDatasetStale,
  parseSupAipLatest,
  validateSupAipBundle,
  validateSupAipRevisionManifest,
  verifySupAipTextPayload
} from '../supAipDataset';

const root = process.cwd();

function readText(fileName: string) {
  return fs.readFileSync(path.join(root, 'public', 'data', fileName), 'utf8');
}

function readJson(fileName: string) {
  return JSON.parse(readText(fileName)) as unknown;
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


  it('validates the immutable server pointer and the exact manifest bytes', async () => {
    const latest = parseSupAipLatest(readJson('supaip/latest.json'));
    const manifestText = readText('supaip-manifest.json');
    await expect(verifySupAipTextPayload(
      manifestText,
      latest.manifestSha256,
      latest.manifestSize,
      'manifest.json'
    )).resolves.toBeUndefined();
    expect(validateSupAipRevisionManifest(JSON.parse(manifestText), latest).datasetRevision).toBe(latest.datasetRevision);

    await expect(verifySupAipTextPayload(
      `${manifestText} `,
      latest.manifestSha256,
      latest.manifestSize,
      'manifest.json'
    )).rejects.toThrow(/Taille de manifest\.json incorrecte/);
  });

  it('uses the last successful SIA check instead of the business generation date for staleness', () => {
    const status = {
      ...(readJson('supaip-status.json') as any),
      datasetGeneratedAt: '2026-07-01T00:00:00.000Z',
      lastSuccessfulCheckAt: '2026-07-19T18:00:00.000Z',
      staleAfterHours: 36
    };
    expect(isSupAipDatasetStale(status, Date.parse('2026-07-19T20:00:00.000Z'))).toBe(false);
    status.lastSuccessfulCheckAt = '2026-07-17T00:00:00.000Z';
    expect(isSupAipDatasetStale(status, Date.parse('2026-07-19T20:00:00.000Z'))).toBe(true);
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
