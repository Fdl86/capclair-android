const AIRCRAFT_SVG = encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="144" height="100" viewBox="0 0 144 100">
  <defs>
    <linearGradient id="cell" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#D8E6ED"/></linearGradient>
    <linearGradient id="glass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#BFF2FF"/><stop offset="0.42" stop-color="#59CFFF"/><stop offset="1" stop-color="#168FC8"/></linearGradient>
  </defs>
  <g stroke="#07111C" stroke-width="3.4" stroke-linejoin="round" stroke-linecap="round">
    <path d="M66 28.5L9 28.8Q4.2 28.8 3.4 33L4 46.7Q4.4 51.2 9 51L65.5 49Z" fill="url(#cell)"/>
    <path d="M78 28.5L135 28.8Q139.8 28.8 140.6 33L140 46.7Q139.6 51.2 135 51L78.5 49Z" fill="url(#cell)"/>
    <path d="M8.8 43.7L65.4 46.1M135.2 43.7L78.6 46.1" fill="none" stroke="#9DB2BE" stroke-width="1.3"/>
    <path d="M19 29.3L18.5 50.6M125 29.3L125.5 50.6" fill="none" stroke="#B8CAD3" stroke-width="1.1"/>
    <path d="M69 78.8L52.2 78.7Q49.8 78.7 49.7 81L50.2 89.2L69.7 88Z" fill="url(#cell)"/>
    <path d="M75 78.8L91.8 78.7Q94.2 78.7 94.3 81L93.8 89.2L74.3 88Z" fill="url(#cell)"/>
    <path d="M72 2.5C65.9 4.4 63.7 11.7 63.5 21.2C63.2 32.7 61.7 44.8 63.2 55.3C64.4 64 67.2 71.5 68.5 81.5L70.1 95.6Q72 99.1 73.9 95.6L75.5 81.5C76.8 71.5 79.6 64 80.8 55.3C82.3 44.8 80.8 32.7 80.5 21.2C80.3 11.7 78.1 4.4 72 2.5Z" fill="url(#cell)"/>
    <path d="M72 10.2C66.5 13.5 65.9 26.7 66.6 38.1C67.4 43.4 76.6 43.4 77.4 38.1C78.1 26.7 77.5 13.5 72 10.2Z" fill="url(#glass)" stroke-width="2.3"/>
    <path d="M72 12.7V40.1" fill="none" stroke="#E2FAFF" stroke-width="1.15"/>
    <circle cx="72" cy="4.5" r="2.8" fill="#18AEEF" stroke-width="1.5"/>
    <path d="M72 47V92" fill="none" stroke="#B2C7D1" stroke-width="1.1"/>
    <path d="M69.4 67L72 97L74.6 67L72 72.7Z" fill="#59CFFF" stroke-width="1.65"/>
  </g>
</svg>`);

export const AIRCRAFT_ICON_SRC = `data:image/svg+xml;charset=UTF-8,${AIRCRAFT_SVG}`;

export function aircraftScaleForZoom(zoom?: number): number {
  if (typeof zoom !== 'number' || !Number.isFinite(zoom)) return 32 / 144;
  const safeZoom = Math.max(6, Math.min(14, zoom));
  const normalized = (safeZoom - 6) / 8;
  const targetWidthPx = 26 + normalized * 12;
  return Number((targetWidthPx / 144).toFixed(4));
}
