import type {
  BriefingRouteSnapshot,
  NotamLifecycleType,
  NotamQField,
  NotamTemporalStatus,
  ParsedNotam,
  PibRouteContext
} from '../../domain/notam.types';
import { distanceNm } from '../geo/distance';
import { coordinatesEqual, extractCoordinates, parseQCoordinateRadius } from './notamCoordinates';
import { extractSupAipReferences } from './supAipReferenceParser';

const NOTAM_ID = /\b([A-Z]{4})-([A-Z])(\d{4})\/(\d{2})\b/g;


const SOFIA_SECTION_HEADINGS = new Set([
  'AERODROME DE DEPART',
  'AERODROME DE DESTINATION',
  'INSTALLATIONS ET SERVICES',
  'AIRE DE MANOEUVRE',
  'AIRE DE TRAFIC',
  'BALISAGE',
  "AIDES A L'ATTERRISSAGE, INSTALLATIONS RADIONAVIGATION ET GNSS",
  'PROCEDURES',
  "ORGANISATION DE L'ESPACE AERIEN ET SERVICES DE LA CIRCULATION AERIENNE",
  "ORGANISATION DE L'ESPACE AERIEN ET PROCEDURES",
  'SERVICES DE LA CIRCULATION AERIENNE ET VOLMET',
  'INSTALLATIONS DE COMMUNICATION ET DE SURVEILLANCE',
  'METEOROLOGIE ET EQUIPEMENTS',
  "RESTRICTIONS DE L'ESPACE AERIEN",
  'AVERTISSEMENTS',
  'OBSTACLES',
  'AUTRES INFORMATIONS',
  'EN-ROUTE'
]);

function normalizeHeading(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function isSofiaSectionHeading(value: string) {
  return SOFIA_SECTION_HEADINGS.has(normalizeHeading(value));
}

/**
 * SOFIA's copy/paste view can append empty report categories (often followed by
 * NIL) to the preceding NOTAM until the next NOTAM identifier. Those headings
 * are document structure, not part of fields E/F/G. Keep the complete briefing
 * text at analysis level, but stop the individual NOTAM block at the first
 * clearly separated SOFIA category heading.
 */
function trimTrailingSofiaSections(block: string) {
  const lines = block.split('\n');
  let hasStartedField = false;

  for (let index = 0; index < lines.length; index += 1) {
    const trimmed = lines[index].trim();
    if (/^[ABCDEFGQ]\)\s*/.test(trimmed) || /^DU:\s*/i.test(trimmed)) {
      hasStartedField = true;
      continue;
    }
    if (!hasStartedField || !isSofiaSectionHeading(trimmed)) continue;

    const previousIsBlank = index > 0 && lines[index - 1].trim() === '';
    const nextNonBlank = lines.slice(index + 1).map((line) => line.trim()).find(Boolean) ?? '';
    const followedByNilOrHeading = /^NIL\.?$/i.test(nextNonBlank) || isSofiaSectionHeading(nextNonBlank);

    if (previousIsBlank || followedByNilOrHeading) {
      return lines.slice(0, index).join('\n').trim();
    }
  }

  return block.trim();
}

function parseNotamDate(raw: string): string | null {
  const cleaned = raw.trim().replace(/\s+EST$/i, '').trim();
  const sofia = cleaned.match(/^(\d{2})\s+(\d{2})\s+(\d{4})\s+(\d{2}):(\d{2})$/);
  if (sofia) return `${sofia[3]}-${sofia[2]}-${sofia[1]}T${sofia[4]}:${sofia[5]}:00Z`;
  const compact = cleaned.match(/^(?:(\d{4})|(\d{2}))(\d{2})(\d{2})(\d{2})(\d{2})$/);
  if (!compact) return null;
  const year = compact[1] ?? `20${compact[2]}`;
  return `${year}-${compact[3]}-${compact[4]}T${compact[5]}:${compact[6]}:00Z`;
}

function extractField(block: string, field: 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'Q'): string | null {
  const expression = new RegExp(`(?:^|\\n)\\s*${field}\\)\\s*([\\s\\S]*?)(?=\\n\\s*[ABCDEFGQ]\\)|$)`);
  const match = block.match(expression);
  return match?.[1]?.trim() ?? null;
}

