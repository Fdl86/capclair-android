export interface OpenAipAirport {
  id: string;
  name: string;
  icaoCode?: string;
  type?: number | string;
  latitude: number;
  longitude: number;
  elevationValue?: number;
  elevationUnit?: string;
}

export interface OpenAipAirportResponse {
  airports: OpenAipAirport[];
  source: 'openaip';
  cachedAt?: string;
  upstreamCount?: number;
}
