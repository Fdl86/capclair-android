import { useEffect, useState } from 'react';
import type { AircraftProfile } from '../../domain/aircraft.types';
import { Button } from '../ui/Button';
import { ConfirmDialog } from '../ui/ConfirmDialog';

interface AircraftProfilePanelProps {
  profiles: AircraftProfile[];
  activeProfile: AircraftProfile;
  onSelectProfile: (profileId: string) => void;
  onUpdateProfile: (profileId: string, patch: Partial<AircraftProfile>) => void;
  onCreateProfile: () => void;
  onDeleteProfile: (profileId: string) => void;
}

function parseNumber(value: string): number | null {
  const parsed = Number(value.trim().replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function Field({ label, value, unit, onChange, step = 1, min, max }: {
  label: string;
  value: number;
  unit?: string;
  step?: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    setDraft(String(value));
    setInvalid(false);
  }, [value]);

  const commit = () => {
    const parsed = parseNumber(draft);
    if (parsed === null || parsed < min || parsed > max) {
      setDraft(String(value));
      setInvalid(true);
      return;
    }
    const normalized = step < 1
      ? Math.round(parsed / step) * step
      : Math.round(parsed / step) * step;
    setDraft(String(normalized));
    setInvalid(false);
    if (normalized !== value) onChange(normalized);
  };

  return (
    <label className={`aircraft-field ${invalid ? 'is-invalid' : ''}`}>
      <span>{label}</span>
      <div>
        <input
          type="text"
          inputMode={step < 1 ? 'decimal' : 'numeric'}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
            if (event.key === 'Escape') {
              setDraft(String(value));
              setInvalid(false);
            }
          }}
          aria-invalid={invalid}
        />
        {unit && <small>{unit}</small>}
      </div>
      {invalid && <em>Valeur autorisée : {min} à {max}.</em>}
    </label>
  );
}

export function AircraftProfilePanel({
  profiles,
  activeProfile,
  onSelectProfile,
  onUpdateProfile,
  onCreateProfile,
  onDeleteProfile
}: AircraftProfilePanelProps) {
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

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
        <Field label="TAS croisière" value={activeProfile.cruiseTasKt} min={45} max={220} unit="kt" onChange={(value) => onUpdateProfile(activeProfile.id, { cruiseTasKt: value })} />
        <Field label="Conso" value={activeProfile.fuelBurnLh} min={0.5} max={200} step={0.5} unit="L/h" onChange={(value) => onUpdateProfile(activeProfile.id, { fuelBurnLh: value })} />
        <Field label="Carburant utile" value={activeProfile.usableFuelL} min={0} max={1000} step={0.5} unit="L" onChange={(value) => onUpdateProfile(activeProfile.id, { usableFuelL: value })} />
        <Field label="Carburant inutilisable" value={activeProfile.unusableFuelL ?? 0} min={0} max={200} step={0.5} unit="L" onChange={(value) => onUpdateProfile(activeProfile.id, { unusableFuelL: value })} />
        <Field label="Réserve défaut" value={activeProfile.reserveMinutes} min={0} max={180} unit="min" onChange={(value) => onUpdateProfile(activeProfile.id, { reserveMinutes: value })} />
        <Field label="Vitesse montée" value={activeProfile.climbSpeedKt} min={20} max={250} unit="kt" onChange={(value) => onUpdateProfile(activeProfile.id, { climbSpeedKt: value })} />
        <Field label="Taux montée" value={activeProfile.climbRateFpm} min={50} max={3000} unit="ft/min" step={50} onChange={(value) => onUpdateProfile(activeProfile.id, { climbRateFpm: value })} />
        <Field label="Vitesse descente" value={activeProfile.descentSpeedKt} min={20} max={250} unit="kt" onChange={(value) => onUpdateProfile(activeProfile.id, { descentSpeedKt: value })} />
        <Field label="Taux descente" value={activeProfile.descentRateFpm} min={50} max={3000} unit="ft/min" step={50} onChange={(value) => onUpdateProfile(activeProfile.id, { descentRateFpm: value })} />
      </div>

      <p className="aircraft-note">Valeurs à vérifier avec le manuel de vol et les données club.</p>
      <Button variant="ghost" disabled={profiles.length <= 1} onClick={() => setDeleteConfirmOpen(true)}>Supprimer ce profil</Button>

      <ConfirmDialog
        open={deleteConfirmOpen}
        title="Supprimer ce profil avion ?"
        message={`Le profil ${activeProfile.label} sera supprimé. Les navigations et traces existantes restent conservées.`}
        confirmLabel="Supprimer le profil"
        onCancel={() => setDeleteConfirmOpen(false)}
        onConfirm={() => {
          setDeleteConfirmOpen(false);
          onDeleteProfile(activeProfile.id);
        }}
      />
    </div>
  );
}
