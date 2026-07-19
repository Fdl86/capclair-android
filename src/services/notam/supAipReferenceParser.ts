import type { SupAipAction, SupAipReference } from '../../domain/notam.types';

const SUP_REFERENCE = /(?:SUP\s*AIP(?:\s*AIRAC)?(?:\s*(?:NR|N[°O]))?|AIP\s*SUP|SUP)\s*[:#-]?\s*0*(\d{1,3})\s*\/\s*(\d{2})/gi;

function actionForContext(context: string): SupAipAction {
  const normalized = context.toUpperCase();
  if (/ANNUL|FIN ANTICIPEE|FIN ANTICIPÉE/.test(normalized)) return 'cancelled';
  if (/PROLONG/.test(normalized)) return 'extended';
  if (/REMPLAC/.test(normalized)) return 'replaced';
  if (/MODIFI/.test(normalized)) return 'modified';
  if (/ACTIV/.test(normalized)) return 'activated';
  if (/TRIGGER/.test(normalized)) return 'trigger';
  return 'mentioned';
}

export function extractSupAipReferences(text: string): SupAipReference[] {
  const references: SupAipReference[] = [];
  const seen = new Set<string>();
  for (const match of text.matchAll(SUP_REFERENCE)) {
    const id = `${String(Number(match[1])).padStart(3, '0')}/${match[2]}`;
    const context = text.slice(Math.max(0, (match.index ?? 0) - 80), Math.min(text.length, (match.index ?? 0) + match[0].length + 100));
    const key = `${id}:${actionForContext(context)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    references.push({
      id,
      raw: match[0],
      action: actionForContext(context),
      confidence: 'confirmed'
    });
  }
  return references;
}
