import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { NavRoute } from '../domain/navigation.types';
import type { PibAnalysis } from '../domain/notam.types';
import { routeSnapshotFromRoute } from '../domain/notam.types';
import type { SupAipDatasetBundle } from '../services/supaip/supAipDataset';
import { extractTextFromPdf } from '../services/notam/pdfTextExtractor';
import { analyzePibText } from '../services/notam/pibAnalysis';
import { clearStoredBriefing, loadStoredBriefing, storeBriefing } from '../services/notam/notamStorage';

export function usePibBriefing(
  route: NavRoute,
  alternateCodes: string[],
  supAipBundle: SupAipDatasetBundle | null
) {
  const [analysis, setAnalysis] = useState<PibAnalysis | null>(null);
  const [loadingStored, setLoadingStored] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const automaticRevisionRef = useRef<string | null>(null);
  const currentRouteSnapshot = useMemo(
    () => routeSnapshotFromRoute(route, alternateCodes),
    [route, alternateCodes.join(',')]
  );

  useEffect(() => {
    let cancelled = false;
    void loadStoredBriefing().then((stored) => {
      if (!cancelled) setAnalysis(stored);
    }).finally(() => {
      if (!cancelled) setLoadingStored(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const runAnalysis = useCallback(async (
    text: string,
    sourceKind: 'pdf' | 'text',
    sourceFileName: string | null,
    sourceFingerprint?: string
  ) => {
    if (!supAipBundle) throw new Error('La base SUP AIP n’est pas encore disponible.');
    setAnalyzing(true);
    setError(null);
    try {
      const next = await analyzePibText({
        text,
        sourceKind,
        sourceFileName,
        sourceFingerprint,
        routeSnapshot: currentRouteSnapshot,
        supAipBundle
      });
      await storeBriefing(next);
      setAnalysis(next);
      return next;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Analyse du briefing impossible.';
      setError(message);
      throw cause;
    } finally {
      setAnalyzing(false);
    }
  }, [currentRouteSnapshot, supAipBundle]);

  const analyzePdf = useCallback(async (file: File) => {
    if (file.size > 30 * 1024 * 1024) throw new Error('Le PDF dépasse la limite locale de 30 Mo.');
    if (file.type && file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      throw new Error('Le fichier sélectionné n’est pas un PDF.');
    }
    setAnalyzing(true);
    setError(null);
    try {
      if (!supAipBundle) throw new Error('La base SUP AIP n’est pas encore disponible.');
      const extracted = await extractTextFromPdf(file);
      const next = await analyzePibText({
        text: extracted.text,
        sourceKind: 'pdf',
        sourceFileName: file.name,
        sourceFingerprint: extracted.fingerprint,
        routeSnapshot: currentRouteSnapshot,
        supAipBundle
      });
      await storeBriefing(next);
      setAnalysis(next);
      return next;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Import PDF impossible.';
      setError(message);
      throw cause;
    } finally {
      setAnalyzing(false);
    }
  }, [currentRouteSnapshot, supAipBundle]);

  const reanalyze = useCallback(async () => {
    if (!analysis) return null;
    return runAnalysis(analysis.rawText, analysis.sourceKind, analysis.sourceFileName);
  }, [analysis, runAnalysis]);

  useEffect(() => {
    const revision = supAipBundle?.status.datasetRevision ?? null;
    if (!analysis || !revision || analyzing || analysis.supAipDatasetRevision === revision) return;
    if (automaticRevisionRef.current === revision) return;
    automaticRevisionRef.current = revision;
    void runAnalysis(analysis.rawText, analysis.sourceKind, analysis.sourceFileName).catch(() => {
      // L’ancien briefing reste disponible si la réconciliation automatique échoue.
    });
  }, [analysis, analyzing, runAnalysis, supAipBundle?.status.datasetRevision]);

  const clear = useCallback(async () => {
    await clearStoredBriefing();
    setAnalysis(null);
    setError(null);
  }, []);

  return {
    analysis,
    loadingStored,
    analyzing,
    error,
    currentRouteSnapshot,
    routeChangedSinceAnalysis: Boolean(analysis && analysis.routeSnapshot.signature !== currentRouteSnapshot.signature),
    analyzePdf,
    analyzeText: (text: string) => runAnalysis(text, 'text', null),
    reanalyze,
    clear
  };
}
