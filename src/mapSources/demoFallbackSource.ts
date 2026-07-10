import TileLayer from 'ol/layer/Tile';
import XYZ from 'ol/source/XYZ';

const SVG_TILE = encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
  <rect width="256" height="256" fill="#07111C"/>
  <path d="M0 32H256M0 96H256M0 160H256M0 224H256M32 0V256M96 0V256M160 0V256M224 0V256" stroke="#1E3145" stroke-width="1" opacity="0.8"/>
  <path d="M-30 210 C 40 150, 100 230, 180 160 S 310 150, 286 40" fill="none" stroke="#243A51" stroke-width="11" opacity="0.6"/>
  <path d="M-10 60 C 70 30, 120 90, 260 42" fill="none" stroke="#1A2B3B" stroke-width="7" opacity="0.7"/>
  <text x="128" y="136" text-anchor="middle" fill="#6F7D8D" font-family="system-ui" font-size="13">FOND DEMO</text>
</svg>`);

export function createDemoFallbackLayer() {
  return new TileLayer({
    source: new XYZ({
      url: `data:image/svg+xml;charset=utf-8,${SVG_TILE}`,
      tileSize: 256,
      maxZoom: 19
    }),
    properties: {
      name: 'demo-fallback'
    }
  });
}
