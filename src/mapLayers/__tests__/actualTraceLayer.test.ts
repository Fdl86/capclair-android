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

    const features = layer.getSource()?.getFeatures() ?? [];
    expect(features).toHaveLength(2);
    expect(features.map((feature) => feature.getGeometry()?.getCoordinates().length)).toEqual([2, 2]);
  });

  it('appends new coordinates without rebuilding the current line geometry', () => {
    const positions = [point(0.30, 0), point(0.31, 1000)];
    const layer = createActualTraceLayer(positions);
    const geometryBefore = layer.getSource()?.getFeatureById('actual-trace-line')?.getGeometry();

    positions.push(point(0.32, 2000));
    updateActualTraceLayer(layer, positions);

    const geometryAfter = layer.getSource()?.getFeatureById('actual-trace-line')?.getGeometry();
    expect(geometryAfter).toBe(geometryBefore);
    expect(geometryAfter?.getCoordinates()).toHaveLength(3);
  });
});
