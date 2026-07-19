import type { SupAipProperties, SupAipVisualStatus } from '../../domain/supaip.types';

function safeTimestamp(value: string | undefined): number | null {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function getSupAipVisualStatus(properties: Partial<SupAipProperties>, now = new Date()): SupAipVisualStatus {
  const nowMs = now.getTime();
  const validFrom = safeTimestamp(properties.validFrom);
  const validTo = safeTimestamp(properties.validTo);

  if (validFrom === null || validTo === null || !Number.isFinite(nowMs)) return 'unknown';
  if (nowMs < validFrom) return 'upcoming';
  if (nowMs > validTo) return 'expired';

  if (properties.activationMode === 'notam') return 'conditional';

  if (properties.activationMode === 'windows') {
    const windows = properties.activationWindowsUtc ?? [];
    const isActiveWindow = windows.some((window) => {
      const from = safeTimestamp(window.from);
      const to = safeTimestamp(window.to);
      return from !== null && to !== null && nowMs >= from && nowMs <= to;
    });
    return isActiveWindow ? 'active' : 'published';
  }

  return 'published';
}

export function supAipStatusLabel(status: SupAipVisualStatus): string {
  switch (status) {
    case 'active': return 'Créneau publié en cours';
    case 'conditional': return 'Activation à confirmer';
    case 'published': return 'Publication en vigueur';
    case 'upcoming': return 'À venir';
    case 'expired': return 'Publication expirée';
    default: return 'Statut à vérifier';
  }
}

export function formatSupAipDateRange(validFrom: string, validTo: string): string {
  const from = new Date(validFrom);
  const to = new Date(validTo);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return 'Dates à vérifier dans le PDF officiel';

  const formatter = new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC'
  });
  return `Du ${formatter.format(from)} au ${formatter.format(to)}`;
}
