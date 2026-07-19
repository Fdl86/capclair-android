import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { NavRoute } from '../domain/navigation.types';
import type { GpsPosition } from '../domain/gps.types';
import type { MapBaseLayer } from '../mapEngine/mapTypes';
import { AERODROMES } from '../data/aerodromeCatalog';
import { Page } from '../components/layout/Page';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { OpenLayersMap } from '../components/map/OpenLayersMap';
import { MapLayerToggle } from '../components/map/MapLayerToggle';
import { RoutePointList } from '../components/navigation/RoutePointList';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';

interface PlanningScreenProps {
  route: NavRoute;
  selectedPointId: string | null;
  routeMessage: string;
  onSelectPoint: (pointId: string) => void;
  onSetDepartureCode: (code: string) => boolean;
  onSetDestinationCode: (code: string) => boolean;
  onAddWaypointAt: (longitude: number, latitude: number) => void;
  onRemovePoint: (pointId: string) => void;
  onReverseRoute: () => void;
  onResetRoute: () => void;
  alternateCode: string;
  onSetAlternateCode: (code: string) => boolean;
  onCalculations: () => void;
  mapBaseLayer: MapBaseLayer;
  onMapBaseLayerChange: (value: MapBaseLayer) => void;
  aircraftPosition: GpsPosition | null;
  onRequestPosition: () => Promise<GpsPosition | null>;
  locating: boolean;
  locationError: string | null;
}

function endpointCode(route: NavRoute, type: 'depart' | 'destination') {
  return route.points.find((point) => point.type === type)?.code ?? '';
}

