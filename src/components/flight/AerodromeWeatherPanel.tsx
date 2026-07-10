import type { AerodromeWeather } from '../../domain/weather.types';
import type { AerodromeRadioRef } from '../../data/aerodromeRadioCatalog';
import { getAerodromeRadios } from '../../data/aerodromeRadioCatalog';
import { Button } from '../ui/Button';

interface WeatherItem {
  role: string;
  code: string;
  name?: string;
}

interface AerodromeWeatherPanelProps {
  items: WeatherItem[];
  reports: Record<string, AerodromeWeather>;
  status: string;
  updatedAtIso: string | null;
  onRefresh: () => void;
}

function timeZulu(iso?: string | null) {
  if (!iso) return 'Jamais';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Jamais';
  return `${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}Z`;
}

function reportText(value?: string) {
  return value?.trim() || 'Non reçu';
}

function stationDistanceText(report: AerodromeWeather | undefined) {
  if (!report || report.stationDistanceKm <= 1) return null;
  return `Station météo à ${Math.round(report.stationDistanceKm)} km`;
}

function radioText(radios: AerodromeRadioRef[]) {
  if (!radios.length) return 'À confirmer';
  return radios.slice(0, 5).map((radio) => `${radio.type} ${radio.frequency}`).join(' / ');
}

export function AerodromeWeatherPanel({ items, reports, status, updatedAtIso, onRefresh }: AerodromeWeatherPanelProps) {
  return (
    <div className="aerodrome-weather-panel">
      <div className="subpanel-title-row">
        <div>
          <span>Météo aérodromes</span>
          <strong>{status}</strong>
        </div>
        <Button variant="secondary" onClick={onRefresh}>Maj METAR/TAF</Button>
      </div>
      <small className="weather-updated">MAJ {timeZulu(updatedAtIso)}</small>

      <div className="weather-report-list">
        {items.map((item) => {
          const report = reports[item.code];
          const radios = getAerodromeRadios(item.code);
          return (
            <div key={`${item.role}:${item.code}`} className={`weather-report-card ${report?.status ?? 'idle'}`}>
              <div>
                <span>{item.role}</span>
                <strong>{item.code}{item.name ? ` - ${item.name}` : ''}</strong>
              </div>
              {stationDistanceText(report) && <p className="weather-station-distance">{stationDistanceText(report)}</p>}
              <dl>
                <dt>METAR</dt>
                <dd>{reportText(report?.metarRaw)}</dd>
                <dt>TAF</dt>
                <dd>{reportText(report?.tafRaw)}</dd>
                <dt>Radio</dt>
                <dd>{radioText(radios)}</dd>
              </dl>
            </div>
          );
        })}
      </div>
    </div>
  );
}
