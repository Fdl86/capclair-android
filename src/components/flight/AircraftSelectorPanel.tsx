import type { AircraftProfile } from '../../domain/aircraft.types';

interface AircraftSelectorPanelProps {
  profiles: AircraftProfile[];
  activeProfile: AircraftProfile;
  onSelectProfile: (profileId: string) => void;
}

export function AircraftSelectorPanel({ profiles, activeProfile, onSelectProfile }: AircraftSelectorPanelProps) {
  return (
    <div className="aircraft-selector-panel">
      <label>
        <span>Avion</span>
        <select value={activeProfile.id} onChange={(event) => onSelectProfile(event.target.value)}>
          {profiles.map((profile) => (
            <option key={profile.id} value={profile.id}>{profile.label}</option>
          ))}
        </select>
      </label>
    </div>
  );
}
