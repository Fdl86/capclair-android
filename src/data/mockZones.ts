import type { ZonePrototype } from '../domain/zone.types';

export const mockZones: ZonePrototype[] = [
  {
    id: 'zone-free-1',
    nom: 'Hors espace aérien',
    type: 'Info',
    plancher: 'SFC',
    plafond: 'FL195',
    statut: 'libre',
    distanceRouteNm: 0,
    brancheAssociee: 'lfbd-wpt1'
  },
  {
    id: 'ctr-poitiers',
    nom: 'CTR Poitiers',
    type: 'CTR',
    plancher: 'SFC',
    plafond: '2500 ft',
    statut: 'traversee',
    distanceRouteNm: 28,
    brancheAssociee: 'wpt1-wpt2'
  },
  {
    id: 'tma-poitiers-3',
    nom: 'TMA Poitiers 3',
    type: 'TMA',
    plancher: '2500 ft',
    plafond: 'FL065',
    statut: 'traversee',
    distanceRouteNm: 64,
    brancheAssociee: 'wpt2-wpt3'
  },
  {
    id: 'r-265',
    nom: 'R 265',
    type: 'R',
    plancher: '3500 ft',
    plafond: 'FL065',
    statut: 'proche',
    distanceRouteNm: 95,
    brancheAssociee: 'wpt2-wpt3'
  },
  {
    id: 'zone-free-2',
    nom: 'Hors espace aérien',
    type: 'Info',
    plancher: 'SFC',
    plafond: 'FL195',
    statut: 'libre',
    distanceRouteNm: 124,
    brancheAssociee: 'wpt3-lfeh'
  }
];
