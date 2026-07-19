import type { PibRouteContext } from '../../domain/notam.types';
import { compactWhitespace } from './sofiaText';

function parseFrenchDateTime(raw: string | null): string | null {
  if (!raw) return null;
  const match = raw.match(/(\d{2})[-\s](\d{2})[-\s](\d{4})\s+(\d{2}):(\d{2})/);
  if (!match) return null;
  return `${match[3]}-${match[2]}-${match[1]}T${match[4]}:${match[5]}:00Z`;
}

function valueAfterLabel(text: string, label: RegExp, valuePattern: string): string | null {
  const match = text.match(new RegExp(`${label.source}[\\s:]*(${valuePattern})`, 'i'));
  return match?.[1]?.trim() ?? null;
}

function detectCodes(text: string, label: RegExp): string[] {
  const direct = text.match(new RegExp(`${label.source}[\\s:]*([A-Z]{4}(?:\\s*[,;/]\\s*[A-Z]{4})*)`, 'i'));
  if (direct) return direct[1].match(/[A-Z]{4}/g) ?? [];
  return [];
}

export function parsePibRouteContext(text: string): PibRouteContext {
  const flat = compactWhitespace(text);
  const headerSlice = flat.slice(0, Math.min(flat.length, 2600));
  const type = /PIB\s+TRAJET/i.test(headerSlice) ? 'PIB TRAJET' : /PIB\s+LOCAL/i.test(headerSlice) ? 'PIB LOCAL' : null;

  let productionRaw = valueAfterLabel(headerSlice, /Date et Heure de production \(UTC\)/i, '\\d{2}[- ]\\d{2}[- ]\\d{4}\\s+\\d{2}:\\d{2}');
  let departureTimeRaw = valueAfterLabel(headerSlice, /Date et heure de départ \(UTC\)/i, '\\d{2}[- ]\\d{2}[- ]\\d{4}\\s+\\d{2}:\\d{2}');

  if (!productionRaw || !departureTimeRaw) {
    const dateTimes = headerSlice.match(/\d{2}-\d{2}-\d{4}\s+\d{2}:\d{2}/g) ?? [];
    productionRaw ??= dateTimes[0] ?? null;
    departureTimeRaw ??= dateTimes[1] ?? null;
  }

  let departure = detectCodes(headerSlice, /Départ/i)[0] ?? null;
  let destination = detectCodes(headerSlice, /Destination/i)[0] ?? null;
  let alternates = detectCodes(headerSlice, /Dégagements?/i);

  if (!departure || !destination) {
    const routeHeader = headerSlice.match(/Règle de vol\s+Départ\s+Destination\s+(VFR|IFR)\s+([A-Z]{4})\s+([A-Z]{4})/i);
    if (routeHeader) {
      departure ??= routeHeader[2];
      destination ??= routeHeader[3];
    }
  }

  const numericAfter = (label: RegExp) => {
    const value = valueAfterLabel(headerSlice, label, '\\d{1,4}');
    return value === null ? null : Number(value);
  };

  let floorFl = numericAfter(/Plancher \(en FL\)/i);
  let ceilingFl = numericAfter(/Plafond \(en FL\)/i);
  let radiusNm = numericAfter(/Rayon \(en NM\)/i);
  let halfCorridorNm = numericAfter(/Demi-couloir \(en NM\)/i);

  const tableValues = headerSlice.match(/Plancher \(en FL\).*?Plafond \(en FL\).*?Rayon \(en NM\).*?\b(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})\b/i);
  if (tableValues) {
    floorFl = Number(tableValues[1]);
    ceilingFl = Number(tableValues[2]);
    radiusNm = Number(tableValues[3]);
  }
  const corridorTable = headerSlice.match(/Demi-couloir \(en NM\).*?Dégagements?.*?\b(\d{1,3})\s+((?:[A-Z]{4}[, ]*)+)/i);
  if (corridorTable) {
    halfCorridorNm = Number(corridorTable[1]);
    if (alternates.length === 0) alternates = corridorTable[2].match(/[A-Z]{4}/g) ?? [];
  }

  const durationRaw = valueAfterLabel(headerSlice, /Durée/i, '\\d{1,6}');
  let flightRules = valueAfterLabel(headerSlice, /Règle de vol/i, 'VFR|IFR');
  if (!flightRules) flightRules = headerSlice.match(/\b(VFR|IFR)\b/i)?.[1]?.toUpperCase() ?? null;

  return {
    type,
    productionTimeIso: parseFrenchDateTime(productionRaw),
    departureTimeIso: parseFrenchDateTime(departureTimeRaw),
    durationRaw,
    flightRules,
    departure,
    destination,
    alternates: [...new Set(alternates)],
    floorFl,
    ceilingFl,
    radiusNm,
    halfCorridorNm
  };
}
