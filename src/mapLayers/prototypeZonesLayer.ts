import Feature from 'ol/Feature';
import Polygon from 'ol/geom/Polygon';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import { Fill, Stroke, Style } from 'ol/style';
import { fromLonLat } from 'ol/proj';

export function createPrototypeZonesLayer() {
  const zone = new Feature(new Polygon([[
    fromLonLat([-0.18, 45.85]),
    fromLonLat([0.42, 45.86]),
    fromLonLat([0.46, 46.22]),
    fromLonLat([-0.20, 46.18]),
    fromLonLat([-0.18, 45.85])
  ]]));

  return new VectorLayer({
    source: new VectorSource({ features: [zone] }),
    style: new Style({
      stroke: new Stroke({ color: 'rgba(24, 174, 239, 0.8)', width: 2 }),
      fill: new Fill({ color: 'rgba(24, 174, 239, 0.08)' })
    }),
    properties: { name: 'prototype-zones' },
    zIndex: 10
  });
}
