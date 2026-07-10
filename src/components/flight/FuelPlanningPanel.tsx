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

function numberValue(value: string, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function EditableMinute({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label className="fuel-input fuel-input-compact">
      <span>{label}</span>
      <div>
        <input type="number" min={0} step={1} value={value} onChange={(event) => onChange(numberValue(event.target.value, value))} />
        <small>min</small>
      </div>
    </label>
  );
}

function EditableLiter({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label className="fuel-input fuel-input-compact">
      <span>{label}</span>
      <div>
        <input type="number" min={0} step={0.5} value={value} onChange={(event) => onChange(numberValue(event.target.value, value))} />
        <small>L</small>
      </div>
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
      <div className="fuel-premium-head">
        <div>
          <span>Devis carburant</span>
          <strong>Minutes + litres</strong>
        </div>
        <em><span>Consommation horaire / minute</span>{formatLiters(fuel.fuelPerHourL)} - {fuel.fuelPerMinuteL.toFixed(2).replace('.', ',')} L/min</em>
      </div>

      <div className="fuel-input-grid fuel-input-grid-compact fuel-input-grid-minimal">
        <EditableMinute label="Réserve finale" value={config.finalReserveMin} onChange={(value) => onChangeConfig({ finalReserveMin: value })} />
        <EditableLiter label="Marge" value={config.marginLiters ?? 0} onChange={(value) => onChangeConfig({ marginLiters: value })} />
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
          <span>Autonomie de l’emport</span>
          <strong>{formatMinutes(fuel.lines.timeLimit.minutes)}</strong>
        </div>
        <div>
          <span>Capacité encore disponible</span>
          <strong>{formatLitersCompact(fuel.remainingUsableFuelL)}</strong>
        </div>
      </div>
    </div>
  );
}
