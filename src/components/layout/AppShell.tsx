import type { ReactNode } from 'react';
import type { ScreenId } from '../../app/routes';
import { BottomNav } from './BottomNav';
import { HeaderBar } from './HeaderBar';

interface AppShellProps {
  currentScreen: ScreenId;
  onNavigate: (screen: ScreenId) => void;
  children: ReactNode;
  immersive?: boolean;
}

export function AppShell({ currentScreen, onNavigate, children, immersive = false }: AppShellProps) {
  return (
    <div className={`app-shell ${immersive ? 'is-immersive' : ''}`}>
      {!immersive && <HeaderBar />}
      <main className="app-main">{children}</main>
      {!immersive && <BottomNav currentScreen={currentScreen} onNavigate={onNavigate} />}
    </div>
  );
}
