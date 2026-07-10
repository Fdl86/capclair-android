import { useEffect, useMemo, useState } from 'react';
import type { BranchZoneProfile } from '../domain/airspace.types';
import type { NavRoute } from '../domain/navigation.types';
import type { AircraftProfile } from '../domain/aircraft.types';
import { Page } from '../components/layout/Page';
import { Card } from '../components/ui/Card';
import { ZoneCompleteRouteBanner } from '../components/navigation/ZoneCompleteRouteBanner';
import { buildZoneProfiles } from '../services/airspace/airspaceEngine';
import { fetchTerrainProfile, type TerrainSample } from '../services/navigation/terrainService';
import { buildVerticalProfile } from '../services/navigation/verticalProfileService';

interface ZonesScreenProps {
  route: NavRoute;
  aircraft: AircraftProfile;
}

export function ZonesScreen({ route, aircraft }: ZonesScreenProps) {
  const [profiles, setProfiles] = useState<Record<string, BranchZoneProfile>>({});
  const [status, setStatus] = useState('Calcul zones...');
  const [terrain, setTerrain] = useState<TerrainSample[]>([]);

  useEffect(() => {
    let cancelled = false;
    setStatus('Calcul zones...');
    buildZoneProfiles(route)
      .then((nextProfiles) => {
        if (cancelled) return;
        setProfiles(nextProfiles);
        setStatus('Zones calculées');
      })
      .catch(() => {
        if (cancelled) return;
        setProfiles({});
        setStatus('Zones à confirmer');
      });

    return () => {
      cancelled = true;
    };
  }, [route]);

  useEffect(() => {
    let cancelled = false;
    fetchTerrainProfile(route)
      .then((samples) => {
        if (!cancelled) setTerrain(samples);
      })
      .catch(() => {
        if (!cancelled) setTerrain([]);
      });

    return () => {
      cancelled = true;
    };
  }, [route]);

  const verticalProfile = useMemo(() => buildVerticalProfile(route, aircraft), [route, aircraft]);
  const [shownZoneCount, setShownZoneCount] = useState(0);

  return (
    <Page title="Zones" subtitle="Vue verticale des zones traversées, du profil de vol et du relief.">
      <div className="zones-screen">
        <Card className="zone-banner-card">
          <div className="panel-title-row">
            <div>
              <span>Bannière zones</span>
              <strong>{shownZoneCount ? `${shownZoneCount} zones sur la nav` : status}</strong>
            </div>
          </div>
          {Object.keys(profiles).length ? (
            <ZoneCompleteRouteBanner route={route} profiles={profiles} terrain={terrain} profile={verticalProfile} onVisibleCountChange={setShownZoneCount} />
          ) : (
            <div className="zone-banner-loading">{status}</div>
          )}
        </Card>
        <Card className="safety-card">
          <strong>Préparation</strong>
          <p>Les blocs représentent les espaces rencontrés par la route. La ligne cyan est le profil de vol (montée, paliers, descente), la silhouette en bas le relief (RGE ALTI IGN).</p>
        </Card>
      </div>
    </Page>
  );
}
