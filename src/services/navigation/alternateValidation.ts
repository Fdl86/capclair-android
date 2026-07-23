import { findAerodrome } from '../../data/aerodromeCatalog';

export type AlternateValidationResult =
  | { valid: true; code: string }
  | { valid: false; reason: 'unknown' | 'same-as-destination'; code: string };

export function validateAlternateCode(code: string, destinationCode: string): AlternateValidationResult {
  const normalized = code.trim().toUpperCase();
  if (!normalized) return { valid: true, code: '' };
  if (normalized === destinationCode.trim().toUpperCase()) {
    return { valid: false, reason: 'same-as-destination', code: normalized };
  }
  if (!findAerodrome(normalized)) return { valid: false, reason: 'unknown', code: normalized };
  return { valid: true, code: normalized };
}
