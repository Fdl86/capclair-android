import type { SupAipReconciliation, SupAipReference, SupAipReconciliationStatus } from '../../domain/notam.types';
import type {
  SupAipDatasetBundle,
  SupAipManifestPublication,
  SupAipUnmappedPublication
} from '../supaip/supAipDataset';

interface SupAipIndexes {
  manifest: Map<string, SupAipManifestPublication>;
  unmapped: Map<string, SupAipUnmappedPublication>;
  featureCounts: Map<string, number>;
}

function normalize(value: string) {
  const match = value.match(/0*(\d{1,3})\s*\/\s*(\d{2})/);
  return match ? `${String(Number(match[1])).padStart(3, '0')}/${match[2]}` : value.trim();
}

export function createSupAipIndexes(bundle: SupAipDatasetBundle): SupAipIndexes {
  const manifest = new Map<string, SupAipManifestPublication>();
  const unmapped = new Map<string, SupAipUnmappedPublication>();
  const featureCounts = new Map<string, number>();
  for (const publication of bundle.manifest.publications) manifest.set(normalize(publication.supAip), publication);
  for (const publication of bundle.unmapped.publications) unmapped.set(normalize(publication.supAip), publication);
  for (const feature of bundle.geoJson.features) {
    const ref = normalize(String(feature.properties.supAip ?? ''));
    if (ref) featureCounts.set(ref, (featureCounts.get(ref) ?? 0) + 1);
  }
  return { manifest, unmapped, featureCounts };
}

function statusFor(
  publication: SupAipManifestPublication | undefined,
  detail: SupAipUnmappedPublication | undefined,
  count: number
): SupAipReconciliationStatus {
  if (!publication && !detail && count === 0) return 'absent';
  if (detail?.partial || detail?.status === 'partial') return count > 0 ? 'partial' : 'unmapped';
  if (detail?.conservative || detail?.status === 'conservative') return 'conservative';
  if (detail?.fallback || detail?.status === 'fallback') return 'fallback';
  if (count === 0) return 'unmapped';
  return 'mapped';
}

function missingNames(reason: string | undefined) {
  if (!reason) return [];
  return [...reason.matchAll(/(?:ZRT|ZDT|ZRT\/ZDT)\s+([^:.;]+):\s*limites latérales non extraites/gi)]
    .map((match) => match[0].split(':')[0].trim());
}

function warningFor(status: SupAipReconciliationStatus, detail: SupAipUnmappedPublication | undefined) {
  const reason = detail?.reason?.trim();
  if (status === 'partial') return `SUP AIP signalé dans le briefing mais partiellement cartographié dans CAP CLAIR.${reason ? ` ${reason}` : ''}`;
  if (status === 'unmapped') return `SUP AIP signalé dans le briefing mais non cartographié dans CAP CLAIR.${reason ? ` ${reason}` : ''}`;
  if (status === 'absent') return 'SUP AIP signalé dans le briefing mais absent de la base CAP CLAIR.';
  if (status === 'conservative') return `SUP AIP présent dans CAP CLAIR, affiché avec prudence.${reason ? ` ${reason}` : ''}`;
  if (status === 'fallback') return `SUP AIP présent dans CAP CLAIR avec une géométrie de repli.${reason ? ` ${reason}` : ''}`;
  return reason ?? null;
}

export function reconcileSupAipReferences(
  references: SupAipReference[],
  bundle: SupAipDatasetBundle
): SupAipReconciliation[] {
  const indexes = createSupAipIndexes(bundle);
  return references.map((reference) => {
    const id = normalize(reference.id);
    const publication = indexes.manifest.get(id);
    const detail = indexes.unmapped.get(id);
    const count = indexes.featureCounts.get(id) ?? publication?.mappedGeometryCount ?? detail?.mappedGeometryCount ?? 0;
    const status = statusFor(publication, detail, count);
    return {
      reference: { ...reference, id },
      status,
      title: detail?.title ?? publication?.title ?? null,
      sourcePdf: detail?.sourcePdf ?? publication?.sourcePdf ?? null,
      validFrom: detail?.validFrom ?? null,
      validTo: detail?.validTo ?? null,
      mappedGeometryCount: count,
      expectedGeometryCount: detail?.expectedNamedGeometryCount ?? publication?.expectedNamedGeometryCount ?? null,
      missingGeometryNames: missingNames(detail?.reason),
      warning: warningFor(status, detail)
    };
  });
}
