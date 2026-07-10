import { Capacitor } from '@capacitor/core';

const DEFAULT_NATIVE_API_BASE_URL = 'https://capclair.pages.dev';

function cleanBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, '');
}

export function getApiBaseUrl(): string {
  const configured = cleanBaseUrl(import.meta.env.VITE_CAPCLAIR_API_BASE_URL ?? '');
  if (configured) return configured;

  if (Capacitor.isNativePlatform()) {
    return DEFAULT_NATIVE_API_BASE_URL;
  }

  return '';
}

export function apiPath(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const baseUrl = getApiBaseUrl();
  return baseUrl ? `${baseUrl}${normalizedPath}` : normalizedPath;
}

export function isUsingRemoteApiProxy(): boolean {
  return getApiBaseUrl().length > 0;
}
