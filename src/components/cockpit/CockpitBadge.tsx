interface CockpitBadgeProps {
  label: string;
  state: 'ok' | 'rec' | 'warn' | 'off';
}

export function CockpitBadge({ label, state }: CockpitBadgeProps) {
  return <span className={`cockpit-badge ${state}`}>{label}</span>;
}