interface ParsedValidity {
  validFromIso: string | null;
  validToIso: string | null;
  validToPermanent: boolean;
  recognized: boolean;
}

function parseValidity(block: string): ParsedValidity {
  const sofia = block.match(/DU:\s*(\d{2}\s+\d{2}\s+\d{4}\s+\d{2}:\d{2})\s+AU:\s*(PERM|\d{2}\s+\d{2}\s+\d{4}\s+\d{2}:\d{2})/i);
  if (sofia) {
    const validToPermanent = sofia[2].toUpperCase() === 'PERM';
    return {
      validFromIso: parseNotamDate(sofia[1]),
      validToIso: validToPermanent ? null : parseNotamDate(sofia[2]),
      validToPermanent,
      recognized: true
    };
  }

  const b = extractField(block, 'B')?.split(/\s+/)[0] ?? null;
  const cRaw = extractField(block, 'C')?.trim() ?? null;
  const validToPermanent = Boolean(cRaw && /^PERM\b/i.test(cRaw));
  return {
    validFromIso: b ? parseNotamDate(b) : null,
    validToIso: cRaw && !validToPermanent ? parseNotamDate(cRaw) : null,
    validToPermanent,
    recognized: Boolean(b || cRaw)
  };
}

function parseQ(raw: string | null): NotamQField | null {
  if (!raw) return null;
  const oneLine = raw.replace(/\s+/g, ' ').trim();
  const parts = oneLine.split('/').map((part) => part.trim());
  if (parts.length < 7) {
    return {
      raw: oneLine,
      fir: null,
      code: null,
      traffic: null,
      purpose: null,
      scope: null,
      lowerFl: null,
      upperFl: null,
      center: parseQCoordinateRadius(oneLine)?.center ?? null,
      radiusNm: parseQCoordinateRadius(oneLine)?.radiusNm ?? null
    };
  }
  const vertical = parts[5].match(/(\d{3})\s*\/\s*(\d{3})/) ?? oneLine.match(/\/\s*(\d{3})\s*\/\s*(\d{3})\s*\//);
  const coord = parseQCoordinateRadius(parts.slice(6).join(' '));
  return {
    raw: oneLine,
    fir: parts[0] || null,
    code: parts[1] || null,
    traffic: parts[2] || null,
    purpose: parts[3] || null,
    scope: parts[4] || null,
    lowerFl: vertical ? Number(vertical[1]) : null,
    upperFl: vertical ? Number(vertical[2]) : null,
    center: coord?.center ?? null,
    radiusNm: coord?.radiusNm ?? null
  };
}

function lifecycleType(block: string): NotamLifecycleType {
  const normalized = block.toUpperCase();
  if (/\bNOTAMC\b|\bCANCEL NOTAM\b/.test(normalized)) return 'cancel';
  if (/\bNOTAMR\b|\bREPLACE NOTAM\b/.test(normalized)) return 'replace';
  if (/\bNOTAMN\b|\bNEW NOTAM\b/.test(normalized)) return 'new';
  return 'unknown';
}

function dateOnly(iso: string) {
  return iso.slice(0, 10);
}

function parseScheduleAt(scheduleRaw: string, plannedIso: string, validityStartIso: string | null): { status: NotamTemporalStatus; explanation: string } {
  const normalized = scheduleRaw.toUpperCase().replace(/[\u2013\u2014]/g, '-').replace(/\s+/g, ' ').trim();
  if (/SR\s*-\s*SS|HJ|H24 EXC|EST/.test(normalized)) {
    return { status: 'complex', explanation: `Horaire D complexe non interprété automatiquement: ${scheduleRaw}` };
  }
  const planned = new Date(plannedIso);
  if (Number.isNaN(planned.getTime())) return { status: 'unknown', explanation: 'Heure prévue invalide.' };
  const month = validityStartIso ? new Date(validityStartIso).getUTCMonth() : planned.getUTCMonth();
  const year = validityStartIso ? new Date(validityStartIso).getUTCFullYear() : planned.getUTCFullYear();
  const groups = normalized.split(',').map((group) => group.trim()).filter(Boolean);
  let parsedGroup = false;
  for (const group of groups) {
    const match = group.match(/^((?:\d{1,2}\s+)+)(\d{4})\s*-\s*(\d{4})$/);
    if (!match) continue;
    parsedGroup = true;
    const days = match[1].trim().split(/\s+/).map(Number);
    if (!days.includes(planned.getUTCDate()) || planned.getUTCMonth() !== month || planned.getUTCFullYear() !== year) continue;
    const startMinutes = Number(match[2].slice(0, 2)) * 60 + Number(match[2].slice(2));
    const endMinutes = Number(match[3].slice(0, 2)) * 60 + Number(match[3].slice(2));
    const currentMinutes = planned.getUTCHours() * 60 + planned.getUTCMinutes();
    if (currentMinutes >= startMinutes && currentMinutes <= endMinutes) {
      return { status: 'active', explanation: `Créneau D interprété actif à ${plannedIso}.` };
    }
    return { status: 'published', explanation: `Publication en vigueur, créneau D interprété hors de l'heure prévue ${plannedIso}.` };
  }
  return parsedGroup
    ? { status: 'published', explanation: `Publication en vigueur, aucun créneau D ne correspond à la date prévue ${dateOnly(plannedIso)}.` }
    : { status: 'complex', explanation: `Horaire D non interprété avec certitude: ${scheduleRaw}` };
}

function temporalStatus(
  validFromIso: string | null,
  validToIso: string | null,
  permanent: boolean,
  scheduleRaw: string | null,
  plannedIso: string | null
): { status: NotamTemporalStatus; explanation: string } {
  if (!plannedIso) return { status: 'unknown', explanation: 'Aucune heure de vol disponible pour évaluer le NOTAM.' };
  const planned = new Date(plannedIso).getTime();
  const from = validFromIso ? new Date(validFromIso).getTime() : null;
  const to = validToIso ? new Date(validToIso).getTime() : null;
  if (from !== null && planned < from) return { status: 'future', explanation: 'Le NOTAM commence après l’heure prévue.' };
  if (!permanent && to !== null && planned > to) return { status: 'ended', explanation: 'Le NOTAM est terminé avant l’heure prévue.' };
  if (scheduleRaw) return parseScheduleAt(scheduleRaw, plannedIso, validFromIso);
  if (from !== null || to !== null || permanent) return { status: 'published', explanation: 'Publication en vigueur à l’heure prévue. Aucun créneau D précis n’est fourni.' };
  return { status: 'unknown', explanation: 'Période de validité non interprétée.' };
}

function toLocalXY(point: { latitude: number; longitude: number }, refLat: number) {
  return {
    x: point.longitude * Math.cos((refLat * Math.PI) / 180) * 60,
    y: point.latitude * 60
  };
}

function distanceToSegmentNm(
  point: { latitude: number; longitude: number },
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number }
) {
  const refLat = (point.latitude + a.latitude + b.latitude) / 3;
  const p = toLocalXY(point, refLat);
  const p1 = toLocalXY(a, refLat);
  const p2 = toLocalXY(b, refLat);
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  if (dx === 0 && dy === 0) return Math.hypot(p.x - p1.x, p.y - p1.y);
  const t = Math.max(0, Math.min(1, ((p.x - p1.x) * dx + (p.y - p1.y) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(p.x - (p1.x + t * dx), p.y - (p1.y + t * dy));
}

function routeRelevance(
  aFields: string[],
  q: NotamQField | null,
  route: BriefingRouteSnapshot,
  context: PibRouteContext
): { relevance: ParsedNotam['routeRelevance']; distance: number | null } {
  if (route.departure && aFields.includes(route.departure)) return { relevance: 'departure', distance: 0 };
  if (route.destination && aFields.includes(route.destination)) return { relevance: 'destination', distance: 0 };
  if (route.alternates.some((code) => aFields.includes(code))) return { relevance: 'alternate', distance: 0 };
  if (!q?.center || route.points.length === 0) return { relevance: 'unknown', distance: null };
  let minimum = Infinity;
  if (route.points.length === 1) minimum = distanceNm(q.center, route.points[0]);
  for (let index = 1; index < route.points.length; index += 1) {
    minimum = Math.min(minimum, distanceToSegmentNm(q.center, route.points[index - 1], route.points[index]));
  }
  const influence = q.radiusNm ?? 0;
  const corridor = context.halfCorridorNm ?? 15;
  return minimum <= influence + corridor
    ? { relevance: 'route', distance: minimum }
    : { relevance: 'outside', distance: minimum };
}

function sectionBefore(text: string, index: number): string | null {
  const lines = text.slice(Math.max(0, index - 600), index).split('\n').map((line) => line.trim()).filter(Boolean);
  for (let cursor = lines.length - 1; cursor >= 0; cursor -= 1) {
    const line = lines[cursor];
    if (line.length > 3 && line.length < 120 && line === line.toUpperCase() && !/^(A\)|Q\)|D\)|E\)|F\)|G\)|DU:|AU:)/.test(line) && !/^[A-Z]{4}/.test(line)) return line;
  }
  return null;
}

