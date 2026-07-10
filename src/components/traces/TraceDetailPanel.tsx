import type { Trace } from '../../domain/trace.types';

interface TraceDetailPanelProps {
  trace: Trace | null;
}

export function TraceDetailPanel({ trace }: TraceDetailPanelProps) {
  if (!trace) return null;
  return (
    <aside className="trace-detail-panel">
      <span>Détail trace</span>
      <strong>{trace.routeName}</strong>
      <p>{trace.positions.length} positions sauvegardées localement.</p>
    </aside>
  );
}
