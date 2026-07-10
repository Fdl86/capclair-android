import { lazy, Suspense, useEffect, useState } from 'react';
import type { ScreenId } from './routes';
import { findAerodrome } from '../data/aerodromeCatalog';
import { AppShell } from '../components/layout/AppShell';
import { PlanningScreen } from '../screens/PlanningScreen';
import { useActiveRoute } from '../hooks/useActiveRoute';
import { useTraces } from '../hooks/useTraces';
import { useLocalStorageState } from '../hooks/useLocalStorageState';
import { useAircraftProfiles } from '../hooks/useAircraftProfiles';
import { useAerodromeWeather } from '../hooks/useAerodromeWeather';
import { useGpsTracking } from '../hooks/useGpsTracking';
import { useScreenWakeLock } from '../hooks/useScreenWakeLock';
import { DEFAULT_FUEL_PLAN_CONFIG } from '../domain/aircraft.types';
import type { MapBaseLayer } from '../mapEngine/mapTypes';
import { runStorageMaintenance } from '../services/storage/storageMaintenance';


const CalculationsScreen = lazy(() => import('../screens/CalculationsScreen').then((module) => ({ default: module.CalculationsScreen })));
const ZonesScreen = lazy(() => import('../screens/ZonesScreen').then((module) => ({ default: module.ZonesScreen })));
const TrackingScreen = lazy(() => import('../screens/TrackingScreen').then((module) => ({ default: module.TrackingScreen })));
const TracesScreen = lazy(() => import('../screens/TracesScreen').then((module) => ({ default: module.TracesScreen })));
const MoreScreen = lazy(() => import('../screens/MoreScreen').then((module) => ({ default: module.MoreScreen })));

function routeEndpointCode(route: ReturnType<typeof useActiveRoute>['route'], type: 'depart' | 'destination') {
  return route.points.find((point) => point.type === type)?.code ?? '';
}

function safeAerodromeCode(code: string, fallback = '') {
  const normalized = code.trim().toUpperCase();
  if (!normalized) return '';
  return findAerodrome(normalized) ? normalized : fallback;
}

