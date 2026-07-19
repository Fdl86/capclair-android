import type { AircraftProfile } from '../domain/aircraft.types';
import { useLocalStorageState } from './useLocalStorageState';

const STORAGE_KEY = 'capclair.aircraftProfiles.v1';

export const DEFAULT_AIRCRAFT_PROFILES: AircraftProfile[] = [
  {
    id: 'evektor-sportstar',
    label: 'Evektor SportStar',
    registration: '',
    model: 'Evektor SportStar',
    cruiseTasKt: 105,
    fuelBurnLh: 18,
    usableFuelL: 120,
    unusableFuelL: 0,
    reserveMinutes: 30,
    climbSpeedKt: 65,
    climbRateFpm: 700,
    descentSpeedKt: 80,
    descentRateFpm: 500,
    notes: 'Valeurs de base à vérifier avec le manuel de vol.'
  },
  {
    id: 'c150',
    label: 'C150',
    registration: '',
    model: 'Cessna 150',
    cruiseTasKt: 90,
    fuelBurnLh: 24,
    usableFuelL: 85,
    unusableFuelL: 0,
    reserveMinutes: 30,
    climbSpeedKt: 70,
    climbRateFpm: 500,
    descentSpeedKt: 80,
    descentRateFpm: 500,
    notes: 'Valeurs de base à vérifier avec le manuel de vol.'
  }
];

function createId() {
  return `aircraft-${Date.now().toString(36)}`;
}

function ensureProfiles(profiles: AircraftProfile[]) {
  return profiles.length ? profiles : DEFAULT_AIRCRAFT_PROFILES;
}

function profileLabel(profile: AircraftProfile) {
  const model = profile.model.trim() || 'Avion sans nom';
  return profile.registration.trim() ? `${model} ${profile.registration.trim()}` : model;
}

export function useAircraftProfiles() {
  const [profiles, setProfiles] = useLocalStorageState<AircraftProfile[]>(STORAGE_KEY, DEFAULT_AIRCRAFT_PROFILES);
  const [activeAircraftId, setActiveAircraftId] = useLocalStorageState<string>('capclair.activeAircraftId.v1', DEFAULT_AIRCRAFT_PROFILES[0].id);
  const safeProfiles = ensureProfiles(profiles);
  const activeProfile = safeProfiles.find((profile) => profile.id === activeAircraftId) ?? safeProfiles[0];

  const selectProfile = (profileId: string) => {
    const next = safeProfiles.find((profile) => profile.id === profileId);
    if (next) setActiveAircraftId(next.id);
    return next ?? activeProfile;
  };

  const updateProfile = (profileId: string, patch: Partial<AircraftProfile>) => {
    setProfiles((current) => ensureProfiles(current).map((profile) => {
      if (profile.id !== profileId) return profile;
      const next = { ...profile, ...patch };
      return { ...next, label: profileLabel(next) };
    }));
  };

  const createProfile = () => {
    const profile: AircraftProfile = {
      ...DEFAULT_AIRCRAFT_PROFILES[0],
      id: createId(),
      label: 'Nouvel avion',
      registration: '',
      model: 'Nouvel avion'
    };
    setProfiles((current) => [...ensureProfiles(current), profile]);
    setActiveAircraftId(profile.id);
    return profile;
  };

  const deleteProfile = (profileId: string) => {
    if (safeProfiles.length <= 1) return activeProfile;
    const remaining = safeProfiles.filter((profile) => profile.id !== profileId);
    const selected = activeProfile.id === profileId ? remaining[0] : activeProfile;
    setProfiles(remaining);
    if (activeProfile.id === profileId) setActiveAircraftId(selected.id);
    return selected;
  };

  return {
    profiles: safeProfiles,
    activeProfile,
    activeAircraftId: activeProfile.id,
    selectProfile,
    updateProfile,
    createProfile,
    deleteProfile
  };
}
