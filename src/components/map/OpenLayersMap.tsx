import { useEffect, useMemo, useRef, useState } from 'react';
import Map from 'ol/Map';
import DragRotate from 'ol/interaction/DragRotate';
import PinchRotate from 'ol/interaction/PinchRotate';
import { defaults as defaultInteractions } from 'ol/interaction/defaults';
import View from 'ol/View';
import { fromLonLat, toLonLat } from 'ol/proj';
import { boundingExtent } from 'ol/extent';
import type BaseLayer from 'ol/layer/Base';
import type { EventsKey } from 'ol/events';
import { unByKey } from 'ol/Observable';
import { createFreeMapLayer } from '../../mapSources/freeMapSource';
import { createOpenAipRasterLayer } from '../../mapSources/openAipRasterSource';
import { createIgnOaciVfrLayer } from '../../mapSources/ignOaciVfrSource';
import { initialMapCenter, initialMapZoom } from '../../mapEngine/mapViewConfig';
import type { MapBaseLayer, MapOrientationMode, MapSourceStatus } from '../../mapEngine/mapTypes';
import { createPlannedRouteLayer } from '../../mapLayers/plannedRouteLayer';
import { createActualTraceLayer, updateActualTraceLayer, type ActualTraceLayer } from '../../mapLayers/actualTraceLayer';
import { createWaypointLayer } from '../../mapLayers/waypointLayer';
import { createAircraftLayer, updateAircraftLayer, type AircraftLayer } from '../../mapLayers/aircraftLayer';
import type { GpsPosition } from '../../domain/gps.types';
import type { NavRoute } from '../../domain/navigation.types';
import { MapControls } from './MapControls';
import { MapFallbackNotice } from './MapFallbackNotice';
import { closestEquivalentRotation, reliableTrackDeg, viewRotationForTrack } from '../../services/map/mapOrientation';

interface OpenLayersMapProps {
  route: NavRoute;
  trace: GpsPosition[];
  aircraft: GpsPosition | null;
  selectedPointId: string | null;
  compact?: boolean;
  baseLayer?: MapBaseLayer;
  followAircraft?: boolean;
  orientationMode?: MapOrientationMode;
  onToggleOrientation?: () => void;
  fullscreen?: boolean;
  onToggleFullscreen?: () => void;
  addWaypointMode?: boolean;
  onMapAddWaypoint?: (longitude: number, latitude: number) => void;
  onSourceStatusChange?: (status: MapSourceStatus) => void;
  allowUserRotation?: boolean;
  onRequestPosition?: () => Promise<GpsPosition | null>;
  locating?: boolean;
  locationError?: string | null;
}

function replaceLayer(map: Map, previousLayer: BaseLayer | null, nextLayer: BaseLayer | null): BaseLayer | null {
  if (previousLayer) {
    map.removeLayer(previousLayer);
    previousLayer.dispose();
  }
  if (nextLayer) map.addLayer(nextLayer);
  return nextLayer;
}

