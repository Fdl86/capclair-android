import { describe, expect, it } from 'vitest';
import { aircraftScaleForZoom } from '../aircraftIcon';

describe('aircraftScaleForZoom', () => {
  it('renders the Evektor at the approved 26/32/38 px width range', () => {
    expect(aircraftScaleForZoom(6) * 144).toBeCloseTo(26, 1);
    expect(aircraftScaleForZoom(10) * 144).toBeCloseTo(32, 1);
    expect(aircraftScaleForZoom(14) * 144).toBeCloseTo(38, 1);
  });
});
