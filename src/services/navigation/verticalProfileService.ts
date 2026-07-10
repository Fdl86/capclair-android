import type { NavRoute } from '../../domain/navigation.types';
import type { AircraftProfile } from '../../domain/aircraft.types';

export interface ProfilePoint {
  distanceRatio: number; // 0 -> 1 le long de la route
  altitudeFt: number;
}

const DEFAULT_SAMPLES = 80;

// Pente en ft/NM à partir d'un taux (ft/min) et d'une vitesse (kt = NM/h).
// Sans perf exploitable -> Infinity (transition instantanée, repli sûr).
function gradientFtPerNm(rateFpm: number, speedKt: number): number {
  if (!Number.isFinite(rateFpm) || !Number.isFinite(speedKt) || rateFpm <= 0 || speedKt <= 0) {
    return Number.POSITIVE_INFINITY;
  }
  return rateFpm / (speedKt / 60);
}

interface BranchSpan {
  startNm: number;
  endNm: number;
  altitudeFt: number;
}

function buildBranchSpans(route: NavRoute): { spans: BranchSpan[]; totalNm: number } {
  let cumulative = 0;
  const spans = route.branches.map((branch) => {
    const startNm = cumulative;
    cumulative += branch.distanceNm;
    return { startNm, endNm: cumulative, altitudeFt: branch.altitudeFt };
  });
  return { spans, totalNm: cumulative };
}

function cruiseAltitudeAt(spans: BranchSpan[], distanceNm: number): number {
  for (const span of spans) {
    if (distanceNm <= span.endNm) return span.altitudeFt;
  }
  return spans[spans.length - 1].altitudeFt;
}

export function buildVerticalProfile(
  route: NavRoute,
  aircraft: AircraftProfile,
  samples: number = DEFAULT_SAMPLES
): ProfilePoint[] {
  if (route.points.length < 2 || route.branches.length === 0) return [];

  const { spans, totalNm } = buildBranchSpans(route);
  if (totalNm <= 0) return [];

  const climbGrad = gradientFtPerNm(aircraft.climbRateFpm, aircraft.climbSpeedKt);
  const descentGrad = gradientFtPerNm(aircraft.descentRateFpm, aircraft.descentSpeedKt);

  const departureElevation = route.points[0].elevationFt;
  const destinationElevation = route.points[route.points.length - 1].elevationFt;
  const firstCruise = spans[0].altitudeFt;
  const lastCruise = spans[spans.length - 1].altitudeFt;

  const count = Math.max(2, Math.min(200, samples));

  // Cibles d'altitude le long de la distance : croisière par branche, extrémités épinglées
  // sur l'élévation terrain des terrains (si connue) pour matérialiser montée et descente.
  const distances: number[] = [];
  const targets: number[] = [];
  for (let i = 0; i < count; i += 1) {
    const ratio = i / (count - 1);
    const distanceNm = ratio * totalNm;
    distances.push(distanceNm);
    targets.push(cruiseAltitudeAt(spans, distanceNm));
  }
  const startAltitude = departureElevation ?? firstCruise;
  targets[0] = startAltitude;
  targets[count - 1] = destinationElevation ?? lastCruise;

  // Passe avant : montée limitée par la pente (les descentes sont instantanées ici).
  const forward: number[] = new Array(count);
  forward[0] = startAltitude;
  for (let i = 1; i < count; i += 1) {
    const stepNm = distances[i] - distances[i - 1];
    const maxClimb = forward[i - 1] + climbGrad * stepNm;
    forward[i] = Math.min(targets[i], maxClimb);
  }

  // Passe arrière : descente limitée par la pente (anticipe les points de descente).
  const altitudes: number[] = new Array(count);
  altitudes[count - 1] = forward[count - 1];
  for (let i = count - 2; i >= 0; i -= 1) {
    const stepNm = distances[i + 1] - distances[i];
    const maxFromDescent = altitudes[i + 1] + descentGrad * stepNm;
    altitudes[i] = Math.min(forward[i], maxFromDescent);
  }

  return altitudes.map((altitudeFt, i) => ({
    distanceRatio: i / (count - 1),
    altitudeFt
  }));
}
