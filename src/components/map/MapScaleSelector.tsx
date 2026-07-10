export type MapMode = 'aero' | 'free';

interface MapScaleSelectorProps {
  value: MapMode;
  onChange: (value: MapMode) => void;
}

const values: Array<{ value: MapMode; label: string; description: string }> = [
  { value: 'aero', label: 'Carte aéro', description: 'Fond topo + couche aviation' },
  { value: 'free', label: 'Fond libre', description: 'Fond topo seul' }
];

export function MapScaleSelector({ value, onChange }: MapScaleSelectorProps) {
  return (
    <div className="scale-selector" role="group" aria-label="Sélecteur de carte">
      {values.map((item) => (
        <button
          key={item.value}
          type="button"
          className={value === item.value ? 'active' : ''}
          onClick={() => onChange(item.value)}
          title={item.description}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
