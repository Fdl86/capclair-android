import { useState } from 'react';
import type { Trace } from '../domain/trace.types';
import { Page } from '../components/layout/Page';
import { TraceListItem } from '../components/traces/TraceListItem';
import { EmptyState } from '../components/ui/EmptyState';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { Card } from '../components/ui/Card';

interface TracesScreenProps {
  traces: Trace[];
  onDeleteTrace: (traceId: string) => Promise<boolean>;
  onOpenReplay: (traceId: string) => void;
  replayDisabled: boolean;
  storageError?: string | null;
}

export function TracesScreen({ traces, onDeleteTrace, onOpenReplay, replayDisabled, storageError }: TracesScreenProps) {
  const [traceToDelete, setTraceToDelete] = useState<string | null>(null);
  const [deletingTrace, setDeletingTrace] = useState(false);

  return (
    <Page title="Mes traces" subtitle="Traces locales sauvegardées sur cet appareil.">
      {storageError && (
        <Card className="gps-warning">
          <strong>Stockage des traces</strong>
          <p>{storageError}</p>
        </Card>
      )}
      <div className="traces-list">
        {traces.length === 0 && <EmptyState title="Aucune trace sauvegardée" text="Démarre le suivi GPS ou la simulation, puis arrête et sauvegarde la trace." />}
        {traces.map((trace) => (
          <TraceListItem
            key={trace.id}
            trace={trace}
            replayDisabled={replayDisabled}
            onOpenReplay={() => onOpenReplay(trace.id)}
            onDelete={() => setTraceToDelete(trace.id)}
          />
        ))}
      </div>
      <ConfirmDialog
        open={traceToDelete !== null}
        title="Supprimer la trace ?"
        message="La suppression est locale et définitive sur cet appareil."
        confirmLabel={deletingTrace ? 'Suppression...' : 'Supprimer'}
        confirmDisabled={deletingTrace}
        cancelDisabled={deletingTrace}
        onCancel={() => setTraceToDelete(null)}
        onConfirm={async () => {
          if (!traceToDelete || deletingTrace) return;
          setDeletingTrace(true);
          try {
            const deleted = await onDeleteTrace(traceToDelete);
            if (deleted) setTraceToDelete(null);
          } finally {
            setDeletingTrace(false);
          }
        }}
      />
    </Page>
  );
}
