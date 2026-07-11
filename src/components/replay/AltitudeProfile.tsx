import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import type { ReplayModel, ReplaySample } from '../../domain/replay.types';

interface AltitudeProfileProps {
  model: ReplayModel;
  sample: ReplaySample | null;
  onSeekDistance: (distanceNm: number) => void;
}

interface ProfilePoint {
  x: number;
  y: number;
  index: number;
}

const HEIGHT = 160;
const TOP = 28;
const BOTTOM = 132;
const LEFT = 48;
const RIGHT = 12;

function niceStep(range: number): number {
  if (range <= 750) return 250;
  if (range <= 1800) return 500;
  return 1000;
}

function decimate(points: ProfilePoint[], maxPoints: number): ProfilePoint[] {
  if (points.length <= maxPoints) return points;
  const bucketSize = Math.ceil(points.length / Math.max(2, maxPoints / 2));
  const result: ProfilePoint[] = [points[0]];
  for (let start = 1; start < points.length - 1; start += bucketSize) {
    const bucket = points.slice(start, Math.min(points.length - 1, start + bucketSize));
    if (bucket.length === 0) continue;
    let min = bucket[0];
    let max = bucket[0];
    for (const point of bucket) {
      if (point.y < min.y) min = point;
      if (point.y > max.y) max = point;
    }
    if (min.index < max.index) result.push(min, max);
    else if (max.index < min.index) result.push(max, min);
    else result.push(min);
  }
  result.push(points.at(-1)!);
  return result;
}

export function AltitudeProfile({ model, sample, onSeekDistance }: AltitudeProfileProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);
  const [width, setWidth] = useState(420);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    const update = () => setWidth(Math.max(280, Math.round(host.getBoundingClientRect().width)));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  const altitudeValues = useMemo(() => model.points.map((point) => point.altitudeFt).filter((value): value is number => value !== null), [model]);
  const bounds = useMemo(() => {
    if (altitudeValues.length === 0) return { min: 0, max: 1000, step: 500 };
    const rawMin = Math.min(...altitudeValues);
    const rawMax = Math.max(...altitudeValues);
    const step = niceStep(Math.max(250, rawMax - rawMin));
    const min = Math.max(0, Math.floor((rawMin - step * 0.25) / step) * step);
    const max = Math.max(min + step, Math.ceil((rawMax + step * 0.25) / step) * step);
    return { min, max, step };
  }, [altitudeValues]);

  const plotWidth = Math.max(1, width - LEFT - RIGHT);
  const xForDistance = (distanceNm: number) => LEFT + (model.totalDistanceNm > 0 ? distanceNm / model.totalDistanceNm : 0) * plotWidth;
  const yForAltitude = (altitudeFt: number) => BOTTOM - ((altitudeFt - bounds.min) / (bounds.max - bounds.min)) * (BOTTOM - TOP);

  const paths = useMemo(() => model.segments.flatMap((segment) => {
    const pathGroups: ProfilePoint[][] = [];
    let current: ProfilePoint[] = [];
    for (let index = segment.startPointIndex; index <= segment.endPointIndex; index += 1) {
      const point = model.points[index];
      if (point.altitudeFt === null) {
        if (current.length > 0) pathGroups.push(current);
        current = [];
        continue;
      }
      current.push({ x: xForDistance(point.cumulativeDistanceNm), y: yForAltitude(point.altitudeFt), index });
    }
    if (current.length > 0) pathGroups.push(current);
    return pathGroups.map((group) => decimate(group, Math.max(120, Math.round(plotWidth * 1.8))));
  }), [bounds.max, bounds.min, model, plotWidth]);

  const gridValues = useMemo(() => {
    const values: number[] = [];
    for (let value = bounds.min; value <= bounds.max + 0.1; value += bounds.step) values.push(value);
    return values;
  }, [bounds]);

  const cursorX = xForDistance(sample?.cumulativeDistanceNm ?? 0);

  const seekFromClientX = (clientX: number) => {
    const rect = hostRef.current?.getBoundingClientRect();
    if (!rect) return;
    const svgX = ((clientX - rect.left) / rect.width) * width;
    const ratio = Math.max(0, Math.min(1, (svgX - LEFT) / plotWidth));
    onSeekDistance(ratio * model.totalDistanceNm);
  };

  const onPointerDown = (event: PointerEvent<SVGSVGElement>) => {
    draggingRef.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    seekFromClientX(event.clientX);
  };

  const onPointerMove = (event: PointerEvent<SVGSVGElement>) => {
    if (draggingRef.current) seekFromClientX(event.clientX);
  };

  const onPointerUp = (event: PointerEvent<SVGSVGElement>) => {
    draggingRef.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const onKeyDown = (event: KeyboardEvent<SVGSVGElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const direction = event.key === 'ArrowRight' ? 1 : -1;
    onSeekDistance((sample?.cumulativeDistanceNm ?? 0) + direction * model.totalDistanceNm * 0.01);
  };

  return (
    <div className="replay-profile-card" ref={hostRef}>
      <div className="replay-profile-heading">
        <strong>Profil d’altitude</strong>
        <span>ALT GPS · FT</span>
      </div>
      {altitudeValues.length === 0 ? (
        <div className="replay-profile-empty">Altitude indisponible pour cette trace.</div>
      ) : (
        <svg
          className="replay-profile-svg"
          viewBox={`0 0 ${width} ${HEIGHT}`}
          role="slider"
          tabIndex={0}
          aria-label="Position sur le profil d’altitude"
          aria-valuemin={0}
          aria-valuemax={Math.round(model.totalDistanceNm * 10) / 10}
          aria-valuenow={Math.round((sample?.cumulativeDistanceNm ?? 0) * 10) / 10}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onKeyDown={onKeyDown}
        >
          {gridValues.map((value) => {
            const y = yForAltitude(value);
            return (
              <g key={value}>
                <line x1={LEFT} y1={y} x2={width - RIGHT} y2={y} className="replay-profile-grid" />
                <text x={LEFT - 7} y={y + 3} textAnchor="end" className="replay-profile-axis">{Math.round(value).toLocaleString('fr-FR')}</text>
              </g>
            );
          })}
          {paths.map((path, index) => {
            if (path.length === 0) return null;
            const line = path.map((point, pointIndex) => `${pointIndex === 0 ? 'M' : 'L'}${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' ');
            const area = `M${path[0].x.toFixed(1)} ${BOTTOM} ${path.map((point) => `L${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' ')} L${path.at(-1)!.x.toFixed(1)} ${BOTTOM} Z`;
            return <g key={index}><path d={area} className="replay-profile-area" /><path d={line} className="replay-profile-line" /></g>;
          })}
          <line x1={cursorX} y1={TOP - 6} x2={cursorX} y2={BOTTOM + 2} className="replay-profile-cursor" />
          {sample?.altitudeFt !== null && sample?.altitudeFt !== undefined && (
            <circle cx={cursorX} cy={yForAltitude(sample.altitudeFt)} r={5} className="replay-profile-dot" />
          )}
          <text x={LEFT} y={151} className="replay-profile-axis">0</text>
          <text x={LEFT + plotWidth / 2} y={151} textAnchor="middle" className="replay-profile-axis">{(model.totalDistanceNm / 2).toFixed(1).replace('.', ',')}</text>
          <text x={width - RIGHT} y={151} textAnchor="end" className="replay-profile-axis">{model.totalDistanceNm.toFixed(1).replace('.', ',')} NM</text>
        </svg>
      )}
    </div>
  );
}
