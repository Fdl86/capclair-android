import { describe, expect, it } from 'vitest';
import { formatFlightLevel, parseAltitudeInput } from '../altitudeInput';

describe('altitude input', () => {
  it('accepts feet and flight levels', () => {
    expect(parseAltitudeInput('9500')).toBe(9500);
    expect(parseAltitudeInput('FL095')).toBe(9500);
    expect(parseAltitudeInput('fl 65')).toBe(6500);
  });

  it('rounds feet to the nearest hundred and rejects invalid values', () => {
    expect(parseAltitudeInput('9470')).toBe(9500);
    expect(parseAltitudeInput('FL150')).toBeNull();
    expect(parseAltitudeInput('abc')).toBeNull();
    expect(parseAltitudeInput('')).toBeNull();
  });

  it('formats a flight level label', () => {
    expect(formatFlightLevel(9500)).toBe('FL095');
  });
});
