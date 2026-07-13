import type { NavLogExportSnapshot } from './navLogExport.types';

function asciiSlug(value: string, fallback: string): string {
  const safe = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-_.]+|[-_.]+$/g, '')
    .slice(0, 32);
  return safe || fallback;
}

function safeIsoDate(value: string | null): string {
  if (value) {
    const direct = value.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
    if (direct) return direct;
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10);
  }
  return 'DATE-INCONNUE';
}

export function navLogFileName(snapshot: NavLogExportSnapshot): string {
  const departure = asciiSlug(snapshot.departure.code, 'DEPART');
  const destination = asciiSlug(snapshot.destination.code, 'ARRIVEE');
  const route = departure === 'DEPART' && destination === 'ARRIVEE'
    ? 'ROUTE-INCOMPLETE'
    : `${departure}-${destination}`;
  const date = safeIsoDate(snapshot.documentDateIso);
  return `CAP-CLAIR_LOG-NAV_${route}_${date}.pdf`.slice(0, 120);
}