export function App() {
  const [currentScreen, setCurrentScreen] = useState<ScreenId>('planning');
  const routeState = useActiveRoute();
  const traceState = useTraces();
  const aircraftState = useAircraftProfiles();
  const [alternateCode, setAlternateCode] = useLocalStorageState('capclair.alternateCode.v3.native', '');
  const [fuelPlanConfigRaw, setFuelPlanConfig] = useLocalStorageState('capclair.fuelPlan.v1', DEFAULT_FUEL_PLAN_CONFIG);
  const [mapBaseLayer, setMapBaseLayer] = useLocalStorageState<MapBaseLayer>('capclair.mapBaseLayer.v1', 'free');
  const fuelPlanConfig = { ...DEFAULT_FUEL_PLAN_CONFIG, ...fuelPlanConfigRaw };

  useEffect(() => {
    runStorageMaintenance();
  }, []);

  const departureCode = routeEndpointCode(routeState.route, 'depart');
  const destinationCode = routeEndpointCode(routeState.route, 'destination');
  const safeAlternateCode = safeAerodromeCode(alternateCode, '');
  const aerodromeWeatherState = useAerodromeWeather([departureCode, destinationCode, safeAlternateCode].filter(Boolean));
  const gpsState = useGpsTracking(routeState.route, traceState.saveTrace, aircraftState.activeProfile);
  const gpsIsRecording = gpsState.status === 'active'
    || gpsState.status === 'degraded'
    || gpsState.status === 'frozen'
    || gpsState.status === 'simulating';
  const wakeLockActive = useScreenWakeLock(gpsIsRecording);

  const setAlternate = (code: string) => {
    setAlternateCode(safeAerodromeCode(code, safeAlternateCode));
  };

  const selectAircraft = (profileId: string) => {
    const selected = aircraftState.selectProfile(profileId);
    routeState.setTasKt(selected.cruiseTasKt);
  };

  const updateAircraft = (profileId: string, patch: Parameters<typeof aircraftState.updateProfile>[1]) => {
    aircraftState.updateProfile(profileId, patch);
    if (profileId === aircraftState.activeProfile.id && typeof patch.cruiseTasKt === 'number') {
      routeState.setTasKt(patch.cruiseTasKt);
    }
  };

  const createAircraft = () => {
    const profile = aircraftState.createProfile();
    routeState.setTasKt(profile.cruiseTasKt);
  };

  const updateFuelPlanConfig = (patch: Partial<typeof DEFAULT_FUEL_PLAN_CONFIG>) => {
    setFuelPlanConfig((current) => ({ ...current, ...patch }));
  };

  return (
    <AppShell currentScreen={currentScreen} onNavigate={setCurrentScreen}>
      <Suspense fallback={<div className="screen-loading">Chargement de l’écran...</div>}>
      {currentScreen === 'planning' && (
        <PlanningScreen
          route={routeState.route}
          selectedPointId={routeState.selectedPointId}
          routeMessage={routeState.routeMessage}
          onSelectPoint={routeState.setSelectedPointId}
          onSetDepartureCode={routeState.setDepartureCode}
          onSetDestinationCode={routeState.setDestinationCode}
          onAddWaypointAt={routeState.addWaypointAt}
          onRemovePoint={routeState.removePoint}
          onReverseRoute={routeState.reverseRoute}
          onResetRoute={routeState.resetRoute}
          alternateCode={safeAlternateCode}
          onSetAlternateCode={setAlternate}
          onCalculations={() => setCurrentScreen('calculations')}
          mapBaseLayer={mapBaseLayer}
          onMapBaseLayerChange={setMapBaseLayer}
          aircraftPosition={gpsState.currentPosition}
        />
      )}
      {currentScreen === 'calculations' && (
        <CalculationsScreen
          route={routeState.route}
          weatherStatus={routeState.weatherStatus}
          onSetBranchAltitude={routeState.setBranchAltitudeFt}
          onRefreshWinds={routeState.refreshWinds}
          onSetTasKt={routeState.setTasKt}
          onSetDefaultAltitudeFt={routeState.setDefaultAltitudeFt}
          aircraftProfiles={aircraftState.profiles}
          activeAircraft={aircraftState.activeProfile}
          onSelectAircraft={selectAircraft}
          fuelPlanConfig={fuelPlanConfig}
          onSetFuelPlanConfig={updateFuelPlanConfig}
          alternateCode={safeAlternateCode}
          aerodromeWeatherReports={aerodromeWeatherState.reports}
          aerodromeWeatherStatus={aerodromeWeatherState.status}
          aerodromeWeatherUpdatedAt={aerodromeWeatherState.updatedAtIso}
          onRefreshAerodromeWeather={aerodromeWeatherState.refresh}
          onValidate={() => setCurrentScreen('tracking')}
          onExport={() => setCurrentScreen('traces')}
          onBackPlanning={() => setCurrentScreen('planning')}
        />
      )}
      {currentScreen === 'zones' && <ZonesScreen route={routeState.route} aircraft={aircraftState.activeProfile} />}
      {currentScreen === 'tracking' && (
        <TrackingScreen
          route={routeState.route}
          mapBaseLayer={mapBaseLayer}
          onMapBaseLayerChange={setMapBaseLayer}
          gps={gpsState}
          wakeLockActive={wakeLockActive}
        />
      )}
      {currentScreen === 'traces' && (
        <TracesScreen
          traces={traceState.traces}
          onDeleteTrace={traceState.deleteTrace}
          storageError={traceState.storageError}
        />
      )}
      {currentScreen === 'more' && (
        <MoreScreen
          onNavigate={setCurrentScreen}
          aircraftProfiles={aircraftState.profiles}
          activeAircraft={aircraftState.activeProfile}
          onSelectAircraft={selectAircraft}
          onUpdateAircraft={updateAircraft}
          onCreateAircraft={createAircraft}
        />
      )}
      </Suspense>
    </AppShell>
  );
}
