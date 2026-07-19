import { Capacitor, registerPlugin } from '@capacitor/core';
import { apiPath } from '../../config/apiBaseUrl';

const MAX_SUP_AIP_PAYLOAD_BYTES = 4 * 1024 * 1024;

interface NativeSupAipTextResponse {
  status: number;
  byteLength: number;
  text: string;
  contentType: string;
}

interface NativeSupAipDataPlugin {
  fetchText(options: { url: string; maxBytes: number }): Promise<NativeSupAipTextResponse>;
}

const NativeSupAipData = registerPlugin<NativeSupAipDataPlugin>('NativeSupAipData');

export class SupAipHttpError extends Error {
  readonly status: number;

  constructor(status: number, url: string) {
    super(`HTTP ${status} sur ${url}`);
    this.name = 'SupAipHttpError';
    this.status = status;
  }
}

function parseJsonPayload<T>(value: string): T {
  return JSON.parse(value) as T;
}

async function fetchTextWeb(url: string, signal?: AbortSignal): Promise<string> {
  const response = await fetch(url, {
    cache: 'no-store',
    signal,
    headers: { Accept: 'application/json, application/geo+json, text/plain' }
  });
  if (!response.ok) throw new SupAipHttpError(response.status, url);
  return response.text();
}

export async function fetchRemoteText(path: string, signal?: AbortSignal): Promise<string> {
  const url = apiPath(path);
  if (!Capacitor.isNativePlatform()) return fetchTextWeb(url, signal);
  if (signal?.aborted) throw new DOMException('Requête annulée.', 'AbortError');

  try {
    const response = await NativeSupAipData.fetchText({
      url,
      maxBytes: MAX_SUP_AIP_PAYLOAD_BYTES
    });
    if (signal?.aborted) throw new DOMException('Requête annulée.', 'AbortError');
    if (response.status < 200 || response.status >= 300) throw new SupAipHttpError(response.status, url);
    const actualLength = new TextEncoder().encode(response.text).byteLength;
    if (actualLength !== response.byteLength) throw new Error('Longueur native SUP AIP incohérente.');
    return response.text;
  } catch (error) {
    const code = typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: unknown }).code ?? '')
      : '';
    const match = /^supaip_http_(\d{3})$/.exec(code);
    if (match) throw new SupAipHttpError(Number(match[1]), url);
    throw error;
  }
}

export async function fetchRemoteJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  return parseJsonPayload<T>(await fetchRemoteText(path, signal));
}

export async function fetchEmbeddedJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  return parseJsonPayload<T>(await fetchTextWeb(path, signal));
}
