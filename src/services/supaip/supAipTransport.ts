import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { apiPath } from '../../config/apiBaseUrl';

function parseJsonPayload<T>(value: unknown): T {
  if (typeof value === 'string') return JSON.parse(value) as T;
  return value as T;
}

async function fetchJsonWeb<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, {
    cache: 'no-store',
    signal,
    headers: { Accept: 'application/json, application/geo+json' }
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} sur ${url}`);
  return response.json() as Promise<T>;
}

export async function fetchRemoteJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const url = apiPath(path);
  if (!Capacitor.isNativePlatform()) return fetchJsonWeb<T>(url, signal);

  const response = await CapacitorHttp.get({
    url,
    headers: {
      Accept: 'application/json, application/geo+json',
      'Cache-Control': 'no-cache'
    },
    connectTimeout: 15_000,
    readTimeout: 30_000
  });
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`HTTP ${response.status} sur ${url}`);
  }
  return parseJsonPayload<T>(response.data);
}

export async function fetchEmbeddedJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  return fetchJsonWeb<T>(path, signal);
}
