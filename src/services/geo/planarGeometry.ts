export interface GeoCoordinate {
  latitude: number;
  longitude: number;
}

const EPSILON = 1e-10;
const NM_PER_DEGREE = 60;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function localScale(points: GeoCoordinate[]): number {
  if (points.length === 0) return 1;
  const averageLatitude = points.reduce((sum, point) => sum + point.latitude, 0) / points.length;
  return Math.max(0.01, Math.cos((averageLatitude * Math.PI) / 180));
}

function toLocal(point: GeoCoordinate, scale: number) {
  return {
    x: point.longitude * scale,
    y: point.latitude
  };
}

function cross(ax: number, ay: number, bx: number, by: number): number {
  return ax * by - ay * bx;
}

function dot(ax: number, ay: number, bx: number, by: number): number {
  return ax * bx + ay * by;
}

function pointOnSegment(point: GeoCoordinate, start: GeoCoordinate, end: GeoCoordinate): boolean {
  const scale = localScale([point, start, end]);
  const p = toLocal(point, scale);
  const a = toLocal(start, scale);
  const b = toLocal(end, scale);
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const apx = p.x - a.x;
  const apy = p.y - a.y;
  const area = Math.abs(cross(abx, aby, apx, apy));
  const length = Math.hypot(abx, aby);
  if (area > EPSILON * Math.max(1, length)) return false;
  const projection = dot(apx, apy, abx, aby);
  return projection >= -EPSILON && projection <= dot(abx, aby, abx, aby) + EPSILON;
}

export function pointInRing(point: GeoCoordinate, ring: GeoCoordinate[]): boolean {
  if (ring.length < 3) return false;
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const currentPoint = ring[index];
    const previousPoint = ring[previous];
    if (pointOnSegment(point, previousPoint, currentPoint)) return true;
    const intersects = ((currentPoint.latitude > point.latitude) !== (previousPoint.latitude > point.latitude))
      && point.longitude < ((previousPoint.longitude - currentPoint.longitude)
        * (point.latitude - currentPoint.latitude))
        / ((previousPoint.latitude - currentPoint.latitude) || EPSILON)
        + currentPoint.longitude;
    if (intersects) inside = !inside;
  }
  return inside;
}

export function pointInPolygon(point: GeoCoordinate, rings: GeoCoordinate[][]): boolean {
  const outer = rings[0];
  if (!outer || !pointInRing(point, outer)) return false;
  return !rings.slice(1).some((hole) => pointInRing(point, hole));
}

function collinearPointRatio(
  point: { x: number; y: number },
  start: { x: number; y: number },
  end: { x: number; y: number }
): number | null {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= EPSILON) return null;
  const area = Math.abs(cross(dx, dy, point.x - start.x, point.y - start.y));
  if (area > EPSILON * Math.max(1, Math.sqrt(lengthSquared))) return null;
  const ratio = dot(point.x - start.x, point.y - start.y, dx, dy) / lengthSquared;
  return ratio >= -EPSILON && ratio <= 1 + EPSILON ? clamp(ratio, 0, 1) : null;
}

export function segmentIntersectionRatios(
  start: GeoCoordinate,
  end: GeoCoordinate,
  edgeStart: GeoCoordinate,
  edgeEnd: GeoCoordinate
): number[] {
  const scale = localScale([start, end, edgeStart, edgeEnd]);
  const p = toLocal(start, scale);
  const p2 = toLocal(end, scale);
  const q = toLocal(edgeStart, scale);
  const q2 = toLocal(edgeEnd, scale);
  const rx = p2.x - p.x;
  const ry = p2.y - p.y;
  const sx = q2.x - q.x;
  const sy = q2.y - q.y;
  const denominator = cross(rx, ry, sx, sy);
  const qpx = q.x - p.x;
  const qpy = q.y - p.y;

  if (Math.abs(denominator) <= EPSILON) {
    if (Math.abs(cross(qpx, qpy, rx, ry)) > EPSILON) return [];
    const first = collinearPointRatio(q, p, p2);
    const second = collinearPointRatio(q2, p, p2);
    return [first, second].filter((value): value is number => value !== null);
  }

  const t = cross(qpx, qpy, sx, sy) / denominator;
  const u = cross(qpx, qpy, rx, ry) / denominator;
  if (t < -EPSILON || t > 1 + EPSILON || u < -EPSILON || u > 1 + EPSILON) return [];
  return [clamp(t, 0, 1)];
}

