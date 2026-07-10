import TileLayer from 'ol/layer/Tile';
import XYZ from 'ol/source/XYZ';
import { apiPath } from '../config/apiBaseUrl';

/*
  Licence / accès :
  Les données SCAN-OACI ne sont pas des données libres.
  La clé publique `ign_scan_ws` est une clé transitoire partagée pouvant être retirée.
  Le chemin pérenne consiste à utiliser une clé personnelle via cartes.gouv.fr.
  Usage gratuit cadré professionnel / associatif selon les conditions du service.
*/

export function createIgnOaciVfrLayer(onTileError?: () => void) {
  const source = new XYZ({
      url: apiPath('/api/ign/oaci/{z}/{x}/{y}.jpg'),
      tileSize: 256,
      minZoom: 6,
      maxZoom: 11,
      crossOrigin: 'anonymous',
      transition: 0,
      attributions: '© IGN / SIA - OACI-VFR'
    });

  if (onTileError) {
    source.on('tileloaderror', onTileError);
  }

  return new TileLayer({
    source,
    opacity: 1,
    preload: 0,
    visible: false,
    properties: {
      name: 'ign-sia-oaci-vfr-500k'
    }
  });
}
