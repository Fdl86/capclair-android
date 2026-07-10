import TileLayer from 'ol/layer/Tile';
import XYZ from 'ol/source/XYZ';

export function createFreeMapLayer() {
  return new TileLayer({
    source: new XYZ({
      url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      tileSize: 256,
      maxZoom: 19,
      crossOrigin: 'anonymous',
      transition: 0,
      attributions: '© OpenStreetMap contributors'
    }),
    preload: 0,
    properties: {
      name: 'free-osm-dev'
    }
  });
}