export function OpenLayersMap({
  route,
  trace,
  aircraft,
  selectedPointId,
  compact = false,
  baseLayer = 'free',
  followAircraft = false,
  orientationMode = 'north-up',
  onToggleOrientation,
  fullscreen = false,
  onToggleFullscreen,
  addWaypointMode = false,
  onMapAddWaypoint,
  onSourceStatusChange,
  allowUserRotation = false,
  onRequestPosition,
  locating = false,
  locationError = null
}: OpenLayersMapProps) {
  const mapElementRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const baseLayerRef = useRef<BaseLayer | null>(null);
  const plannedRouteLayerRef = useRef<BaseLayer | null>(null);
  const waypointsLayerRef = useRef<BaseLayer | null>(null);
  const openAipRasterLayerRef = useRef<BaseLayer | null>(null);
  const oaciLayerRef = useRef<BaseLayer | null>(null);
  const traceLayerRef = useRef<ActualTraceLayer | null>(null);
  const aircraftLayerRef = useRef<AircraftLayer | null>(null);
  const latestAircraftRef = useRef<GpsPosition | null>(null);
  const lastReliableTrackRef = useRef<number | null>(null);
  const currentBaseLayerModeRef = useRef<MapBaseLayer>(baseLayer);
  const lastRoutePointCountRef = useRef<number | null>(null);
  const lastRouteEndpointsKeyRef = useRef<string | null>(null);
  const onSourceStatusChangeRef = useRef(onSourceStatusChange);
  const dragRotateRef = useRef<DragRotate | null>(null);
  const pinchRotateRef = useRef<PinchRotate | null>(null);
  const previousOrientationModeRef = useRef<MapOrientationMode>(orientationMode);
  const [sourceStatus, setSourceStatus] = useState<MapSourceStatus>('free');

  const routeCoordinates = useMemo(() => route.points.map((point) => fromLonLat([point.longitude, point.latitude])), [route.points]);
  const routeExtent = useMemo(() => routeCoordinates.length > 0 ? boundingExtent(routeCoordinates) : null, [routeCoordinates]);

  useEffect(() => {
    currentBaseLayerModeRef.current = baseLayer;
  }, [baseLayer]);

  useEffect(() => {
    onSourceStatusChangeRef.current = onSourceStatusChange;
  }, [onSourceStatusChange]);

  useEffect(() => {
    dragRotateRef.current?.setActive(allowUserRotation);
    pinchRotateRef.current?.setActive(allowUserRotation);
    if (!allowUserRotation) mapRef.current?.getView().setRotation(orientationMode === 'track-up' ? mapRef.current.getView().getRotation() : 0);
  }, [allowUserRotation, orientationMode]);

  useEffect(() => {
    if (!mapElementRef.current || mapRef.current) return;

    const freeMapLayer = createFreeMapLayer();
    const openAipRasterLayer = createOpenAipRasterLayer(() => {
      if (currentBaseLayerModeRef.current !== 'free') return;
      setSourceStatus('fallback');
      onSourceStatusChangeRef.current?.('fallback');
    });
    const oaciLayer = createIgnOaciVfrLayer(() => {
      if (currentBaseLayerModeRef.current !== 'oaci') return;
      setSourceStatus('error');
      onSourceStatusChangeRef.current?.('error');
    });
    const traceLayer = createActualTraceLayer();
    const aircraftLayer = createAircraftLayer(null, initialMapZoom);

    baseLayerRef.current = freeMapLayer;
    openAipRasterLayerRef.current = openAipRasterLayer;
    oaciLayerRef.current = oaciLayer;
    traceLayerRef.current = traceLayer;
    aircraftLayerRef.current = aircraftLayer;

    const interactions = defaultInteractions();
    dragRotateRef.current = interactions.getArray().find((interaction): interaction is DragRotate => interaction instanceof DragRotate) ?? null;
    pinchRotateRef.current = interactions.getArray().find((interaction): interaction is PinchRotate => interaction instanceof PinchRotate) ?? null;
    dragRotateRef.current?.setActive(allowUserRotation);
    pinchRotateRef.current?.setActive(allowUserRotation);

    const map = new Map({
      target: mapElementRef.current,
      controls: [],
      interactions,
      layers: [freeMapLayer, oaciLayer, openAipRasterLayer, traceLayer, aircraftLayer],
      view: new View({
        center: initialMapCenter,
        zoom: initialMapZoom,
        minZoom: 6,
        maxZoom: 14,
        smoothExtentConstraint: false,
        smoothResolutionConstraint: false
      })
    });

    mapRef.current = map;
    setSourceStatus('free');
    onSourceStatusChangeRef.current?.('free');

    return () => {
      plannedRouteLayerRef.current?.dispose();
      waypointsLayerRef.current?.dispose();
      openAipRasterLayerRef.current?.dispose();
      oaciLayerRef.current?.dispose();
      traceLayerRef.current?.dispose();
      aircraftLayerRef.current?.dispose();
      map.setTarget(undefined);
      mapRef.current = null;
      baseLayerRef.current = null;
      plannedRouteLayerRef.current = null;
      waypointsLayerRef.current = null;
      openAipRasterLayerRef.current = null;
      oaciLayerRef.current = null;
      traceLayerRef.current = null;
      aircraftLayerRef.current = null;
      dragRotateRef.current = null;
      pinchRotateRef.current = null;
    };
  }, []);

  useEffect(() => {
    const freeMode = baseLayer === 'free';
    baseLayerRef.current?.setVisible(freeMode);
    openAipRasterLayerRef.current?.setVisible(freeMode);
    oaciLayerRef.current?.setVisible(baseLayer === 'oaci');

    const status: MapSourceStatus = baseLayer === 'oaci' ? 'oaci' : 'free';
    setSourceStatus(status);
    onSourceStatusChangeRef.current?.(status);
  }, [baseLayer]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    plannedRouteLayerRef.current = replaceLayer(map, plannedRouteLayerRef.current, createPlannedRouteLayer(route.points));
  }, [route.points]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    waypointsLayerRef.current = replaceLayer(map, waypointsLayerRef.current, createWaypointLayer(route.points, selectedPointId));
  }, [route.points, selectedPointId]);

  useEffect(() => {
    const traceLayer = traceLayerRef.current;
    if (!traceLayer) return;
    updateActualTraceLayer(traceLayer, trace);
  }, [trace]);

  useEffect(() => {
    latestAircraftRef.current = aircraft;
    const nextTrack = reliableTrackDeg(aircraft);
    if (nextTrack !== null) lastReliableTrackRef.current = nextTrack;

    const aircraftLayer = aircraftLayerRef.current;
    const map = mapRef.current;
    if (!aircraftLayer) return;
    updateAircraftLayer(aircraftLayer, aircraft, map?.getView().getZoom());
  }, [aircraft]);

  useEffect(() => {
    const map = mapRef.current;
    const aircraftLayer = aircraftLayerRef.current;
    if (!map || !aircraftLayer) return undefined;

    let animationFrame: number | null = null;
    const updateScale = () => {
      if (animationFrame !== null) window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(() => {
        updateAircraftLayer(aircraftLayer, latestAircraftRef.current, map.getView().getZoom());
        animationFrame = null;
      });
    };

    const key: EventsKey = map.getView().on('change:resolution', updateScale);
    updateScale();

    return () => {
      if (animationFrame !== null) window.cancelAnimationFrame(animationFrame);
      unByKey(key);
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const frame = window.requestAnimationFrame(() => map.updateSize());
    const timeout = window.setTimeout(() => map.updateSize(), 180);

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timeout);
    };
  }, [fullscreen]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const view = map.getView();
    const previousMode = previousOrientationModeRef.current;
    const orientationChanged = previousMode !== orientationMode;
    previousOrientationModeRef.current = orientationMode;

    if (orientationMode === 'track-up') {
      const currentRotation = view.getRotation() ?? 0;
      const storedTrack = lastReliableTrackRef.current;
      const targetRotation = storedTrack !== null
        ? viewRotationForTrack(storedTrack, currentRotation)
        : closestEquivalentRotation(0, currentRotation);
      view.animate({
        ...(followAircraft && aircraft ? { center: fromLonLat([aircraft.longitude, aircraft.latitude]) } : {}),
        rotation: targetRotation,
        duration: 240
      });
      return;
    }

    if (orientationChanged) {
      view.animate({
        ...(followAircraft && aircraft ? { center: fromLonLat([aircraft.longitude, aircraft.latitude]) } : {}),
        rotation: closestEquivalentRotation(0, view.getRotation() ?? 0),
        duration: 240
      });
      return;
    }

    if (followAircraft && aircraft) {
      view.animate({ center: fromLonLat([aircraft.longitude, aircraft.latitude]), duration: 220 });
    }
  }, [aircraft, followAircraft, orientationMode]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const previousPointCount = lastRoutePointCountRef.current;
    const previousEndpointsKey = lastRouteEndpointsKeyRef.current;
    const currentPointCount = route.points.length;
    const firstPointId = route.points[0]?.id ?? 'none';
    const lastPointId = route.points.at(-1)?.id ?? 'none';
    const currentEndpointsKey = `${firstPointId}:${lastPointId}`;

    lastRoutePointCountRef.current = currentPointCount;
    lastRouteEndpointsKeyRef.current = currentEndpointsKey;

    if (compact && aircraft) {
      map.getView().setCenter(fromLonLat([aircraft.longitude, aircraft.latitude]));
      return;
    }

    const waypointCountChanged = previousPointCount !== null
      && previousPointCount !== currentPointCount
      && previousEndpointsKey === currentEndpointsKey;
    if (waypointCountChanged) return;

    if (routeCoordinates.length === 0 || !routeExtent) {
      map.getView().setCenter(initialMapCenter);
      map.getView().setZoom(initialMapZoom);
      return;
    }

    if (routeCoordinates.length === 1) {
      map.getView().setCenter(routeCoordinates[0]);
      map.getView().setZoom(10);
      return;
    }

    map.getView().fit(routeExtent, { padding: compact ? [48, 48, 48, 48] : [72, 58, 92, 58], duration: 0, maxZoom: 10 });
  }, [routeExtent, routeCoordinates, compact, route.points]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !addWaypointMode || !onMapAddWaypoint) return undefined;

    const handleClick = (event: { coordinate: number[] }) => {
      const [longitude, latitude] = toLonLat(event.coordinate);
      onMapAddWaypoint(longitude, latitude);
    };

    map.on('singleclick', handleClick);
    return () => {
      map.un('singleclick', handleClick);
    };
  }, [addWaypointMode, onMapAddWaypoint]);

  const zoom = (delta: number) => {
    const view = mapRef.current?.getView();
    if (!view) return;
    view.animate({ zoom: (view.getZoom() ?? initialMapZoom) + delta, duration: 120 });
  };

  const centerOnPosition = (position: GpsPosition) => {
    const view = mapRef.current?.getView();
    if (!view) return;
    const currentRotation = view.getRotation() ?? 0;
    const storedTrack = reliableTrackDeg(position) ?? lastReliableTrackRef.current;
    const targetRotation = orientationMode === 'track-up' && storedTrack !== null
      ? viewRotationForTrack(storedTrack, currentRotation)
      : closestEquivalentRotation(0, currentRotation);
    view.animate({
      center: fromLonLat([position.longitude, position.latitude]),
      zoom: Math.max(10, view.getZoom() ?? 10),
      rotation: targetRotation,
      duration: 180
    });
  };

  const recenter = async () => {
    const map = mapRef.current;
    if (!map || locating) return;

    if (onRequestPosition) {
      const position = await onRequestPosition();
      if (position) {
        centerOnPosition(position);
        return;
      }
    } else if (aircraft) {
      centerOnPosition(aircraft);
      return;
    }

    const view = map.getView();
    if (routeCoordinates.length === 0 || !routeExtent) {
      view.animate({ center: initialMapCenter, zoom: initialMapZoom, rotation: 0, duration: 160 });
      return;
    }

    if (routeCoordinates.length === 1) {
      view.animate({ center: routeCoordinates[0], zoom: 10, rotation: 0, duration: 160 });
      return;
    }

    view.setRotation(0);
    view.fit(routeExtent, { padding: [72, 58, 92, 58], duration: 0, maxZoom: 10 });
  };

  return (
    <div className={`map-shell ${addWaypointMode ? 'is-adding-point' : ''} ${fullscreen ? 'is-map-fullscreen' : ''}`}>
      <div ref={mapElementRef} className="ol-map" aria-label="Carte CAP CLAIR" />
      {addWaypointMode && (
        <div className="map-add-banner">
          Touchez la carte pour ajouter les points
        </div>
      )}
      <MapControls
        onZoomIn={() => zoom(1)}
        onZoomOut={() => zoom(-1)}
        onRecenter={recenter}
        locating={locating}
        orientationMode={onToggleOrientation ? orientationMode : undefined}
        onToggleOrientation={onToggleOrientation}
        fullscreen={fullscreen}
        onToggleFullscreen={onToggleFullscreen}
      />
      {locationError && <div className="map-location-notice">{locationError}</div>}
      {(sourceStatus === 'fallback' || sourceStatus === 'error') && <MapFallbackNotice mode={sourceStatus === 'error' ? 'oaci' : 'openaip'} />}
    </div>
  );
}
