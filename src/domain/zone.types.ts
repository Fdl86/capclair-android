export type ZoneStatus = 'traversee' | 'proche' | 'libre' | 'a_verifier';

export interface ZonePrototype {
  id: string;
  nom: string;
  type: string;
  plancher: string;
  plafond: string;
  statut: ZoneStatus;
  distanceRouteNm: number;
  brancheAssociee: string;
}
