import { removeExpiredLocalStorageEntries } from './localStorageService';

const WEATHER_CACHE_PREFIX = 'capclair.weather.metarTaf.v3.nearest.';
const WIND_CACHE_PREFIX = 'capclair.weather.windAloft.v13_5.meteofranceStrict.';

export function runStorageMaintenance(): void {
  removeExpiredLocalStorageEntries(WEATHER_CACHE_PREFIX, 5 * 60 * 1000);
  removeExpiredLocalStorageEntries(WIND_CACHE_PREFIX, 60 * 60 * 1000);
}
