import { describe, expect, it } from 'vitest';
import type { Style } from 'ol/style';
import type { GpsPosition } from '../../domain/gps.types';
import { createActualTraceLayer, updateActualTraceLayer } from '../actualTraceLayer';

function point(longitude: number, timestamp: number): GpsPosition {
  return {
    latitude: 46.58,
    longitude,
    altitude: 1000,
    altitudeAccuracy: 8,
    vitesse: 90,
    track: 180,
    timestamp,
    precision: 6
  };
}

describe('actual trace layer', () => {
  it('uses a magenta trace above a dark readability halo', () => {
    const layer = createActualTraceLayer([point(0.30, 0), point(0.31, 1000)]);
    const style = layer.getStyle();

    expect(Array.isArray(style)).toBe(true);
    const styles = style as Style[];
    expect(styles).toHaveLength(2);
    expect(styles[0].getStroke()?.getWidth()).toBe(7);
    expect(styles[1].getStroke()?.getColor()).toBe('#FF3FA4');
    expect(styles[1].getStroke()?.getWidth()).toBe(4);
  });

  it('keeps GPS gaps as separate line segments after an update', () => {
    const layer = createActualTraceLayer();
    updateActualTraceLayer(layer, [
      point(0.30, 0),
      point(0.31, 1000),
      point(0.40, 20_000),
      point(0.41, 21_000)
    ]);

    const feature = layer.getSource()?.getFeatureById('actual-trace-line');
    const geometry = feature?.getGeometry();
    expect(geometry?.getLineStrings()).toHaveLength(2);
  });
});
