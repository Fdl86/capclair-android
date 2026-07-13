import { useEffect, useMemo, useState } from 'react';
import type { BranchZoneProfile } from '../domain/airspace.types';
import type { AircraftProfile, FuelPlanConfig } from '../domain/aircraft.types';
import type { AerodromeWeather } from '../domain/weather.types';
import type { NavPoint, NavRoute } from '../domain/navigation.types';
import { Page } from '../components/layout/Page';
import { BranchTable } from '../components/navigation/BranchTable';
import { ZoneCompleteRouteBanner } from '../components/navigation/ZoneCompleteRouteBanner';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Accordion } from '../components/ui/Accordion';
import { buildZoneProfiles } from '../services/airspace/airspaceEngine';
import { computeFuelPlan } from '../services/navigation/fuelPlanning';
import { fetchTerrainProfile, type TerrainSample } from '../services/navigation/terrainService';
import { buildVerticalProfile } from '../services/navigation/verticalProfileService';
import { AircraftSelectorPanel } from '../components/flight/AircraftSelectorPanel';
import { AerodromeWeatherPanel } from '../components/flight/AerodromeWeatherPanel';
import { FuelPlanningPanel } from '../components/flight/FuelPlanningPanel';
import { findAerodrome } from '../data/aerodromeCatalog';
import { diversionMinutes } from '../services/navigation/diversion';
import type { NavLogExportResult } from '../services/export/navLogExport.types';

interface CalculationsScreenProps {
  route: NavRoute;
  weatherStatus: string;
  onSetBranchAltitude: (branchId: string, altitudeFt: number) => void;
  onRefreshWinds: () => void;
  onSetTasKt: (tasKt: number) => void;
  onSetDefaultAltitudeFt: (altitudeFt: number) => void;
  aircraftProfiles: AircraftProfile[];
  activeAircraft: AircraftProfile;
  onSelectAircraft: (profileId: string) => void;
  fuelPlanConfig: FuelPlanConfig;
  onSetFuelPlanConfig: (patch: Partial<FuelPlanConfig>) => void;
  alternateCode: string;
  aerodromeWeatherReports: Record<string, AerodromeWeather>;
  aerodromeWeatherStatus: string;
  aerodromeWeatherUpdatedAt: string | null;
  onRefreshAerodromeWeather: () => void;
  onValidate: () => void;
  onExport: () => Promise<NavLogExportResult>;
  onBackPlanning: () => void;
}

function pointByType(route: NavRoute, type: NavPoint['type']) {
  return route.points.find((point) => point.type === type);
}

function aerodromeName(code: string) {
  return findAerodrome(code)?.cartoName;
}