function formatDuration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}:${String(mins).padStart(2, '0')}`;
}

const EMPTY_TRACE: GpsPosition[] = [];
type AerodromeField = 'departure' | 'destination' | 'alternate';

function aerodromeSuggestions(query: string) {
  const normalized = query.trim().toUpperCase();
  if (normalized.length < 2) return [];
  return AERODROMES.filter((aerodrome) => (
    aerodrome.code.includes(normalized)
    || aerodrome.cartoName.toUpperCase().includes(normalized)
  )).slice(0, 5);
}

export function PlanningScreen({
  route,
  selectedPointId,
  routeMessage,
  onSelectPoint,
  onSetDepartureCode,
  onSetDestinationCode,
  onAddWaypointAt,
  onRemovePoint,
  onReverseRoute,
  onResetRoute,
  alternateCode,
  onSetAlternateCode,
  onCalculations,
  mapBaseLayer,
  onMapBaseLayerChange,
  aircraftPosition,
  onRequestPosition,
  locating,
  locationError
}: PlanningScreenProps) {
  const [addWaypointMode, setAddWaypointMode] = useState(false);
  const [departureInput, setDepartureInput] = useState(endpointCode(route, 'depart'));
  const [destinationInput, setDestinationInput] = useState(endpointCode(route, 'destination'));
  const [alternateInput, setAlternateInput] = useState(alternateCode);
  const [activeAerodromeField, setActiveAerodromeField] = useState<AerodromeField | null>(null);
  const [aerodromeError, setAerodromeError] = useState<string | null>(null);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const skipNextAerodromeBlur = useRef(false);

  useEffect(() => {
    setDepartureInput(endpointCode(route, 'depart'));
    setDestinationInput(endpointCode(route, 'destination'));
  }, [route.points]);

  useEffect(() => {
    setAlternateInput(alternateCode);
  }, [alternateCode]);

  const activeAerodromeInput = activeAerodromeField === 'departure'
    ? departureInput
    : activeAerodromeField === 'destination'
      ? destinationInput
      : activeAerodromeField === 'alternate'
        ? alternateInput
        : '';
  const suggestions = useMemo(() => aerodromeSuggestions(activeAerodromeInput), [activeAerodromeInput]);

  const applyDeparture = () => {
    if (skipNextAerodromeBlur.current) {
      skipNextAerodromeBlur.current = false;
      return;
    }
    const normalized = departureInput.trim().toUpperCase();
    const accepted = normalized.length >= 4 && onSetDepartureCode(normalized);
    if (!accepted) {
      setDepartureInput(endpointCode(route, 'depart'));
      setAerodromeError(normalized ? `Départ inconnu ou invalide : ${normalized}` : null);
    } else {
      setAerodromeError(null);
    }
    setActiveAerodromeField(null);
  };

  const applyDestination = () => {
    if (skipNextAerodromeBlur.current) {
      skipNextAerodromeBlur.current = false;
      return;
    }
    const normalized = destinationInput.trim().toUpperCase();
    const accepted = normalized.length >= 4 && onSetDestinationCode(normalized);
    if (!accepted) {
      setDestinationInput(endpointCode(route, 'destination'));
      setAerodromeError(normalized ? `Arrivée inconnue ou invalide : ${normalized}` : null);
    } else {
      setAerodromeError(null);
    }
    setActiveAerodromeField(null);
  };

  const applyAlternate = () => {
    if (skipNextAerodromeBlur.current) {
      skipNextAerodromeBlur.current = false;
      return;
    }
    const normalized = alternateInput.trim().toUpperCase();
    if (!normalized) {
      onSetAlternateCode('');
      setAerodromeError(null);
      setActiveAerodromeField(null);
      return;
    }
    const accepted = normalized.length >= 4 && onSetAlternateCode(normalized);
    if (!accepted) {
      setAlternateInput(alternateCode);
      setAerodromeError(`Dégagement inconnu : ${normalized}`);
    } else {
      setAerodromeError(null);
    }
    setActiveAerodromeField(null);
  };

  const chooseAerodrome = (field: AerodromeField, code: string) => {
    skipNextAerodromeBlur.current = true;
    if (field === 'departure') {
      setDepartureInput(code);
      onSetDepartureCode(code);
    }
    if (field === 'destination') {
      setDestinationInput(code);
      onSetDestinationCode(code);
    }
    if (field === 'alternate') {
      setAlternateInput(code);
      onSetAlternateCode(code);
    }
    setAerodromeError(null);
    setActiveAerodromeField(null);
    if (typeof document !== 'undefined') {
      (document.activeElement as HTMLElement | null)?.blur?.();
    }
  };

  const handleAddWaypoint = useCallback((longitude: number, latitude: number) => {
    onAddWaypointAt(longitude, latitude);
  }, [onAddWaypointAt]);

  return (
    <Page title="Planification" subtitle="Carte aéro, route, dégagement et points de navigation.">
      <div className="planning-layout">
        <div className="map-card tall planning-map-card">
          <MapLayerToggle baseLayer={mapBaseLayer} onChange={onMapBaseLayerChange} />
          <OpenLayersMap
            route={route}
            trace={EMPTY_TRACE}
            aircraft={aircraftPosition}
            selectedPointId={selectedPointId}
            baseLayer={mapBaseLayer}
            addWaypointMode={addWaypointMode}
            onMapAddWaypoint={handleAddWaypoint}
            allowUserRotation={false}
            onRequestPosition={onRequestPosition}
            locating={locating}
            locationError={locationError}
          />
          <button
            type="button"
            className={`planning-map-add-button ${addWaypointMode ? 'active' : ''}`}
            onClick={() => setAddWaypointMode((value) => !value)}
            aria-pressed={addWaypointMode}
          >
            {addWaypointMode ? 'Terminer' : '+ Point'}
          </button>
        </div>

        <Card className="route-panel compact-route-panel">
          <div className="panel-title-row">
            <div>
              <span>Route active</span>
              <strong>{route.nom}</strong>
            </div>
            <button type="button" onClick={onCalculations}>Log de nav</button>
          </div>

          <div className="route-builder">
            <label>
              <span>Départ</span>
              <input
                value={departureInput}
                onChange={(event) => setDepartureInput(event.target.value.toUpperCase())}
                onBlur={applyDeparture}
                onKeyDown={(event) => { if (event.key === 'Enter') applyDeparture(); }}
                maxLength={4}
                onFocus={() => setActiveAerodromeField('departure')}
                inputMode="text"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
              />
            </label>
            <label>
              <span>Arrivée</span>
              <input
                value={destinationInput}
                onChange={(event) => setDestinationInput(event.target.value.toUpperCase())}
                onBlur={applyDestination}
                onKeyDown={(event) => { if (event.key === 'Enter') applyDestination(); }}
                maxLength={4}
                onFocus={() => setActiveAerodromeField('destination')}
                inputMode="text"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
              />
            </label>
            <label>
              <span>Dégagement</span>
              <input
                value={alternateInput}
                onChange={(event) => setAlternateInput(event.target.value.toUpperCase())}
                onBlur={applyAlternate}
                onKeyDown={(event) => { if (event.key === 'Enter') applyAlternate(); }}
                maxLength={4}
                onFocus={() => setActiveAerodromeField('alternate')}
                inputMode="text"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
              />
            </label>
            <Button variant="ghost" className="route-builder-reverse" onClick={onReverseRoute}>Inverser</Button>
          </div>

          {activeAerodromeField && suggestions.length > 0 && (
            <div className="aerodrome-suggestions" role="listbox" aria-label="Suggestions aérodromes">
              {suggestions.map((aerodrome) => (
                <button
                  key={`${activeAerodromeField}-${aerodrome.code}`}
                  type="button"
                  onPointerDown={(event) => {
                    event.preventDefault();
                    chooseAerodrome(activeAerodromeField, aerodrome.code);
                  }}
                >
                  <strong>{aerodrome.code}</strong>
                  <span>{aerodrome.cartoName}</span>
                </button>
              ))}
            </div>
          )}

          {aerodromeError && <p className="route-field-error" role="alert">{aerodromeError}</p>}

          <div className="route-summary-line">
            <strong>{route.branches.length ? `${route.distanceTotale.toFixed(1).replace('.', ',')} NM` : '-'}</strong>
            <span>{route.branches.length ? (route.hasWindCalculationError ? 'Vent incompatible' : formatDuration(route.tempsEstimeMin)) : '-'}</span>
            <span>{route.branches.length ? (route.hasWindCalculationError ? 'GS à vérifier' : `GS moy. ${route.vitesseSolKt} kt`) : '-'}</span>
          </div>

          <RoutePointList points={route.points} selectedPointId={selectedPointId} onSelect={onSelectPoint} onRemove={onRemovePoint} />

          <div className={`route-hint ${route.hasWindCalculationError ? 'is-danger' : ''}`}>
            {route.hasWindCalculationError
              ? 'Vent incompatible avec la TAS sur au moins une branche : temps et carburant non calculables.'
              : routeMessage}
          </div>

          <div className="route-actions-row route-actions-row-single">
            <Button
              variant="secondary"
              onClick={() => {
                setAddWaypointMode(false);
                if (route.points.length || alternateCode) setResetConfirmOpen(true);
                else onResetRoute();
              }}
            >Nouvelle nav</Button>
          </div>
        </Card>
      </div>
      <ConfirmDialog
        open={resetConfirmOpen}
        title="Créer une nouvelle navigation ?"
        message="La route, les points, les vents, les altitudes et l'aérodrome de déroutement seront effacés."
        confirmLabel="Créer la nouvelle nav"
        onCancel={() => setResetConfirmOpen(false)}
        onConfirm={() => {
          setResetConfirmOpen(false);
          setAerodromeError(null);
          setActiveAerodromeField(null);
          onResetRoute();
        }}
      />
    </Page>
  );
}
