import { useEffect, useMemo, useRef, useState } from 'react';
import Map from 'ol/Map';
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
import type { MapBaseLayer, MapSourceStatus } from '../../mapEngine/mapTypes';
import { createPlannedRouteLayer } from '../../mapLayers/plannedRouteLayer';
import { createActualTraceLayer, updateActualTraceLayer, type ActualTraceLayer } from '../../mapLayers/actualTraceLayer';
import { createWaypointLayer } from '../../mapLayers/waypointLayer';
import { createAircraftLayer, updateAircraftLayer, type AircraftLayer } from '../../mapLayers/aircraftLayer';
import type { GpsPosition } from '../../domain/gps.types';
import type { NavRoute } from '../../domain/navigation.types';
import { MapControls } from './MapControls';
import { MapFallbackNotice } from './MapFallbackNotice';

interface OpenLayersMapProps {
  route: NavRoute;
  trace: GpsPosition[];
  aircraft: GpsPosition | null;
  selectedPointId: string | null;
  compact?: boolean;
  baseLayer?: MapBaseLayer;
  followAircraft?: boolean;
  addWaypointMode?: boolean;
  onMapAddWaypoint?: (longitude: number, latitude: number) => void;
  onSourceStatusChange?: (status: MapSourceStatus) => void;
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
  addWaypointMode = false,
  onMapAddWaypoint,
  onSourceStatusChange
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
  const currentBaseLayerModeRef = useRef<MapBaseLayer>(baseLayer);
  const lastRoutePointCountRef = useRef<number | null>(null);
  const lastRouteEndpointsKeyRef = useRef<string | null>(null);
  const onSourceStatusChangeRef = useRef(onSourceStatusChange);
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

    const map = new Map({
      target: mapElementRef.current,
      controls: [],
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
    if (!map || !followAircraft || !aircraft) return;
    map.getView().animate({
      center: fromLonLat([aircraft.longitude, aircraft.latitude]),
      duration: 240
    });
  }, [aircraft, followAircraft]);

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

  const recenter = () => {
    const map = mapRef.current;
    if (!map) return;
    if (aircraft) {
      map.getView().animate({ center: fromLonLat([aircraft.longitude, aircraft.latitude]), duration: 120 });
      return;
    }
    if (routeCoordinates.length === 0 || !routeExtent) {
      map.getView().animate({ center: initialMapCenter, zoom: initialMapZoom, duration: 120 });
      return;
    }

    if (routeCoordinates.length === 1) {
      map.getView().animate({ center: routeCoordinates[0], zoom: 10, duration: 120 });
      return;
    }

    map.getView().fit(routeExtent, { padding: [72, 58, 92, 58], duration: 0, maxZoom: 10 });
  };

  return (
    <div className={`map-shell ${addWaypointMode ? 'is-adding-point' : ''}`}>
      <div ref={mapElementRef} className="ol-map" aria-label="Carte CAP CLAIR" />
      {addWaypointMode && (
        <div className="map-add-banner">
          Cliquez sur la carte pour placer le point
        </div>
      )}
      <MapControls onZoomIn={() => zoom(1)} onZoomOut={() => zoom(-1)} onRecenter={recenter} />
      {(sourceStatus === 'fallback' || sourceStatus === 'error') && <MapFallbackNotice mode={sourceStatus === 'error' ? 'oaci' : 'openaip'} />}
    </div>
  );
}