function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}:${String(mins).padStart(2, '0')}`;
}

function timeZulu(iso?: string) {
  if (!iso) return '-';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '-';
  return `${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}Z`;
}

function SummaryCard({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="navlog-summary-card">
      <span>{label}</span>
      <strong>{value}</strong>
      {detail && <small>{detail}</small>}
    </div>
  );
}

export function CalculationsScreen({
  route,
  weatherStatus,
  onSetBranchAltitude,
  onRefreshWinds,
  onSetTasKt,
  onSetDefaultAltitudeFt,
  aircraftProfiles,
  activeAircraft,
  onSelectAircraft,
  fuelPlanConfig,
  onSetFuelPlanConfig,
  alternateCode,
  aerodromeWeatherReports,
  aerodromeWeatherStatus,
  aerodromeWeatherUpdatedAt,
  onRefreshAerodromeWeather,
  onValidate,
  onExport,
  onBackPlanning
}: CalculationsScreenProps) {
  const departure = pointByType(route, 'depart');
  const destination = pointByType(route, 'destination');
  const windModelTime = route.branches.find((branch) => branch.wind?.sourceTimeIso)?.wind?.sourceTimeIso;
  const [zoneProfiles, setZoneProfiles] = useState<Record<string, BranchZoneProfile>>({});
  const [zoneStatus, setZoneStatus] = useState('Calcul zones...');
  const [terrain, setTerrain] = useState<TerrainSample[]>([]);
  const [shownZoneCount, setShownZoneCount] = useState(0);
  const [pdfExporting, setPdfExporting] = useState(false);
  const [pdfExportStatus, setPdfExportStatus] = useState<{ kind: 'success' | 'warning' | 'error'; message: string } | null>(null);

  const handlePdfExport = async () => {
    if (pdfExporting) return;
    setPdfExporting(true);
    setPdfExportStatus({ kind: 'warning', message: 'Préparation du PDF...' });
    try {
      const result = await onExport();
      setPdfExportStatus({
        kind: result.warnings.length ? 'warning' : 'success',
        message: `${result.fileName} - ${result.message}`
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || 'Erreur inconnue');
      setPdfExportStatus({ kind: 'error', message: `Génération PDF impossible : ${message}` });
    } finally {
      setPdfExporting(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    fetchTerrainProfile(route)
      .then((samples) => {
        if (!cancelled) setTerrain(samples);
      })
      .catch(() => {
        if (!cancelled) setTerrain([]);
      });

    return () => {
      cancelled = true;
    };
  }, [route]);

  useEffect(() => {
    let cancelled = false;
    setZoneStatus('Calcul zones...');
    buildZoneProfiles(route)
      .then((profiles) => {
        if (cancelled) return;
        setZoneProfiles(profiles);
        setZoneStatus('Zones calculées');
      })
      .catch(() => {
        if (cancelled) return;
        setZoneProfiles({});
        setZoneStatus('Zones à confirmer');
      });

    return () => {
      cancelled = true;
    };
  }, [route]);

  const verticalProfile = useMemo(() => buildVerticalProfile(route, activeAircraft), [route, activeAircraft]);
  const fuel = useMemo(
    () => computeFuelPlan(
      route,
      activeAircraft,
      fuelPlanConfig,
      diversionMinutes(destination?.code, alternateCode, route.profile.tasKt || activeAircraft.cruiseTasKt)
    ),
    [route, activeAircraft, fuelPlanConfig, destination?.code, alternateCode]
  );

  return (
    <Page title="Log de nav" subtitle="Préparation VFR - calculs, vent et frise zones complète.">
      <div className="navlog-screen">
        <div className="navlog-summary-grid">
          <SummaryCard label="Départ" value={departure?.code ?? '----'} detail={departure?.nom} />
          <SummaryCard label="Arrivée" value={destination?.code ?? '----'} detail={destination?.nom} />
          <SummaryCard label="TAS" value={`${route.profile.tasKt} kt`} />
          <SummaryCard label="Altitude défaut" value={`${route.profile.defaultAltitudeFt} ft`} />
          <SummaryCard label="Distance totale" value={`${route.distanceTotale.toFixed(1)} NM`} />
          <SummaryCard label="Temps estimé" value={formatDuration(route.tempsEstimeMin)} />
          <SummaryCard label="Vent modèle" value={windModelTime ? timeZulu(windModelTime) : 'À charger'} detail={weatherStatus} />
          <SummaryCard label="Avion" value={activeAircraft.label} detail={`${activeAircraft.fuelBurnLh} L/h`} />
          <SummaryCard label={fuel.isOverCapacity ? "Carburant impossible" : "Emport carburant"} value={`${fuel.lines.fuelRequired.liters.toFixed(0)} L`} detail={fuel.isOverCapacity ? `Dépasse la capacité utile de ${fuel.fuelDeficitL.toFixed(0)} L` : `Total nécessaire ${fuel.lines.totalNecessary.minutes} min`} />
        </div>

        <Card className="navlog-prep-card">
          <div className="navlog-prep-grid">
            <AircraftSelectorPanel
              profiles={aircraftProfiles}
              activeProfile={activeAircraft}
              onSelectProfile={onSelectAircraft}
            />
            <div className="cockpit-stepper-grid navlog-stepper-grid">
              <div className="cockpit-stepper">
                <span>TAS</span>
                <div>
                  <button type="button" onClick={() => onSetTasKt(route.profile.tasKt - 1)} aria-label="Réduire la TAS">-</button>
                  <strong>{route.profile.tasKt}</strong>
                  <button type="button" onClick={() => onSetTasKt(route.profile.tasKt + 1)} aria-label="Augmenter la TAS">+</button>
                </div>
              </div>
              <div className="cockpit-stepper">
                <span>Alt défaut</span>
                <div>
                  <button type="button" onClick={() => onSetDefaultAltitudeFt(route.profile.defaultAltitudeFt - 100)} aria-label="Réduire l'altitude">-</button>
                  <strong>{route.profile.defaultAltitudeFt}</strong>
                  <button type="button" onClick={() => onSetDefaultAltitudeFt(route.profile.defaultAltitudeFt + 100)} aria-label="Augmenter l'altitude">+</button>
                </div>
              </div>
            </div>
          </div>
        </Card>

        <Accordion title="Devis carburant" className="fuel-card" defaultOpen storageKey="capclair.accordion.navlog.fuel.v1">
          <FuelPlanningPanel fuel={fuel} config={fuelPlanConfig} onChangeConfig={onSetFuelPlanConfig} />
        </Accordion>

        <Accordion
          title="Tableau de navigation"
          subtitle={route.nom}
          className="navlog-card"
          action={<Button variant="secondary" onClick={onRefreshWinds}>Maj vent</Button>}
          defaultOpen
          storageKey="capclair.accordion.navlog.table.v1"
        >
          <div className="navlog-table-scroll">
            <BranchTable route={route} zoneProfiles={zoneProfiles} onSetBranchAltitude={onSetBranchAltitude} />
          </div>
        </Accordion>

        <Accordion
          title="Frise zones"
          subtitle={shownZoneCount ? `${shownZoneCount} zones sur la nav` : zoneStatus}
          className="zone-banner-card"
          action={<Button variant="secondary" onClick={onBackPlanning}>Modifier route</Button>}
          defaultOpen
          storageKey="capclair.accordion.navlog.zones.v1"
        >
          {Object.keys(zoneProfiles).length ? (
            <ZoneCompleteRouteBanner
              route={route}
              profiles={zoneProfiles}
              terrain={terrain}
              profile={verticalProfile}
              onVisibleCountChange={setShownZoneCount}
            />
          ) : (
            <div className="zone-banner-loading">{zoneStatus}</div>
          )}
        </Accordion>

        <div className="navlog-bottom-grid navlog-bottom-grid-wide">
          <Accordion title="Météo terrains" className="navlog-weather-card" defaultOpen storageKey="capclair.accordion.navlog.weather.v1">
            <AerodromeWeatherPanel
              items={[
                ...(departure?.code ? [{ role: 'Départ', code: departure.code, name: aerodromeName(departure.code) }] : []),
                ...(destination?.code ? [{ role: 'Arrivée', code: destination.code, name: aerodromeName(destination.code) }] : []),
                ...(alternateCode ? [{ role: 'Dégagement', code: alternateCode, name: aerodromeName(alternateCode) }] : [])
              ]}
              reports={aerodromeWeatherReports}
              status={aerodromeWeatherStatus}
              updatedAtIso={aerodromeWeatherUpdatedAt}
              onRefresh={onRefreshAerodromeWeather}
            />
          </Accordion>
        </div>

        <div className="navlog-actions">
          <Button variant="secondary" onClick={onBackPlanning}>Retour planification</Button>
          <div>
            <Button variant="secondary" onClick={handlePdfExport} disabled={pdfExporting}>{pdfExporting ? 'Préparation PDF...' : 'Exporter PDF'}</Button>
            <Button variant="primary" onClick={onValidate}>Valider et passer au suivi</Button>
          </div>
        </div>
        {pdfExportStatus && (
          <p className={`navlog-pdf-status is-${pdfExportStatus.kind}`} role="status" aria-live="polite">
            {pdfExportStatus.message}
          </p>
        )}

        <Card className="safety-card">
          <strong>Info frise</strong>
          <p>Les zones sont calculées par position et altitude de branche. Les fréquences sont affichées seulement lorsqu'une fréquence exploitable est liée à la zone ; sinon le log indique à confirmer.</p>
        </Card>
      </div>
    </Page>
  );
}
