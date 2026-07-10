interface MetricCardProps {
  label: string;
  value: string;
  detail?: string;
  strong?: boolean;
}

export function MetricCard({ label, value, detail, strong = false }: MetricCardProps) {
  return (
    <div className={`metric-card ${strong ? 'strong' : ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {detail && <small>{detail}</small>}
    </div>
  );
}
