import { useCallback, useEffect, useMemo, useState } from 'react';
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
  onSetAlternateCode: (code: string) => void;
  onCalculations: () => void;
  mapBaseLayer: MapBaseLayer;
  onMapBaseLayerChange: (value: MapBaseLayer) => void;
  aircraftPosition: GpsPosition | null;
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
  aircraftPosition
}: PlanningScreenProps) {
  const [addWaypointMode, setAddWaypointMode] = useState(false);
  const [departureInput, setDepartureInput] = useState(endpointCode(route, 'depart'));
  const [destinationInput, setDestinationInput] = useState(endpointCode(route, 'destination'));
  const [alternateInput, setAlternateInput] = useState(alternateCode);
  const [activeAerodromeField, setActiveAerodromeField] = useState<AerodromeField | null>(null);

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
    if (departureInput.trim().length >= 4) onSetDepartureCode(departureInput);
  };

  const applyDestination = () => {
    if (destinationInput.trim().length >= 4) onSetDestinationCode(destinationInput);
  };

  const applyAlternate = () => {
    const normalized = alternateInput.trim().toUpperCase();
    if (!normalized) {
      onSetAlternateCode('');
      return;
    }
    if (normalized.length >= 4) onSetAlternateCode(normalized);
  };

  const chooseAerodrome = (field: AerodromeField, code: string) => {
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
    setActiveAerodromeField(null);
    if (typeof document !== 'undefined') {
      (document.activeElement as HTMLElement | null)?.blur?.();
    }
  };

  const handleAddWaypoint = useCallback((longitude: number, latitude: number) => {
    onAddWaypointAt(longitude, latitude);
    setAddWaypointMode(false);
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
          />
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

          <div className="route-summary-line">
            <strong>{route.distanceTotale.toFixed(1).replace('.', ',')} NM</strong>
            <span>{formatDuration(route.tempsEstimeMin)}</span>
            <span>{route.vitesseSolKt} kt</span>
          </div>

          <RoutePointList points={route.points} selectedPointId={selectedPointId} onSelect={onSelectPoint} onRemove={onRemovePoint} />

          <div className="route-hint">{routeMessage}</div>

          <div className="route-actions-row route-actions-row-two">
            <Button variant={addWaypointMode ? 'danger' : 'primary'} onClick={() => setAddWaypointMode((value) => !value)}>
              {addWaypointMode ? 'Annuler' : '+ Point'}
            </Button>
            <Button variant="secondary" onClick={onResetRoute}>Nouvelle nav</Button>
          </div>
        </Card>
      </div>
    </Page>
  );
}
