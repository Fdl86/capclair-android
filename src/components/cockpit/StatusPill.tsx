interface StatusPillProps {
  label: string;
  value: string;
  tone?: 'cyan' | 'green' | 'amber' | 'red' | 'muted';
}

export function StatusPill({ label, value, tone = 'cyan' }: StatusPillProps) {
  return (
    <div className={`status-pill ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
