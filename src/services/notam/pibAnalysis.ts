import type {
  BriefingRouteSnapshot,
  PibAnalysis,
  PibAnalysisSummary,
  PibRouteContext,
  SupAipReference
} from '../../domain/notam.types';
import type { SupAipDatasetBundle } from '../supaip/supAipDataset';
import { normalizeSofiaText } from './sofiaText';
import { parsePibRouteContext } from './pibContextParser';
import { parseNotams } from './notamParser';
import { reconcileSupAipReferences } from './supAipReconciler';

function uniqueReferences(references: SupAipReference[]) {
  const byId = new Map<string, SupAipReference>();
  const priority: Record<SupAipReference['action'], number> = {
    cancelled: 8,
    replaced: 7,
    extended: 6,
    modified: 5,
    activated: 4,
    trigger: 3,
    mentioned: 2,
    ambiguous: 1
  };
  for (const reference of references) {
    const current = byId.get(reference.id);
    if (!current || priority[reference.action] > priority[current.action]) byId.set(reference.id, reference);
  }
  return [...byId.values()];
}

async function fingerprint(text: string) {
  const bytes = new TextEncoder().encode(text);
  if (globalThis.crypto?.subtle) {
    const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
  }
  let hash = 2166136261;
  for (const byte of bytes) hash = Math.imul(hash ^ byte, 16777619);
  return `fnv-${(hash >>> 0).toString(16)}`;
}

function routeDefined(route: BriefingRouteSnapshot) {
  return Boolean(route.departure && route.destination);
}

function contextRouteDefined(context: PibRouteContext) {
  return Boolean(context.departure && context.destination);
}

function routeMode(context: PibRouteContext, route: BriefingRouteSnapshot): PibAnalysis['routeContextMode'] {
  const appDefined = routeDefined(route);
  const pibDefined = contextRouteDefined(context);
  if (appDefined && pibDefined) {
    return route.departure === context.departure && route.destination === context.destination ? 'matching' : 'mismatch';
  }
  if (pibDefined) return 'detected-only';
  if (appDefined) return 'route-only';
  return 'uncontextualized';
}

function summaryFor(
  notams: PibAnalysis['notams'],
  reconciliations: PibAnalysis['reconciliations']
): PibAnalysisSummary {
  const reconciledById = new Map(reconciliations.map((item) => [item.reference.id, item]));
  const approximateCircleCount = notams.filter((notam) => {
    if (!notam.fields.q?.center || notam.exactPolygon) return false;
    const mappedSup = notam.supAipReferences.some((reference) => (reconciledById.get(reference.id)?.mappedGeometryCount ?? 0) > 0);
    const preciseObstacle = notam.eCoordinates.length > 0 && /Q(?:OB|OL)/.test(notam.fields.q?.code ?? '');
    return !mappedSup && !preciseObstacle;
  }).length;
  return {
    totalNotams: notams.length,
    supAipReferenceCount: reconciliations.length,
    supAipMatchCount: reconciliations.filter((item) => item.status !== 'absent' && item.status !== 'unmapped').length,
    supAipMissingOrIncompleteCount: reconciliations.filter((item) => ['partial', 'unmapped', 'absent'].includes(item.status)).length,
    uninterpretedCount: notams.filter((notam) => notam.interpretationStatus === 'uninterpreted' || notam.temporalStatus === 'unknown' || notam.temporalStatus === 'complex').length,
    approximateCircleCount,
    routeRelevantCount: notams.filter((notam) => ['departure', 'destination', 'departure-destination', 'alternate', 'route'].includes(notam.routeRelevance)).length,
    activeAtPlannedTimeCount: notams.filter((notam) => notam.temporalStatus === 'active').length
  };
}

export async function analyzePibText(input: {
  text: string;
  sourceKind: 'pdf' | 'text';
  sourceFileName?: string | null;
  routeSnapshot: BriefingRouteSnapshot;
  supAipBundle: SupAipDatasetBundle;
  sourceFingerprint?: string;
}): Promise<PibAnalysis> {
  const rawText = normalizeSofiaText(input.text);
  const context = parsePibRouteContext(rawText);
  const notams = parseNotams(rawText, context, input.routeSnapshot);
  if (notams.length === 0) {
    throw new Error('Aucun NOTAM structuré n’a été détecté dans ce contenu. Vérifiez qu’il s’agit bien d’un briefing SOFIA textuel.');
  }
  const references = uniqueReferences(notams.flatMap((notam) => notam.supAipReferences));
  const reconciliations = reconcileSupAipReferences(references, input.supAipBundle);
  const mode = routeMode(context, input.routeSnapshot);
  const warnings = [
    'Ce module est une aide visuelle et un contrôle croisé. Le PIB importé ne doit jamais être considéré comme exhaustif pour le vol.',
    'SOFIA, le SIA et la préparation réglementaire restent les sources de référence.'
  ];
  if (mode === 'mismatch') warnings.unshift(`Trajet différent: briefing ${context.departure} > ${context.destination}, CAP CLAIR ${input.routeSnapshot.departure} > ${input.routeSnapshot.destination}. Aucune fusion silencieuse.`);
  if (mode === 'uncontextualized') warnings.unshift('Briefing analysé sans trajet. La pertinence par rapport à la route ne peut pas être déterminée.');
  if (mode === 'detected-only') warnings.unshift('Un trajet a été détecté dans le briefing, mais aucun trajet complet n’est défini dans CAP CLAIR.');

  const sourceFingerprint = input.sourceFingerprint ?? await fingerprint(rawText);
  return {
    schemaVersion: 1,
    id: `pib-${sourceFingerprint.slice(0, 16)}`,
    importedAtIso: new Date().toISOString(),
    sourceKind: input.sourceKind,
    sourceFileName: input.sourceFileName ?? null,
    sourceFingerprint,
    rawText,
    context,
    routeSnapshot: input.routeSnapshot,
    routeContextMode: mode,
    notams,
    reconciliations,
    summary: summaryFor(notams, reconciliations),
    warnings,
    supAipDatasetRevision: input.supAipBundle.status.datasetRevision ?? null
  };
}
