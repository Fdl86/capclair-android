import type { ReactNode } from 'react';
import type { ScreenId } from '../../app/routes';
import { BottomNav } from './BottomNav';
import { HeaderBar } from './HeaderBar';

interface AppShellProps {
  currentScreen: ScreenId;
  onNavigate: (screen: ScreenId) => void;
  children: ReactNode;
}

export function AppShell({ currentScreen, onNavigate, children }: AppShellProps) {
  return (
    <div className="app-shell">
      <HeaderBar />
      <main className="app-main">{children}</main>
      <BottomNav currentScreen={currentScreen} onNavigate={onNavigate} />
    </div>
  );
}
