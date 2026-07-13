import { findAerodrome } from '../../data/aerodromeCatalog';
import { distanceNm } from '../geo/distance';

export function diversionMinutes(
  destinationCode: string | undefined,
  alternateCode: string,
  tasKt: number
): number {
  const destination = destinationCode ? findAerodrome(destinationCode) : null;
  const alternate = alternateCode ? findAerodrome(alternateCode) : null;
  if (!destination || !alternate || !Number.isFinite(tasKt) || tasKt <= 0) return 0;
  return Math.max(0, Math.round((distanceNm(destination, alternate) / tasKt) * 60));
}
