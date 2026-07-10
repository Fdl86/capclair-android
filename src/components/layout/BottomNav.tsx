import type { ScreenId } from '../../app/routes';

interface BottomNavProps {
  currentScreen: ScreenId;
  onNavigate: (screen: ScreenId) => void;
}

const items: Array<{ id: ScreenId; label: string; icon: string }> = [
  { id: 'planning', label: 'Planifier', icon: '✣' },
  { id: 'calculations', label: 'Log nav', icon: '▦' },
  { id: 'tracking', label: 'Suivi', icon: '⌖' },
  { id: 'more', label: 'Plus', icon: '•••' }
];

export function BottomNav({ currentScreen, onNavigate }: BottomNavProps) {
  return (
    <nav className="bottom-nav" aria-label="Navigation principale">
      {items.map((item) => (
        <button key={item.id} type="button" className={currentScreen === item.id ? 'active' : ''} onClick={() => onNavigate(item.id)}>
          <span>{item.icon}</span>
          <strong>{item.label}</strong>
        </button>
      ))}
    </nav>
  );
}
