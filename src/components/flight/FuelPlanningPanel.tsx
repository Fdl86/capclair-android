import { useEffect, useState } from 'react';
import type { FuelLine, FuelPlanConfig, FuelPlanSummary } from '../../domain/aircraft.types';

interface FuelPlanningPanelProps {
  fuel: FuelPlanSummary;
  config: FuelPlanConfig;
  onChangeConfig: (patch: Partial<FuelPlanConfig>) => void;
}

function formatLiters(value: number) {
  return `${value.toFixed(1).replace('.', ',')} L`;
}

function formatLitersCompact(value: number) {
  return `${Math.round(value)} L`;
}

function formatMinutes(value: number | null) {
  return value === null ? '-' : `${Math.round(value)} min`;
}

function EditableValue({ label, value, unit, step, max, onChange }: {
  label: string;
  value: number;
  unit: string;
  step: number;
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
    const parsed = Number(draft.trim().replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > max) {
      setDraft(String(value));
      setInvalid(true);
      return;
    }
    const normalized = Math.round(parsed / step) * step;
    setDraft(String(normalized));
    setInvalid(false);
    if (normalized !== value) onChange(normalized);
  };

  return (
    <label className={`fuel-input fuel-input-compact ${invalid ? 'is-invalid' : ''}`}>
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
        <small>{unit}</small>
      </div>
      {invalid && <em>Valeur comprise entre 0 et {max}.</em>}
    </label>
  );
}

function FuelRow({ line, strong = false }: { line: FuelLine; strong?: boolean }) {
  return (
    <div className={`fuel-row ${strong ? 'strong' : ''}`}>
      <span>{line.label}</span>
      <strong>{formatMinutes(line.minutes)}</strong>
      <b>{formatLiters(line.liters)}</b>
    </div>
  );
}

export function FuelPlanningPanel({ fuel, config, onChangeConfig }: FuelPlanningPanelProps) {
  return (
    <div className="fuel-planning-panel fuel-planning-panel-compact">
      {!fuel.calculationValid && (
        <div className="fuel-calculation-warning" role="alert">
          {fuel.calculationWarning ?? 'Devis carburant non calculable.'}
        </div>
      )}
      <div className="fuel-premium-head">
        <div>
          <span>Devis carburant</span>
          <strong>Minutes + litres</strong>
        </div>
        <em><span>Consommation horaire / minute</span>{formatLiters(fuel.fuelPerHourL)} - {fuel.fuelPerMinuteL.toFixed(2).replace('.', ',')} L/min</em>
      </div>

      <div className="fuel-input-grid fuel-input-grid-compact fuel-input-grid-minimal">
        <EditableValue label="Réserve finale" value={config.finalReserveMin} unit="min" step={1} max={180} onChange={(value) => onChangeConfig({ finalReserveMin: value })} />
        <EditableValue label="Marge" value={config.marginLiters ?? 0} unit="L" step={0.5} max={500} onChange={(value) => onChangeConfig({ marginLiters: value })} />
      </div>

      <div className="fuel-table fuel-table-compact">
        <FuelRow line={fuel.lines.route} />
        <FuelRow line={fuel.lines.taxiDeparture} />
        <FuelRow line={fuel.lines.arrival} />
        <FuelRow line={fuel.lines.diversion} />
        <FuelRow line={fuel.lines.alternateArrival} />
        <FuelRow line={fuel.lines.finalReserve} />
        <FuelRow line={fuel.lines.totalNecessary} strong />
        <FuelRow line={fuel.lines.margin} />
        <FuelRow line={fuel.lines.fuelRequired} strong />
      </div>

      <div className="fuel-kpi-strip">
        <div>
          <span>Emport carburant</span>
          <strong>{formatLitersCompact(fuel.lines.fuelRequired.liters)}</strong>
        </div>
        <div>
          <span>Autonomie de l'emport</span>
          <strong>{formatMinutes(fuel.lines.timeLimit.minutes)}</strong>
        </div>
        <div className={fuel.isOverCapacity ? 'is-danger' : undefined}>
          <span>{fuel.isOverCapacity ? 'Déficit capacité' : 'Capacité encore disponible'}</span>
          <strong>{formatLitersCompact(fuel.isOverCapacity ? fuel.fuelDeficitL : fuel.remainingUsableFuelL)}</strong>
        </div>
      </div>
    </div>
  );
}
