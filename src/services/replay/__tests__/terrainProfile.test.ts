import { describe, expect, it, vi } from 'vitest';
import type { GpsPosition } from '../../../domain/gps.types';
import type { TerrainProfileData } from '../../../domain/terrain.types';
import type { Trace } from '../../../domain/trace.types';
import { buildReplayModel } from '../traceReplayModel';
import {
  buildTerrainFingerprint,
  buildTerrainSampleLocations,
  fetchTerrainProfile,
  interpolateTerrainElevation,
  loadTerrainProfileCache,
  saveTerrainProfileCache,
  terrainCacheKey,
} from '../terrainProfile';

function point(index: number): GpsPosition {
  return {
    latitude: 46.5 + index * 0.0001,
    longitude: 0.3 + index * 0.0001,
    altitude: 500,
    altitudeAccuracy: 8,
    vitesse: 90,
    track: 45,
    timestamp: 1_000 + index * 1_000,
    precision: 6,
  };
}

function trace(pointCount: number): Trace {
  return {
    id: 'terrain-trace',
    routeId: 'route-test',
    routeName: 'Test terrain',
    date: new Date(1_000 + pointCount * 1_000).toISOString(),
    positions: Array.from({ length: pointCount }, (_, index) => point(index)),
    dureeSec: pointCount,
    distanceNm: 0,
  };
}

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
}

describe('terrain Replay sampling', () => {
  it('limits the relief profile while preserving the first and last point', () => {
    const model = buildReplayModel(trace(500));
    const samples = buildTerrainSampleLocations(model, 180);
    expect(samples.length).toBeLessThanOrEqual(180);
    expect(samples[0].latitude).toBeCloseTo(model.points[0].position.latitude, 8);
    expect(samples.at(-1)?.latitude).toBeCloseTo(model.points.at(-1)!.position.latitude, 8);
    expect(samples.at(-1)?.distanceNm).toBeCloseTo(model.totalDistanceNm, 8);
  });

  it('interpolates terrain elevation at the current replay distance', () => {
    const profile: TerrainProfileData = {
      schemaVersion: 1,
      traceId: 'terrain-trace',
      fingerprint: 'abc',
      generatedAt: '2026-07-19T00:00:00.000Z',
      source: 'open-meteo-copernicus-glo90',
      resolutionM: 90,
      points: [
        { distanceNm: 0, elevationFt: 100, latitude: 46, longitude: 0 },
        { distanceNm: 10, elevationFt: 300, latitude: 47, longitude: 1 },
      ],
    };
    expect(interpolateTerrainElevation(profile, 5)).toBe(200);
    expect(interpolateTerrainElevation(profile, -1)).toBe(100);
    expect(interpolateTerrainElevation(profile, 20)).toBe(300);
  });

  it('uses batches of at most 100 coordinates and converts metres to feet', async () => {
    const model = buildReplayModel(trace(400));
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      const count = (url.searchParams.get('latitude') ?? '').split(',').filter(Boolean).length;
      return new Response(JSON.stringify({ elevation: Array.from({ length: count }, () => 100) }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    const fingerprint = buildTerrainFingerprint('terrain-trace', model);
    const profile = await fetchTerrainProfile('terrain-trace', fingerprint, model, { fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(profile.points.length).toBeLessThanOrEqual(180);
    expect(profile.points[0].elevationFt).toBeCloseTo(328.1, 1);
  });
});

describe('terrain Replay cache', () => {
  it('restores a matching cached profile and removes a stale fingerprint', () => {
    const storage = memoryStorage();
    const profile: TerrainProfileData = {
      schemaVersion: 1,
      traceId: 'terrain-trace',
      fingerprint: 'current',
      generatedAt: '2026-07-19T00:00:00.000Z',
      source: 'open-meteo-copernicus-glo90',
      resolutionM: 90,
      points: [
        { distanceNm: 0, elevationFt: 100, latitude: 46, longitude: 0 },
        { distanceNm: 1, elevationFt: 110, latitude: 46.1, longitude: 0.1 },
      ],
    };
    saveTerrainProfileCache(profile, storage);
    expect(loadTerrainProfileCache(profile.traceId, 'current', storage)).toEqual(profile);
    expect(loadTerrainProfileCache(profile.traceId, 'old', storage)).toBeNull();
    expect(storage.values.has(terrainCacheKey(profile.traceId))).toBe(false);
  });
});
