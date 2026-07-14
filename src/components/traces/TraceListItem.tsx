import { useState } from 'react';
import type { Trace } from '../../domain/trace.types';
import { Button } from '../ui/Button';
import { exportGpx, exportJson } from '../../services/export/gpxExport';
import { exportNativeGpsDiagnostic } from '../../services/gps/nativeGpsSession';
import { isAndroidNativeGpsAvailable } from '../../services/gps/nativeGpsProvider';

interface TraceListItemProps {
  trace: Trace;
  replayDisabled: boolean;
  onOpenReplay: (traceId: string) => void;
  onDelete: (traceId: string) => void;
}

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${minutes} min ${String(remaining).padStart(2, '0')} s`;
}

export function TraceListItem({ trace, replayDisabled, onOpenReplay, onDelete }: TraceListItemProps) {
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const runExport = async (format: 'gpx' | 'json') => {
    if (isExporting) return;
    setIsExporting(true);
    setExportStatus(format === 'gpx' ? 'Préparation GPX...' : 'Préparation JSON...');
    try {
      const result = format === 'gpx' ? await exportGpx(trace) : await exportJson(trace);
      setExportStatus(`${result.fileName} - ${result.message}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || 'Erreur inconnue');
      setExportStatus(`Export impossible : ${message}`);
    } finally {
      setIsExporting(false);
    }
  };

  const runDiagnostic = async () => {
    if (isExporting) return;
    setIsExporting(true);
    setExportStatus('Préparation du diagnostic GPS brut...');
    try {
      const result = await exportNativeGpsDiagnostic(trace);
      const pointCount = result.diagnostic?.validPointCount;
      const gapMs = result.diagnostic?.maxPointGapMs;
      const summary = typeof pointCount === 'number'
        ? `journal ${pointCount} points${typeof gapMs === 'number' && gapMs > 0 ? `, trou max ${Math.round(gapMs / 1000)} s` : ''}`
        : 'journal Android exporté';
      setExportStatus(`${result.fileName} - ${summary}.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || 'Erreur inconnue');
      setExportStatus(`Diagnostic impossible : ${message}`);
    } finally {
      setIsExporting(false);
    }
  };

  const canExportNativeDiagnostic = trace.source === 'android-native'
    && Boolean(trace.sessionId)
    && isAndroidNativeGpsAvailable();

  return (
    <article className="trace-item">
      <div>
        <strong>{trace.routeName}</strong>
        <span>{new Date(trace.date).toLocaleString('fr-FR')}</span>
      </div>
      <dl>
        <div><dt>Durée</dt><dd>{formatDuration(trace.dureeSec)}</dd></div>
        <div><dt>Distance</dt><dd>{trace.distanceNm.toFixed(1)} NM</dd></div>
        <div><dt>Points</dt><dd>{trace.positions.length}</dd></div>
      </dl>
      <div className="trace-actions">
        <Button variant="primary" disabled={replayDisabled || isExporting} onClick={() => onOpenReplay(trace.id)} title={replayDisabled ? 'Arrêtez le suivi GPS pour lancer le replay.' : 'Ouvrir le replay'}>Replay</Button>
        <Button variant="secondary" disabled={isExporting} onClick={() => runExport('gpx')}>Exporter GPX</Button>
        <Button variant="ghost" disabled={isExporting} onClick={() => runExport('json')}>JSON secours</Button>
        {canExportNativeDiagnostic && (
          <Button variant="ghost" disabled={isExporting} onClick={runDiagnostic}>Diagnostic GPS</Button>
        )}
        <Button variant="ghost" disabled={isExporting} onClick={() => onDelete(trace.id)}>Supprimer</Button>
      </div>
      {exportStatus && <p className="trace-export-status">{exportStatus}</p>}
    </article>
  );
}
