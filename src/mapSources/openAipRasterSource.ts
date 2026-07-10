import TileLayer from 'ol/layer/Tile';
import XYZ from 'ol/source/XYZ';
import { apiPath } from '../config/apiBaseUrl';

export function createOpenAipRasterLayer(onTileError?: () => void) {
  const source = new XYZ({
    url: apiPath('/api/openaip/tiles/{z}/{x}/{y}.png'),
    tileSize: 256,
    minZoom: 6,
    maxZoom: 16,
    crossOrigin: 'anonymous',
    transition: 0,
    attributions: '© openAIP'
  });

  if (onTileError) {
    source.on('tileloaderror', onTileError);
  }

  return new TileLayer({
    source,
    opacity: 0.92,
    preload: 0,
    visible: true,
    properties: {
      name: 'openaip-raster-aero-overlay'
    }
  });
}