export function parseNotams(text: string, context: PibRouteContext, route: BriefingRouteSnapshot): ParsedNotam[] {
  const matches = [...text.matchAll(NOTAM_ID)];
  const parsed = matches.map((match, index) => {
    const start = match.index ?? 0;
    const end = matches[index + 1]?.index ?? text.length;
    const block = trimTrailingSofiaSections(text.slice(start, end));
    const validity = parseValidity(block);
    const { validFromIso, validToIso, validToPermanent } = validity;
    const aRaw = extractField(block, 'A') ?? '';
    const a = aRaw.match(/\b[A-Z]{4}\b/g) ?? [];
    const qRaw = extractField(block, 'Q');
    const q = parseQ(qRaw);
    const scheduleRaw = extractField(block, 'D');
    const e = extractField(block, 'E') ?? '';
    const f = extractField(block, 'F');
    const g = extractField(block, 'G');
    const eCoordinates = extractCoordinates(e);
    const exactPolygon = eCoordinates.length >= 4 && coordinatesEqual(eCoordinates[0], eCoordinates.at(-1)!) ? eCoordinates : null;
    const temporal = temporalStatus(validFromIso, validToIso, validToPermanent, scheduleRaw, context.departureTimeIso ?? route.departureTimeIso);
    const relevance = routeRelevance(a, q, route, context);
    const warnings: string[] = [];
    if (!q) warnings.push('Champ Q absent ou non interprété.');
    if (!validity.recognized || !validFromIso || (!validToPermanent && !validToIso)) warnings.push('Champs B/C ou DU/AU non interprétés.');
    if (scheduleRaw && temporal.status === 'complex') warnings.push('Horaire D à vérifier dans SOFIA.');
    if (q?.center && !exactPolygon) warnings.push('Le cercle Q est une zone d’influence approximative, pas une limite aéronautique exacte.');
    const interpretationStatus: ParsedNotam['interpretationStatus'] = warnings.length === 0 ? 'confirmed' : q ? 'probable' : 'uninterpreted';

    return {
      id: match[0],
      series: match[2],
      number: Number(match[3]),
      year: Number(`20${match[4]}`),
      lifecycleType: lifecycleType(block),
      section: sectionBefore(text, start),
      rawText: block,
      fields: { a, validFromIso, validToIso, validToPermanent, scheduleRaw, e, f, g, q },
      supAipReferences: extractSupAipReferences(e || block),
      eCoordinates,
      exactPolygon,
      temporalStatus: temporal.status,
      temporalExplanation: temporal.explanation,
      routeRelevance: relevance.relevance,
      routeDistanceNm: Number.isFinite(relevance.distance ?? NaN) ? relevance.distance : null,
      interpretationStatus,
      warnings
    };
  });

  const unique = new Set<string>();
  return parsed.filter((notam) => {
    const key = `${notam.id}|${notam.rawText.replace(/\s+/g, ' ').trim()}`;
    if (unique.has(key)) return false;
    unique.add(key);
    return true;
  });
}
