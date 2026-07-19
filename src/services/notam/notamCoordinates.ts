import type { NotamCoordinate } from '../../domain/notam.types';

const COMPACT_COORDINATE = /(?<!\d)(\d{2})(\d{2})(\d{2}(?:\.\d+)?)([NS])\s*(\d{3})(\d{2})(\d{2}(?:\.\d+)?)([EW])(?!\d)/g;
const Q_COORDINATE = /(?<!\d)(\d{2})(\d{2})([NS])\s*(\d{3})(\d{2})([EW])(\d{3})(?!\d)/;

function signed(degrees: number, minutes: number, seconds: number, hemisphere: string) {
  const value = degrees + minutes / 60 + seconds / 3600;
  return hemisphere === 'S' || hemisphere === 'W' ? -value : value;
}

export function parseCompactCoordinate(raw: string): NotamCoordinate | null {
  const match = raw.trim().match(/^(\d{2})(\d{2})(\d{2}(?:\.\d+)?)([NS])\s*(\d{3})(\d{2})(\d{2}(?:\.\d+)?)([EW])$/);
  if (!match) return null;
  return {
    latitude: signed(Number(match[1]), Number(match[2]), Number(match[3]), match[4]),
    longitude: signed(Number(match[5]), Number(match[6]), Number(match[7]), match[8]),
    raw: raw.trim()
  };
}

export function extractCoordinates(text: string): NotamCoordinate[] {
  const coordinates: NotamCoordinate[] = [];
  for (const match of text.matchAll(COMPACT_COORDINATE)) {
    const coordinate = parseCompactCoordinate(`${match[1]}${match[2]}${match[3]}${match[4]} ${match[5]}${match[6]}${match[7]}${match[8]}`);
    if (coordinate) coordinates.push(coordinate);
  }
  return coordinates;
}

export function parseQCoordinateRadius(raw: string): { center: NotamCoordinate; radiusNm: number } | null {
  const match = raw.match(Q_COORDINATE);
  if (!match) return null;
  const center: NotamCoordinate = {
    latitude: signed(Number(match[1]), Number(match[2]), 0, match[3]),
    longitude: signed(Number(match[4]), Number(match[5]), 0, match[6]),
    raw: `${match[1]}${match[2]}${match[3]}${match[4]}${match[5]}${match[6]}`
  };
  return { center, radiusNm: Number(match[7]) };
}

export function coordinatesEqual(a: NotamCoordinate, b: NotamCoordinate, tolerance = 1e-6) {
  return Math.abs(a.latitude - b.latitude) <= tolerance && Math.abs(a.longitude - b.longitude) <= tolerance;
}
