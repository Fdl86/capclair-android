interface MapFallbackNoticeProps {
  mode: 'openaip' | 'oaci';
}

export function MapFallbackNotice({ mode }: MapFallbackNoticeProps) {
  const isOaci = mode === 'oaci';

  return (
    <div className="map-fallback-notice">
      <strong>{isOaci ? 'Fond OACI indisponible' : 'Couche openAIP indisponible'}</strong>
      <span>{isOaci ? 'Tuiles IGN / SIA non reçues.' : 'Fond carte affiché, données openAIP non reçues.'}</span>
    </div>
  );
}
