import { useEffect, useMemo, useRef } from 'react';
import Feature, { type FeatureLike } from 'ol/Feature';
import GeoJSON from 'ol/format/GeoJSON';
import Map from 'ol/Map';
import View from 'ol/View';
import { defaults as defaultControls } from 'ol/control/defaults';
import { circular } from 'ol/geom/Polygon';
import LineString from 'ol/geom/LineString';
import Point from 'ol/geom/Point';
import Polygon from 'ol/geom/Polygon';
import type Geometry from 'ol/geom/Geometry';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import { fromLonLat } from 'ol/proj';
import { Fill, Circle as CircleStyle, Stroke, Style, Text } from 'ol/style';
import type { NavRoute } from '../../domain/navigation.types';
import type { ParsedNotam, PibAnalysis } from '../../domain/notam.types';
import type { SupAipDatasetBundle } from '../../services/supaip/supAipDataset';
import { createFreeMapLayer } from '../../mapSources/freeMapSource';
import { initialMapCenter, initialMapZoom } from '../../mapEngine/mapViewConfig';

interface BriefingMapProps {
  route: NavRoute;
  bundle: SupAipDatasetBundle;
  briefing: PibAnalysis | null;
  selectedSupAipId: string | null;
  selectedNotamId: string | null;
  onSelectSupAip: (id: string) => void;
  onSelectNotam: (id: string) => void;
}

function supStyle(feature: FeatureLike, resolution: number, selectedSupAipId: string | null): Style | Style[] {
  const publication = String(feature.get('supAip') ?? '');
  const selected = publication === selectedSupAipId;
  const limitsMissing = feature.get('verticalLimitsExtracted') === false;
  const label = resolution <= 1700 ? String(feature.get('name') ?? publication) : '';
  const main = new Style({
    fill: new Fill({ color: selected ? 'rgba(255, 154, 61, 0.26)' : 'rgba(255, 122, 69, 0.10)' }),
    stroke: new Stroke({
      color: limitsMissing ? '#FFB84D' : '#FF7A45',
      width: selected ? 4.2 : 2,
      lineDash: limitsMissing ? [8, 6] : undefined,
      lineCap: 'round',
      lineJoin: 'round'
    }),
    text: label ? new Text({
      text: label,
      font: selected ? '800 12px system-ui' : '700 11px system-ui',
      fill: new Fill({ color: '#FFE8DE' }),
      stroke: new Stroke({ color: 'rgba(5, 11, 18, 0.96)', width: 4 }),
      overflow: true
    }) : undefined,
    zIndex: selected ? 90 : 20
  });
  if (!selected) return main;
  return [
    new Style({
      stroke: new Stroke({ color: 'rgba(255,255,255,0.95)', width: 7 }),
      fill: new Fill({ color: 'rgba(255,255,255,0.03)' }),
      zIndex: 89
    }),
    main
  ];
}

function notamStyle(feature: FeatureLike, selectedNotamId: string | null): Style | Style[] {
  const id = String(feature.get('notamId') ?? '');
  const selected = id === selectedNotamId;
  const kind = String(feature.get('notamKind') ?? 'q');
  const color = kind === 'q' ? '#FFB84D' : '#59CFFF';
  const fill = kind === 'q' ? 'rgba(255, 184, 77, 0.10)' : 'rgba(89, 207, 255, 0.12)';
  const geometry = feature.getGeometry();
  const point = geometry instanceof Point;
  const main = new Style({
    fill: new Fill({ color: selected ? fill.replace('0.10', '0.24').replace('0.12', '0.24') : fill }),
    stroke: new Stroke({ color, width: selected ? 4 : 2.2, lineDash: kind === 'q' ? [9, 7] : undefined }),
    image: point ? new CircleStyle({
      radius: selected ? 9 : 6,
      fill: new Fill({ color }),
      stroke: new Stroke({ color: '#07111C', width: 2 })
    }) : undefined,
    text: selected ? new Text({
      text: id,
      font: '800 11px system-ui',
      fill: new Fill({ color: '#F3F7FA' }),
      stroke: new Stroke({ color: '#07111C', width: 4 }),
      offsetY: point ? -16 : 0,
      overflow: true
    }) : undefined,
    zIndex: selected ? 120 : 70
  });
  if (!selected || point) return main;
  return [
    new Style({ stroke: new Stroke({ color: 'rgba(255,255,255,0.95)', width: 7 }), zIndex: 119 }),
    main
  ];
}

