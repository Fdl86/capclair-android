import type { ScreenId } from '../app/routes';
import { APP_SUBTITLE, APP_TITLE, APP_VERSION } from '../app/version';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';

interface HomeScreenProps {
  onNavigate: (screen: ScreenId) => void;
}

export function HomeScreen({ onNavigate }: HomeScreenProps) {
  return (
    <section className="home-screen">
      <div className="hero-card">
        <div className="hero-overlay" />
        <div className="hero-content">
          <img src="/cap-clair-logo.svg" alt="" />
          <span>{APP_VERSION}</span>
          <h1>{APP_TITLE}</h1>
          <p>{APP_SUBTITLE}</p>
          <strong>Préparer. Naviguer. Voler en confiance.</strong>
        </div>
      </div>

      <div className="home-actions">
        <Button variant="primary" onClick={() => onNavigate('planning')}>Préparer une navigation</Button>
        <Button variant="secondary" onClick={() => onNavigate('planning')}>Reprendre la dernière nav</Button>
        <Button variant="secondary" onClick={() => onNavigate('tracking')}>Lancer le suivi GPS</Button>
        <Button variant="secondary" onClick={() => onNavigate('traces')}>Mes traces</Button>
      </div>

      <Card className="system-card">
        <h2>Système</h2>
        <div className="system-badges">
          <span className="system-badge green"><strong>GPS</strong> Prêt</span>
          <span className="system-badge cyan"><strong>Météo</strong> Vent</span>
          <span className="system-badge amber"><strong>Carte</strong> Aéro</span>
        </div>
      </Card>

      <Card className="safety-card">
        <strong>Prototype</strong>
        <p>Prototype technique et UX. Ne pas utiliser comme source unique de navigation. Sur Android, le suivi écran éteint nécessite l'autorisation de batterie sans restriction.</p>
      </Card>
    </section>
  );
}
