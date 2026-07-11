import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReplayModel, ReplaySpeed } from '../domain/replay.types';
import { activeTimeForDistance, sampleReplay } from '../services/replay/traceReplayModel';

const FRAME_COMMIT_INTERVAL_MS = 50;

export function useTraceReplay(model: ReplayModel) {
  const [activeTimeMs, setActiveTimeMs] = useState(0);
  const [speed, setSpeed] = useState<ReplaySpeed>(1);
  const [playing, setPlaying] = useState(false);
  const [gapNoticeMs, setGapNoticeMs] = useState<number | null>(null);
  const activeTimeRef = useRef(0);
  const playingRef = useRef(false);
  const speedRef = useRef<ReplaySpeed>(1);
  const frameRef = useRef<number | null>(null);
  const previousFrameAtRef = useRef<number | null>(null);
  const lastCommitAtRef = useRef(0);
  const previousSegmentRef = useRef(0);

  const sample = useMemo(() => sampleReplay(model, activeTimeMs), [model, activeTimeMs]);

  useEffect(() => {
    activeTimeRef.current = 0;
    setActiveTimeMs(0);
    playingRef.current = false;
    setPlaying(false);
    previousSegmentRef.current = 0;
  }, [model]);

  useEffect(() => {
    if (!sample || sample.segmentIndex === previousSegmentRef.current) return undefined;
    const segment = model.segments[sample.segmentIndex];
    previousSegmentRef.current = sample.segmentIndex;
    if (!segment || segment.gapBeforeMs <= 0) return undefined;
    setGapNoticeMs(segment.gapBeforeMs);
    const timeout = window.setTimeout(() => setGapNoticeMs(null), 2200);
    return () => window.clearTimeout(timeout);
  }, [model.segments, sample?.segmentIndex]);

  useEffect(() => {
    if (!playing) return undefined;
    previousFrameAtRef.current = null;

    const frame = (now: number) => {
      if (!playingRef.current) return;
      const previous = previousFrameAtRef.current ?? now;
      previousFrameAtRef.current = now;
      const next = Math.min(model.totalActiveTimeMs, activeTimeRef.current + (now - previous) * speedRef.current);
      activeTimeRef.current = next;

      if (now - lastCommitAtRef.current >= FRAME_COMMIT_INTERVAL_MS || next >= model.totalActiveTimeMs) {
        lastCommitAtRef.current = now;
        setActiveTimeMs(next);
      }

      if (next >= model.totalActiveTimeMs) {
        playingRef.current = false;
        setPlaying(false);
        frameRef.current = null;
        return;
      }
      frameRef.current = window.requestAnimationFrame(frame);
    };

    frameRef.current = window.requestAnimationFrame(frame);
    return () => {
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    };
  }, [model.totalActiveTimeMs, playing]);

  const seek = (nextActiveTimeMs: number) => {
    const next = Math.max(0, Math.min(model.totalActiveTimeMs, nextActiveTimeMs));
    playingRef.current = false;
    setPlaying(false);
    activeTimeRef.current = next;
    setActiveTimeMs(next);
  };

  const seekDistance = (distanceNm: number) => seek(activeTimeForDistance(model, distanceNm));

  const togglePlayback = () => {
    if (model.points.length < 2 || model.totalActiveTimeMs <= 0) return;
    if (playingRef.current) {
      playingRef.current = false;
      setPlaying(false);
      return;
    }
    if (activeTimeRef.current >= model.totalActiveTimeMs) {
      activeTimeRef.current = 0;
      setActiveTimeMs(0);
      previousSegmentRef.current = 0;
    }
    playingRef.current = true;
    setPlaying(true);
  };

  const restart = () => seek(0);

  const changeSpeed = (next: ReplaySpeed) => {
    speedRef.current = next;
    setSpeed(next);
  };

  return {
    activeTimeMs,
    sample,
    speed,
    playing,
    gapNoticeMs,
    seek,
    seekDistance,
    togglePlayback,
    restart,
    changeSpeed
  };
}
