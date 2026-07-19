import type { ScreenId } from '../app/routes';
import type { AircraftProfile } from '../domain/aircraft.types';
import { Page } from '../components/layout/Page';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Accordion } from '../components/ui/Accordion';
import { AircraftProfilePanel } from '../components/flight/AircraftProfilePanel';

interface MoreScreenProps {
  onNavigate: (screen: ScreenId) => void;
  aircraftProfiles: AircraftProfile[];
  activeAircraft: AircraftProfile;
  onSelectAircraft: (profileId: string) => void;
  onUpdateAircraft: (profileId: string, patch: Partial<AircraftProfile>) => void;
  onCreateAircraft: () => void;
  onDeleteAircraft: (profileId: string) => void;
}

export function MoreScreen({ onNavigate, aircraftProfiles, activeAircraft, onSelectAircraft, onUpdateAircraft, onCreateAircraft, onDeleteAircraft }: MoreScreenProps) {
  return (
    <Page title="Plus" subtitle="Accès rapide aux outils de préparation.">
      <div className="more-grid">
        <Accordion
          title="Avion"
          subtitle={activeAircraft.label}
          className="more-aircraft-accordion"
          defaultOpen={false}
          storageKey="capclair.accordion.more.aircraft.v1"
        >
          <AircraftProfilePanel
            profiles={aircraftProfiles}
            activeProfile={activeAircraft}
            onSelectProfile={onSelectAircraft}
            onUpdateProfile={onUpdateAircraft}
            onCreateProfile={onCreateAircraft}
            onDeleteProfile={onDeleteAircraft}
          />
        </Accordion>
        <Card>
          <h2>Log de nav</h2>
          <p>Tableau complet avec altitude, vent, route vraie, variation, route magnétique, cap et vitesse sol.</p>
          <Button variant="secondary" onClick={() => onNavigate('calculations')}>Ouvrir le log</Button>
        </Card>
        <Card>
          <h2>Traces</h2>
          <p>Historique des suivis GPS enregistrés.</p>
          <Button variant="secondary" onClick={() => onNavigate('traces')}>Ouvrir les traces</Button>
        </Card>
        <Card className="safety-card">
          <strong>Limites</strong>
          <p>Application non réglementaire. Le suivi Android peut fonctionner écran éteint lorsque CAP CLAIR est autorisé à fonctionner sans restriction de batterie.</p>
        </Card>
      </div>
    </Page>
  );
}
