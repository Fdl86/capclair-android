import { describe, expect, it } from 'vitest';
import { validateAlternateCode } from '../alternateValidation';

describe('alternate validation', () => {
  it('rejects the destination as its own alternate, including on a loop', () => {
    expect(validateAlternateCode('LFBI', 'LFBI')).toEqual({
      valid: false,
      reason: 'same-as-destination',
      code: 'LFBI'
    });
  });

  it('accepts a known distinct alternate and an empty optional value', () => {
    expect(validateAlternateCode('LFOU', 'LFBI')).toEqual({ valid: true, code: 'LFOU' });
    expect(validateAlternateCode('', 'LFBI')).toEqual({ valid: true, code: '' });
  });
});