function notamFeatures(analysis: PibAnalysis | null): Feature<Geometry>[] {
  if (!analysis) return [];
  const result: Feature<Geometry>[] = [];
  for (const notam of analysis.notams) {
    if (notam.exactPolygon && notam.exactPolygon.length >= 3) {
      const coordinates = notam.exactPolygon.map((entry) => fromLonLat([entry.longitude, entry.latitude]));
      if (coordinates.length > 0) coordinates.push(coordinates[0]);
      const feature = new Feature<Geometry>(new Polygon([coordinates]));
      feature.setProperties({ capclairKind: 'notam', notamId: notam.id, notamKind: 'e-polygon' });
      result.push(feature);
      continue;
    }
    const precisePointCode = /Q(?:OB|OL)/.test(notam.fields.q?.code ?? '');
    if (precisePointCode && notam.eCoordinates.length > 0) {
      for (const coordinate of notam.eCoordinates) {
        const feature = new Feature<Geometry>(new Point(fromLonLat([coordinate.longitude, coordinate.latitude])));
        feature.setProperties({ capclairKind: 'notam', notamId: notam.id, notamKind: 'e-point' });
        result.push(feature);
      }
      continue;
    }
    const hasMappedSup = notam.supAipReferences.some((reference) => {
      const item = analysis.reconciliations.find((entry) => entry.reference.id === reference.id);
      return (item?.mappedGeometryCount ?? 0) > 0;
    });
    if (hasMappedSup) continue;
    const q = notam.fields.q;
    if (q?.center && q.radiusNm !== null) {
      const geometry = circular([q.center.longitude, q.center.latitude], q.radiusNm * 1852, 64)
        .transform('EPSG:4326', 'EPSG:3857');
      const feature = new Feature<Geometry>(geometry);
      feature.setProperties({ capclairKind: 'notam', notamId: notam.id, notamKind: 'q' });
      result.push(feature);
    }
  }
  return result;
}

function selectionExtent(
  supSource: VectorSource<Feature<Geometry>>,
  notamSource: VectorSource<Feature<Geometry>>,
  supId: string | null,
  notamId: string | null
): number[] | null {
  const features = supId
    ? supSource.getFeatures().filter((feature) => String(feature.get('supAip') ?? '') === supId)
    : notamId
      ? notamSource.getFeatures().filter((feature) => String(feature.get('notamId') ?? '') === notamId)
      : [];
  if (features.length === 0) return null;
  const extent = features[0].getGeometry()?.getExtent().slice();
  if (!extent) return null;
  for (const feature of features.slice(1)) {
    const next = feature.getGeometry()?.getExtent();
    if (!next) continue;
    extent[0] = Math.min(extent[0], next[0]);
    extent[1] = Math.min(extent[1], next[1]);
    extent[2] = Math.max(extent[2], next[2]);
    extent[3] = Math.max(extent[3], next[3]);
  }
  return extent;
}

