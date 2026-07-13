import Feature from 'ol/Feature';
import LineString from 'ol/geom/LineString';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import { Stroke, Style } from 'ol/style';
import { fromLonLat } from 'ol/proj';
import type { GpsPosition } from '../domain/gps.types';

export type ActualTraceLayer = VectorLayer<VectorSource<Feature<LineString>>>;

const TRACE_FEATURE_ID = 'actual-trace-line';
const TRACE_GAP_BREAK_MS = 15000;

interface TraceRenderState {
  processedCount: number;
  firstTimestamp: number | null;
  lastTimestamp: number | null;
  currentLine: LineString | null;
  segmentCount: number;
}

const renderStateByLayer = new WeakMap<ActualTraceLayer, TraceRenderState>();

function resetLayer(layer: ActualTraceLayer): TraceRenderState {
  layer.getSource()?.clear(true);
  const state: TraceRenderState = {
    processedCount: 0,
    firstTimestamp: null,
    lastTimestamp: null,
    currentLine: null,
    segmentCount: 0
  };
  renderStateByLayer.set(layer, state);
  return state;
}

function startSegment(layer: ActualTraceLayer, state: TraceRenderState, coordinate: number[]): LineString {
  const line = new LineString([coordinate]);
  const feature = new Feature(line);
  feature.setId(state.segmentCount === 0 ? TRACE_FEATURE_ID : `${TRACE_FEATURE_ID}-${state.segmentCount}`);
  layer.getSource()?.addFeature(feature);
  state.segmentCount += 1;
  state.currentLine = line;
  return line;
}

function appendPosition(layer: ActualTraceLayer, state: TraceRenderState, position: GpsPosition): void {
  const coordinate = fromLonLat([position.longitude, position.latitude]);
  const gap = state.lastTimestamp !== null && position.timestamp - state.lastTimestamp > TRACE_GAP_BREAK_MS;
  const startsNewSegment = !state.currentLine || gap;
  const line = startsNewSegment ? startSegment(layer, state, coordinate) : state.currentLine!;
  if (!startsNewSegment) line.appendCoordinate(coordinate);

  if (state.firstTimestamp === null) state.firstTimestamp = position.timestamp;
  state.lastTimestamp = position.timestamp;
  state.processedCount += 1;
}

export function createActualTraceLayer(positions: GpsPosition[] = []): ActualTraceLayer {
  const layer = new VectorLayer({
    source: new VectorSource<Feature<LineString>>(),
    style: [
      new Style({
        stroke: new Stroke({ color: 'rgba(5, 11, 18, 0.82)', width: 7, lineCap: 'round', lineJoin: 'round' })
      }),
      new Style({
        stroke: new Stroke({ color: '#FF3FA4', width: 4, lineCap: 'round', lineJoin: 'round' })
      })
    ],
    properties: { name: 'actual-trace' },
    renderBuffer: 32,
    zIndex: 21
  });

  resetLayer(layer);
  if (positions.length > 0) updateActualTraceLayer(layer, positions);
  return layer;
}

export function updateActualTraceLayer(layer: ActualTraceLayer, positions: GpsPosition[]): void {
  let state = renderStateByLayer.get(layer) ?? resetLayer(layer);

  const traceWasReplaced = positions.length < state.processedCount
    || (state.processedCount > 0 && positions[0]?.timestamp !== state.firstTimestamp)
    || (state.processedCount > 0 && positions[state.processedCount - 1]?.timestamp !== state.lastTimestamp);

  if (traceWasReplaced) state = resetLayer(layer);

  for (let index = state.processedCount; index < positions.length; index += 1) {
    appendPosition(layer, state, positions[index]);
  }
}
