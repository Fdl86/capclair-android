import type { BranchWind } from '../../domain/navigation.types';

const toRad = (value: number) => (value * Math.PI) / 180;
const toDeg = (value: number) => (value * 180) / Math.PI;

export function windToComponents(wind: Pick<BranchWind, 'directionDeg' | 'speedKt'>) {
  const rad = toRad(wind.directionDeg);
  return {
    u: -wind.speedKt * Math.sin(rad),
    v: -wind.speedKt * Math.cos(rad)
  };
}

export function componentsToWind(u: number, v: number): BranchWind {
  const speedKt = Math.max(0, Math.round(Math.sqrt(u * u + v * v)));
  const directionDeg = Math.round((toDeg(Math.atan2(-u, -v)) + 360) % 360);
  return { directionDeg, speedKt };
}

function commonValue(values: Array<string | undefined>): string | undefined {
  const filtered = values.filter(Boolean) as string[];
  if (!filtered.length) return undefined;
  return filtered.every((value) => value === filtered[0]) ? filtered[0] : 'mixed';
}

export function averageWind(winds: BranchWind[]): BranchWind | null {
  if (!winds.length) return null;
  const sum = winds.reduce((acc, wind) => {
    const vector = windToComponents(wind);
    return { u: acc.u + vector.u, v: acc.v + vector.v };
  }, { u: 0, v: 0 });

  const averaged = componentsToWind(sum.u / winds.length, sum.v / winds.length);
  const auditSamples = winds.flatMap((wind) => wind.auditSamples ?? []);

  return {
    ...averaged,
    sourceTimeIso: winds[0]?.sourceTimeIso,
    provider: commonValue(winds.map((wind) => wind.provider)),
    endpoint: commonValue(winds.map((wind) => wind.endpoint)),
    fallback: winds.some((wind) => wind.fallback),
    cache: commonValue(winds.map((wind) => wind.cache)) as BranchWind['cache'],
    normalizedKey: winds[0]?.normalizedKey,
    auditSamples
  };
}
