import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import { fromLonLat } from 'ol/proj';
import { Circle as CircleStyle, Fill, Stroke, Style, Text } from 'ol/style';
import type { OpenAipAirport } from '../services/openaip/openAipTypes';

const airportFill = new Fill({ color: 'rgba(5, 11, 18, 0.94)' });
const airportStroke = new Stroke({ color: '#18AEEF', width: 2.5 });
const airportTextFill = new Fill({ color: '#F3F7FA' });
const airportTextStroke = new Stroke({ color: 'rgba(5, 11, 18, 0.95)', width: 4 });
const airportOuterStroke = new Stroke({ color: 'rgba(255, 255, 255, 0.72)', width: 1 });

function airportLabel(airport: OpenAipAirport): string {
  return airport.icaoCode || airport.name.slice(0, 12);
}

function airportFeature(airport: OpenAipAirport): Feature<Point> {
  const feature = new Feature(new Point(fromLonLat([airport.longitude, airport.latitude])));
  feature.set('label', airportLabel(airport));
  feature.set('name', airport.name);
  return feature;
}

function makeFeatures(airports: OpenAipAirport[]): Feature<Point>[] {
  return airports
    .filter((airport) => Number.isFinite(airport.longitude) && Number.isFinite(airport.latitude))
    .map(airportFeature);
}

export function createOpenAipAirportsLayer(airports: OpenAipAirport[]) {
  const source = new VectorSource({ features: makeFeatures(airports) });
  return new VectorLayer({
    source,
    style: (feature, resolution) => {
      const showLabel = resolution < 260;
      return [
        new Style({
          image: new CircleStyle({
            radius: 7,
            fill: airportFill,
            stroke: airportOuterStroke
          })
        }),
        new Style({
          image: new CircleStyle({
            radius: 4,
            fill: new Fill({ color: '#18AEEF' }),
            stroke: airportStroke
          }),
          text: showLabel
            ? new Text({
                text: String(feature.get('label') || ''),
                offsetY: -17,
                font: '800 11px system-ui',
                fill: airportTextFill,
                stroke: airportTextStroke
              })
            : undefined
        })
      ];
    },
    declutter: true,
    zIndex: 18,
    properties: { name: 'openaip-airports' }
  });
}

export function updateOpenAipAirportsLayer(layer: ReturnType<typeof createOpenAipAirportsLayer>, airports: OpenAipAirport[]): void {
  const source = layer.getSource();
  if (!source) return;
  source.clear(true);
  source.addFeatures(makeFeatures(airports));
}
