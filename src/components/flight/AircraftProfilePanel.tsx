import type { AircraftProfile } from '../../domain/aircraft.types';
import { Button } from '../ui/Button';

interface AircraftProfilePanelProps {
  profiles: AircraftProfile[];
  activeProfile: AircraftProfile;
  onSelectProfile: (profileId: string) => void;
  onUpdateProfile: (profileId: string, patch: Partial<AircraftProfile>) => void;
  onCreateProfile: () => void;
}

function numberValue(value: string, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function Field({ label, value, unit, onChange, step = 1 }: {
  label: string;
  value: number;
  unit?: string;
  step?: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="aircraft-field">
      <span>{label}</span>
      <div>
        <input type="number" step={step} value={value} onChange={(event) => onChange(numberValue(event.target.value, value))} />
        {unit && <small>{unit}</small>}
      </div>
    </label>
  );
}

export function AircraftProfilePanel({
  profiles,
  activeProfile,
  onSelectProfile,
  onUpdateProfile,
  onCreateProfile
}: AircraftProfilePanelProps) {
  return (
    <div className="aircraft-profile-panel">
      <div className="subpanel-title-row">
        <div>
          <span>Profil aéronef</span>
          <strong>{activeProfile.label}</strong>
        </div>
        <Button variant="secondary" onClick={onCreateProfile}>+ Avion</Button>
      </div>

      <select className="aircraft-select" value={activeProfile.id} onChange={(event) => onSelectProfile(event.target.value)}>
        {profiles.map((profile) => (
          <option key={profile.id} value={profile.id}>{profile.label}</option>
        ))}
      </select>

      <div className="aircraft-identity-grid">
        <label>
          <span>Modèle</span>
          <input value={activeProfile.model} onChange={(event) => onUpdateProfile(activeProfile.id, { model: event.target.value })} />
        </label>
        <label>
          <span>Immat</span>
          <input value={activeProfile.registration} onChange={(event) => onUpdateProfile(activeProfile.id, { registration: event.target.value.toUpperCase() })} />
        </label>
      </div>

      <div className="aircraft-field-grid">
        <Field label="TAS croisière" value={activeProfile.cruiseTasKt} unit="kt" onChange={(value) => onUpdateProfile(activeProfile.id, { cruiseTasKt: value })} />
        <Field label="Conso" value={activeProfile.fuelBurnLh} unit="L/h" onChange={(value) => onUpdateProfile(activeProfile.id, { fuelBurnLh: value })} />
        <Field label="Carburant utile" value={activeProfile.usableFuelL} unit="L" onChange={(value) => onUpdateProfile(activeProfile.id, { usableFuelL: value })} />
        <Field label="Carburant inutilisable" value={activeProfile.unusableFuelL ?? 0} unit="L" onChange={(value) => onUpdateProfile(activeProfile.id, { unusableFuelL: value })} />
        <Field label="Réserve défaut" value={activeProfile.reserveMinutes} unit="min" onChange={(value) => onUpdateProfile(activeProfile.id, { reserveMinutes: value })} />
        <Field label="Vitesse montée" value={activeProfile.climbSpeedKt} unit="kt" onChange={(value) => onUpdateProfile(activeProfile.id, { climbSpeedKt: value })} />
        <Field label="Taux montée" value={activeProfile.climbRateFpm} unit="ft/min" step={50} onChange={(value) => onUpdateProfile(activeProfile.id, { climbRateFpm: value })} />
        <Field label="Vitesse descente" value={activeProfile.descentSpeedKt} unit="kt" onChange={(value) => onUpdateProfile(activeProfile.id, { descentSpeedKt: value })} />
        <Field label="Taux descente" value={activeProfile.descentRateFpm} unit="ft/min" step={50} onChange={(value) => onUpdateProfile(activeProfile.id, { descentRateFpm: value })} />
      </div>

      <p className="aircraft-note">Valeurs à vérifier avec le manuel de vol et les données club.</p>
    </div>
  );
}
