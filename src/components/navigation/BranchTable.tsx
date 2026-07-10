import { useEffect, useState } from 'react';
import type { BranchZoneProfile } from '../../domain/airspace.types';
import type { NavRoute } from '../../domain/navigation.types';
import { formatMagneticVariation } from '../../services/geo/magneticVariation';

interface BranchTableProps {
  route: NavRoute;
  zoneProfiles?: Record<string, BranchZoneProfile>;
  onSetBranchAltitude?: (branchId: string, altitudeFt: number) => void;
}

function pointName(route: NavRoute, id: string) {
  const point = route.points.find((item) => item.id === id);
  return point?.code ?? point?.nom ?? id.toUpperCase();
}

function minutesToClock(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}:${String(mins).padStart(2, '0')}`;
}

function windLabel(directionDeg?: number, speedKt?: number) {
  if (typeof directionDeg !== 'number' || typeof speedKt !== 'number') return '-';
  return `${String(directionDeg).padStart(3, '0')}/${speedKt}`;
}

function zoneRemark(profile?: BranchZoneProfile) {
  if (!profile?.primaryBlock) return 'Zone à confirmer';
  const primary = profile.primaryBlock;
  const classLabel = primary.classCode ? ` ${primary.classCode}` : '';
  const secondary = profile.secondaryBlocks.length ? ` +${profile.secondaryBlocks.length}` : '';
  return `${primary.zoneType} ${primary.zoneName}${classLabel}${secondary}`;
}

function BranchAltitudeInput({
  branchId,
  value,
  label,
  onCommit
}: {
  branchId: string;
  value: number;
  label: string;
  onCommit: (branchId: string, altitudeFt: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  const commit = () => {
    const parsed = Number(draft);
    if (!Number.isFinite(parsed) || parsed < 500 || parsed > 12500) {
      setDraft(String(value));
      return;
    }
    const normalized = Math.round(parsed / 100) * 100;
    setDraft(String(normalized));
    onCommit(branchId, normalized);
  };

  return (
    <input
      className="branch-alt-input"
      type="number"
      inputMode="numeric"
      min={500}
      max={12500}
      step={100}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.currentTarget.blur();
        }
      }}
      aria-label={label}
    />
  );
}

export function BranchTable({ route, zoneProfiles = {}, onSetBranchAltitude }: BranchTableProps) {
  const totalTsv = route.branches.reduce((sum, branch) => sum + branch.tempsSansVentMin, 0);

  return (
    <div className="branch-table navlog-table" role="table" aria-label="Log de navigation">
      <div className="branch-row head" role="row">
        <span>Branche</span>
        <span>ALT<br /><small>ft</small></span>
        <span>Vent<br /><small>dir/kt</small></span>
        <span>RV<br /><small>°</small></span>
        <span>Var</span>
        <span>RM<br /><small>°</small></span>
        <span>Dérive<br /><small>°</small></span>
        <span>CM<br /><small>°</small></span>
        <span>GS<br /><small>kt</small></span>
        <span>NM</span>
        <span>TSV<br /><small>hh:mm</small></span>
        <span>TAV<br /><small>hh:mm</small></span>
        <span>Fréq<br /><small>MHz</small></span>
        <span>Zone / Contact</span>
      </div>
      {route.branches.map((branch) => {
        const profile = zoneProfiles[branch.id];
        const label = `Altitude ${pointName(route, branch.from)} vers ${pointName(route, branch.to)}`;
        return (
          <div key={branch.id} className="branch-row" role="row">
            <span>{pointName(route, branch.from)} - {pointName(route, branch.to)}</span>
            <span>
              {onSetBranchAltitude ? (
                <BranchAltitudeInput
                  branchId={branch.id}
                  value={branch.altitudeFt}
                  label={label}
                  onCommit={onSetBranchAltitude}
                />
              ) : branch.altitudeFt}
            </span>
            <span>{windLabel(branch.wind?.directionDeg, branch.wind?.speedKt)}</span>
            <span>{String(branch.routeVraie).padStart(3, '0')}</span>
            <span>{formatMagneticVariation(branch.magneticVariationDeg)}</span>
            <span>{String(branch.routeMagnetique).padStart(3, '0')}</span>
            <span>{branch.derive > 0 ? '+' : ''}{branch.derive}</span>
            <span>{String(branch.capCorrige).padStart(3, '0')}</span>
            <span>{branch.vitesseSol}</span>
            <span>{branch.distanceNm.toFixed(1)}</span>
            <span>{minutesToClock(branch.tempsSansVentMin)}</span>
            <span>{minutesToClock(branch.tempsBrancheMin)}</span>
            <span>{profile?.frequencyLabel ?? branch.frequencyMhz ?? 'À confirmer'}</span>
            <span>{zoneRemark(profile)}</span>
          </div>
        );
      })}
      <div className="branch-row total" role="row">
        <span>TOTAL</span>
        <span>-</span><span>-</span><span>-</span><span>-</span><span>-</span><span>-</span><span>-</span><span>-</span>
        <span>{route.distanceTotale.toFixed(1)}</span>
        <span>{minutesToClock(totalTsv)}</span>
        <span>{minutesToClock(route.tempsEstimeMin)}</span>
        <span>-</span><span>-</span>
      </div>
    </div>
  );
}