export function BriefingMap({
  route,
  bundle,
  briefing,
  selectedSupAipId,
  selectedNotamId,
  onSelectSupAip,
  onSelectNotam
}: BriefingMapProps) {
  const targetRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const supSourceRef = useRef(new VectorSource<Feature<Geometry>>());
  const notamSourceRef = useRef(new VectorSource<Feature<Geometry>>());
  const routeSourceRef = useRef(new VectorSource<Feature<Geometry>>());
  const selectedSupRef = useRef(selectedSupAipId);
  const selectedNotamRef = useRef(selectedNotamId);
  const callbacksRef = useRef({ onSelectSupAip, onSelectNotam });

  useEffect(() => {
    selectedSupRef.current = selectedSupAipId;
    selectedNotamRef.current = selectedNotamId;
    callbacksRef.current = { onSelectSupAip, onSelectNotam };
  }, [onSelectNotam, onSelectSupAip, selectedNotamId, selectedSupAipId]);

  const supFeatures = useMemo(() => {
    const format = new GeoJSON({ featureProjection: 'EPSG:3857' });
    return format.readFeatures(bundle.geoJson) as Feature<Geometry>[];
  }, [bundle.status.datasetRevision]);

  useEffect(() => {
    if (!targetRef.current || mapRef.current) return;
    const supLayer = new VectorLayer({
      source: supSourceRef.current,
      style: (feature, resolution) => supStyle(feature, resolution, selectedSupRef.current),
      zIndex: 20,
      renderBuffer: 160,
      updateWhileAnimating: false,
      updateWhileInteracting: false
    });
    const notamLayer = new VectorLayer({
      source: notamSourceRef.current,
      style: (feature) => notamStyle(feature, selectedNotamRef.current),
      zIndex: 40
    });
    const routeLayer = new VectorLayer({
      source: routeSourceRef.current,
      style: new Style({
        stroke: new Stroke({ color: '#18AEEF', width: 3.4, lineCap: 'round', lineJoin: 'round' }),
        zIndex: 80
      }),
      zIndex: 50
    });
    const map = new Map({
      target: targetRef.current,
      layers: [createFreeMapLayer(), supLayer, notamLayer, routeLayer],
      controls: defaultControls({ rotate: false, attributionOptions: { collapsible: true } }),
      view: new View({ center: initialMapCenter, zoom: initialMapZoom, minZoom: 4, maxZoom: 19 })
    });
    map.on('singleclick', (event) => {
      const hit = map.forEachFeatureAtPixel(event.pixel, (feature) => feature as Feature<Geometry>, { hitTolerance: 8 });
      if (!hit) return;
      if (hit.get('capclairKind') === 'notam') {
        callbacksRef.current.onSelectNotam(String(hit.get('notamId') ?? ''));
        return;
      }
      const supId = String(hit.get('supAip') ?? '');
      if (supId) callbacksRef.current.onSelectSupAip(supId);
    });
    mapRef.current = map;
    return () => {
      map.setTarget(undefined);
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    supSourceRef.current.clear(true);
    for (const feature of supFeatures) feature.set('capclairKind', 'supaip');
    supSourceRef.current.addFeatures(supFeatures);
  }, [supFeatures]);

  useEffect(() => {
    notamSourceRef.current.clear(true);
    notamSourceRef.current.addFeatures(notamFeatures(briefing));
  }, [briefing]);

  useEffect(() => {
    routeSourceRef.current.clear(true);
    const coordinates = route.points.map((point) => fromLonLat([point.longitude, point.latitude]));
    if (coordinates.length >= 2) routeSourceRef.current.addFeature(new Feature<Geometry>(new LineString(coordinates)));
  }, [route.points]);

  useEffect(() => {
    selectedSupRef.current = selectedSupAipId;
    selectedNotamRef.current = selectedNotamId;
    supSourceRef.current.changed();
    notamSourceRef.current.changed();
    const map = mapRef.current;
    if (!map) return;
    const extent = selectionExtent(
      supSourceRef.current,
      notamSourceRef.current,
      selectedSupAipId,
      selectedNotamId
    );
    if (extent) map.getView().fit(extent, { padding: [70, 40, 70, 40], maxZoom: 12, duration: 250 });
  }, [selectedNotamId, selectedSupAipId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || selectedSupAipId || selectedNotamId || route.points.length < 2) return;
    const extent = routeSourceRef.current.getExtent();
    if (extent) map.getView().fit(extent, { padding: [60, 40, 60, 40], maxZoom: 10, duration: 0 });
  }, [route.points, selectedNotamId, selectedSupAipId]);

  return (
    <div className="briefing-map-wrap">
      <div ref={targetRef} className="briefing-map" aria-label="Carte NOTAM et SUP AIP" />
      <div className="briefing-map-legend">
        <span><i className="legend-sup" /> SUP AIP, toujours visibles</span>
        <span><i className="legend-notam" /> NOTAM précis ou cercle Q approximatif</span>
        <span><i className="legend-route" /> Route préparée</span>
      </div>
    </div>
  );
}

export function notamHasMapGeometry(notam: ParsedNotam, analysis: PibAnalysis): boolean {
  if (notam.exactPolygon || notam.eCoordinates.length > 0) return true;
  const mappedSup = notam.supAipReferences.some((reference) => {
    const item = analysis.reconciliations.find((entry) => entry.reference.id === reference.id);
    return (item?.mappedGeometryCount ?? 0) > 0;
  });
  return mappedSup || Boolean(notam.fields.q?.center && notam.fields.q.radiusNm !== null);
}
