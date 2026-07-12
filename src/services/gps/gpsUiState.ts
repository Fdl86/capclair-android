import type { GpsPosition, GpsStatus } from '../../domain/gps.types';

export type GpsUiTone = 'ok' | 'warn' | 'off' | 'idle';
export type RecordingUiTone = 'rec' | 'warn' | 'ok' | 'off';

export interface GpsPositionUiInput {
  status: GpsStatus;
  locating: boolean;
  locationError: string | null;
  currentPosition: GpsPosition | null;
  lastAccuracy: number | null;
  lastSignalAgeSec: number | null;
}

export interface GpsPositionUiState {
  tone: GpsUiTone;
  label: string;
  detail: string;
}

export interface RecordingUiState {
  tone: RecordingUiTone;
  label: string;
  controlState: 'idle' | 'requesting' | 'recording' | 'saving' | 'error';
}

function roundedAccuracy(value: number | null): string | null {
  return typeof value === 'number' && Number.isFinite(value) ? `${Math.round(value)} m` : null;
}

export function formatRecordingDuration(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function getGpsPositionUiState(input: GpsPositionUiInput): GpsPositionUiState {
  const accuracy = roundedAccuracy(input.lastAccuracy);
  const age = input.lastSignalAgeSec;
  const ageDetail = age !== null ? `Dernière position il y a ${age} s` : 'Aucune position récente';

  if (input.locating || input.status === 'requesting') {
    return { tone: 'warn', label: 'LOCALISATION...', detail: 'Acquisition de la position en cours' };
  }

  if (input.status === 'simulating') {
    return { tone: 'ok', label: 'SIMULATION', detail: 'Position simulée' };
  }

  if (input.status === 'active') {
    return {
      tone: 'ok',
      label: accuracy ? `GPS ${accuracy}` : 'GPS ACTIF',
      detail: accuracy ? `Précision horizontale ${accuracy}` : ageDetail
    };
  }

  if (input.status === 'degraded') {
    return {
      tone: 'warn',
      label: accuracy ? `GPS ${accuracy}` : 'GPS DÉGRADÉ',
      detail: accuracy ? `Précision horizontale ${accuracy}` : ageDetail
    };
  }

  if (input.status === 'frozen') {
    return { tone: 'warn', label: 'SIGNAL GPS PERDU', detail: ageDetail };
  }

  if (input.locationError) {
    return { tone: 'off', label: 'GPS INDISPONIBLE', detail: input.locationError };
  }

  if (input.status === 'denied') {
    return { tone: 'off', label: 'GPS REFUSÉ', detail: 'Autorisation de localisation refusée' };
  }

  if (input.status === 'unavailable') {
    return { tone: 'off', label: 'GPS INDISPONIBLE', detail: ageDetail };
  }

  if (input.currentPosition) {
    if (age === null || age <= 30) {
      return {
        tone: 'ok',
        label: accuracy ? `POSITION ${accuracy}` : 'POSITION ACQUISE',
        detail: accuracy ? `Position ponctuelle - précision ${accuracy}` : ageDetail
      };
    }

    if (age <= 120) {
      return { tone: 'warn', label: 'POSITION ANCIENNE', detail: ageDetail };
    }
  }

  return { tone: 'idle', label: 'POSITION INACTIVE', detail: ageDetail };
}

export function getRecordingUiState(status: GpsStatus, elapsedSeconds: number): RecordingUiState {
  if (status === 'requesting') {
    return { tone: 'warn', label: 'ACQUISITION', controlState: 'requesting' };
  }

  if (status === 'active' || status === 'degraded' || status === 'frozen' || status === 'simulating') {
    return {
      tone: 'rec',
      label: `REC ${formatRecordingDuration(elapsedSeconds)}`,
      controlState: 'recording'
    };
  }

  if (status === 'simulation-complete') {
    return { tone: 'warn', label: 'TRACE À SAUVER', controlState: 'recording' };
  }

  if (status === 'saving') {
    return { tone: 'warn', label: 'SAUVEGARDE', controlState: 'saving' };
  }

  if (status === 'save-error') {
    return { tone: 'off', label: 'ERREUR TRACE', controlState: 'error' };
  }

  if (status === 'stopped') {
    return { tone: 'ok', label: 'TRACE SAUVÉE', controlState: 'idle' };
  }

  return { tone: 'off', label: 'NON ENREGISTRÉ', controlState: 'idle' };
}
