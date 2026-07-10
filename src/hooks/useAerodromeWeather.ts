import { useEffect, useMemo, useRef, useState } from 'react';
import type { AerodromeWeather, AerodromeWeatherRequestItem } from '../domain/weather.types';
import { buildAerodromeWeatherRequestItems } from '../services/weather/aerodromeWeatherCandidates';
import { fetchAerodromeWeather } from '../services/weather/aerodromeWeatherClient';

export function useAerodromeWeather(codes: string[]) {
  const items = useMemo(() => buildAerodromeWeatherRequestItems(codes), [codes.join('|')]);
  const itemsKey = useMemo(() => items.map((item) => `${item.icao}:${item.candidates.map((candidate) => candidate.icao).join('-')}`).join('|'), [items]);
  const [reports, setReports] = useState<Record<string, AerodromeWeather>>({});
  const [status, setStatus] = useState('METAR/TAF non chargé');
  const [updatedAtIso, setUpdatedAtIso] = useState<string | null>(null);
  const requestId = useRef(0);

  const refresh = async (force = true) => {
    if (!items.length) return;
    const id = ++requestId.current;
    setStatus('Météo aérodromes en cours...');
    try {
      const response = await fetchAerodromeWeather(items as AerodromeWeatherRequestItem[], force);
      if (id !== requestId.current) return;
      const nextReports: Record<string, AerodromeWeather> = {};
      for (const report of response.reports) {
        nextReports[report.requestedIcao || report.icao] = report;
      }
      setReports(nextReports);
      setUpdatedAtIso(response.generatedAt);
      setStatus('METAR/TAF OK');
    } catch {
      if (id !== requestId.current) return;
      setStatus('Erreur METAR/TAF');
    }
  };

  useEffect(() => {
    void refresh(false);
  }, [itemsKey]);

  return { items, reports, status, updatedAtIso, refresh };
}