export function segmentsIntersect(
  firstStart: GeoCoordinate,
  firstEnd: GeoCoordinate,
  secondStart: GeoCoordinate,
  secondEnd: GeoCoordinate
): boolean {
  return segmentIntersectionRatios(firstStart, firstEnd, secondStart, secondEnd).length > 0;
}

export function polygonSegmentIntervals(
  start: GeoCoordinate,
  end: GeoCoordinate,
  rings: GeoCoordinate[][]
): Array<{ startRatio: number; endRatio: number }> {
  if (!rings[0]?.length) return [];
  if (Math.abs(start.latitude - end.latitude) <= EPSILON && Math.abs(start.longitude - end.longitude) <= EPSILON) {
    return pointInPolygon(start, rings) ? [{ startRatio: 0, endRatio: 1 }] : [];
  }

  const ratios = [0, 1];
  for (const ring of rings) {
    if (ring.length < 2) continue;
    for (let index = 0; index < ring.length; index += 1) {
      const edgeStart = ring[index];
      const edgeEnd = ring[(index + 1) % ring.length];
      ratios.push(...segmentIntersectionRatios(start, end, edgeStart, edgeEnd));
    }
  }

  const sorted = [...new Set(ratios.map((ratio) => Number(clamp(ratio, 0, 1).toFixed(10))))]
    .sort((left, right) => left - right);
  const intervals: Array<{ startRatio: number; endRatio: number }> = [];

  for (let index = 0; index < sorted.length - 1; index += 1) {
    const startRatio = sorted[index];
    const endRatio = sorted[index + 1];
    if (endRatio - startRatio <= EPSILON) continue;
    const midpointRatio = (startRatio + endRatio) / 2;
    const midpoint = {
      latitude: start.latitude + (end.latitude - start.latitude) * midpointRatio,
      longitude: start.longitude + (end.longitude - start.longitude) * midpointRatio
    };
    if (!pointInPolygon(midpoint, rings)) continue;
    const previous = intervals.at(-1);
    if (previous && Math.abs(previous.endRatio - startRatio) <= 1e-8) {
      previous.endRatio = endRatio;
    } else {
      intervals.push({ startRatio, endRatio });
    }
  }

  if (intervals.length === 0 && pointInPolygon(start, rings) && pointInPolygon(end, rings)) {
    return [{ startRatio: 0, endRatio: 1 }];
  }
  return intervals;
}

export function pointToSegmentDistanceNm(
  point: GeoCoordinate,
  start: GeoCoordinate,
  end: GeoCoordinate
): number {
  const scale = localScale([point, start, end]);
  const p = toLocal(point, scale);
  const a = toLocal(start, scale);
  const b = toLocal(end, scale);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= EPSILON) return Math.hypot(p.x - a.x, p.y - a.y) * NM_PER_DEGREE;
  const ratio = clamp(dot(p.x - a.x, p.y - a.y, dx, dy) / lengthSquared, 0, 1);
  return Math.hypot(p.x - (a.x + ratio * dx), p.y - (a.y + ratio * dy)) * NM_PER_DEGREE;
}

export function segmentToSegmentDistanceNm(
  firstStart: GeoCoordinate,
  firstEnd: GeoCoordinate,
  secondStart: GeoCoordinate,
  secondEnd: GeoCoordinate
): number {
  if (segmentsIntersect(firstStart, firstEnd, secondStart, secondEnd)) return 0;
  return Math.min(
    pointToSegmentDistanceNm(firstStart, secondStart, secondEnd),
    pointToSegmentDistanceNm(firstEnd, secondStart, secondEnd),
    pointToSegmentDistanceNm(secondStart, firstStart, firstEnd),
    pointToSegmentDistanceNm(secondEnd, firstStart, firstEnd)
  );
}
