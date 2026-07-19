import type { ScreenId } from "../app/routes";
import type { AircraftProfile } from "../domain/aircraft.types";
import { Page } from "../components/layout/Page";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Accordion } from "../components/ui/Accordion";
import { AircraftProfilePanel } from "../components/flight/AircraftProfilePanel";
import { AndroidUpdateCard } from "../components/update/AndroidUpdateCard";
import type { AndroidUpdateState } from "../hooks/useAndroidUpdate";
import type { SupAipDatasetState } from "../hooks/useSupAipDataset";
import { formatSupAipDatasetTimestamp } from "../services/supaip/supAipDataset";

interface MoreScreenProps {
  onNavigate: (screen: ScreenId) => void;
  aircraftProfiles: AircraftProfile[];
  activeAircraft: AircraftProfile;
  onSelectAircraft: (profileId: string) => void;
  onUpdateAircraft: (
    profileId: string,
    patch: Partial<AircraftProfile>,
  ) => void;
  onCreateAircraft: () => void;
  onDeleteAircraft: (profileId: string) => void;
  androidUpdate: AndroidUpdateState;
  supAipDataset: SupAipDatasetState;
}

export function MoreScreen({
  onNavigate,
  aircraftProfiles,
  activeAircraft,
  onSelectAircraft,
  onUpdateAircraft,
  onCreateAircraft,
  onDeleteAircraft,
  androidUpdate,
  supAipDataset,
}: MoreScreenProps) {
  const status = supAipDataset.bundle?.status;

  return (
    <Page title="Plus" subtitle="Préparation, historique et application.">
      <div className="more-grid">
        <Card className="more-briefing-card">
          <h2>Briefing aéronautique</h2>
          <p>
            Import PIB SOFIA, NOTAM pertinents, SUP AIP actualisées et mise en
            évidence sur une carte dédiée.
          </p>
          <div className="more-briefing-stats">
            <span>{status ? `${status.listingPublicationCount} SUP AIP` : "Chargement SUP AIP"}</span>
            <span>{status ? `${status.featureCount} géométries` : "Validation en cours"}</span>
            {supAipDataset.stale && <span>Base ancienne</span>}
          </div>
          {status && (
            <small>
              Base générée le {formatSupAipDatasetTimestamp(status.generatedAt)}.
            </small>
          )}
          <Button variant="primary" onClick={() => onNavigate("briefing")}>
            Ouvrir le briefing
          </Button>
        </Card>

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
          <h2>Traces</h2>
          <p>Historique des suivis GPS enregistrés.</p>
          <Button variant="secondary" onClick={() => onNavigate("traces")}>
            Ouvrir les traces
          </Button>
        </Card>

        <AndroidUpdateCard update={androidUpdate} />

        <Card className="safety-card">
          <strong>Limites</strong>
          <p>
            Application non réglementaire. Le suivi Android peut fonctionner
            écran éteint lorsque CAP CLAIR est autorisé à fonctionner sans
            restriction de batterie. Le briefing ne remplace jamais SOFIA, le
            SIA ni la préparation réglementaire.
          </p>
        </Card>
      </div>
    </Page>
  );
}
