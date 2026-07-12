import { describe, expect, it } from 'vitest';
import type { GpsPosition } from '../../../domain/gps.types';
import { getGpsPositionUiState, getRecordingUiState } from '../gpsUiState';

const position: GpsPosition = {
  latitude: 46.58,
  longitude: 0.34,
  altitude: 100,
  altitudeAccuracy: 6,
  vitesse: 0,
  track: null,
  timestamp: 1_000,
  precision: 12
};

describe('getGpsPositionUiState', () => {
  it('shows a recent one-shot position independently from recording', () => {
    const state = getGpsPositionUiState({
      status: 'idle',
      locating: false,
      locationError: null,
      currentPosition: position,
      lastAccuracy: 12,
      lastSignalAgeSec: 4
    });

    expect(state.tone).toBe('ok');
    expect(state.label).toBe('POSITION 12 m');
  });

  it('marks a stale one-shot position without calling it an active recording', () => {
    const state = getGpsPositionUiState({
      status: 'idle',
      locating: false,
      locationError: null,
      currentPosition: position,
      lastAccuracy: 12,
      lastSignalAgeSec: 60
    });

    expect(state.tone).toBe('warn');
    expect(state.label).toBe('POSITION ANCIENNE');
  });
});

describe('getRecordingUiState', () => {
  it('keeps recording state separate from GPS position state', () => {
    expect(getRecordingUiState('idle', 0).label).toBe('NON ENREGISTRÉ');
    expect(getRecordingUiState('active', 65).label).toBe('REC 00:01:05');
  });
});
