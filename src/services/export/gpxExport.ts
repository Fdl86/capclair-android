import { Capacitor, registerPlugin } from '@capacitor/core';
import { APP_VERSION } from '../../app/version';
import type { Trace } from '../../domain/trace.types';
import { isReliableGpsAltitude } from '../gps/geolocationService';

interface NativeTraceExportPlugin {
  exportFile(options: {
    fileName: string;
    mimeType: string;
    content: string;
    chooserTitle?: string;
  }): Promise<{ shared?: boolean; fileName?: string; uri?: string }>;
}

export interface TraceExportResult {
  ok: boolean;
  mode: 'android-share' | 'web-download';
  fileName: string;
  message: string;
}

const NativeTraceExport = registerPlugin<NativeTraceExportPlugin>('NativeTraceExport');

function escapeXml(value: string): string {
  return value.replace(/[<>&'"]/g, (char) => {
    switch (char) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
      default: return char;
    }
  });
}

function extension(tag: string, value: string | number | null | undefined): string {
  if (value === null || typeof value === 'undefined') return '';
  return `<capclair:${tag}>${escapeXml(String(value))}</capclair:${tag}>`;
}

function traceDiagnosticsExtensions(trace: Trace): string {
  const diagnostics = trace.diagnostics;
  if (!diagnostics) return '';

  return [
    extension('rawReceived', diagnostics.rawReceived),
    extension('tracePoints', diagnostics.tracePoints),
    extension('rejectedPrecision', diagnostics.rejectedPrecision),
    extension('rejectedRedundant', diagnostics.rejectedRedundant),
    extension('rejectedSpeed', diagnostics.rejectedSpeed),
    extension('rejectedDrift', diagnostics.rejectedDrift),
    extension('forcedResync', diagnostics.forcedResync),
    extension('gpsGaps', diagnostics.gpsGaps),
    extension('gpsResumptions', diagnostics.gpsResumptions),
    extension('missingAltitude', diagnostics.missingAltitude),
    extension('unreliableAltitude', diagnostics.unreliableAltitude),
    extension('maxTraceSpeedKt', diagnostics.maxTraceSpeedKt)
  ].join('');
}

function safeSlug(value: string): string {
  const slug = value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'trace';
}

function traceDateSlug(trace: Trace): string {
  const date = new Date(trace.date);
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);
  return date.toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

function traceFileName(trace: Trace, extension: 'gpx' | 'json'): string {
  return `cap-clair-${safeSlug(trace.routeName)}-${traceDateSlug(trace)}.${extension}`;
}

export function splitTraceSegments(trace: Trace, gapMs = 12_000): Trace['positions'][] {
  const segments: Trace['positions'][] = [];
  let current: Trace['positions'] = [];

  for (const position of trace.positions) {
    const previous = current.at(-1);
    if (previous && position.timestamp - previous.timestamp > gapMs) {
      if (current.length) segments.push(current);
      current = [];
    }
    current.push(position);
  }

  if (current.length) segments.push(current);
  return segments;
}

function positionToGpxPoint(position: Trace['positions'][number]): string {
  const hasReliableAltitude = isReliableGpsAltitude(position);
  const elevation = hasReliableAltitude ? `<ele>${position.altitude!.toFixed(1)}</ele>` : '';
  const precision = position.precision !== null ? extension('precision', position.precision.toFixed(1)) : '';
  const altitudeAccuracy = position.altitudeAccuracy !== null ? extension('altitudeAccuracy', position.altitudeAccuracy.toFixed(1)) : '';
  const altitudeReliable = position.altitude !== null ? extension('altitudeReliable', hasReliableAltitude ? 'true' : 'false') : '';
  const rawAltitude = position.altitude !== null ? extension('rawAltitudeM', position.altitude.toFixed(1)) : '';
  const vitesse = position.vitesse !== null ? extension('vitesse', position.vitesse.toFixed(1)) : '';
  const track = position.track !== null ? extension('track', position.track.toFixed(1)) : '';
  const extensions = precision || altitudeAccuracy || altitudeReliable || rawAltitude || vitesse || track
    ? `<extensions>${precision}${altitudeAccuracy}${altitudeReliable}${rawAltitude}${vitesse}${track}</extensions>`
    : '';
  return `      <trkpt lat="${position.latitude.toFixed(7)}" lon="${position.longitude.toFixed(7)}">${elevation}<time>${new Date(position.timestamp).toISOString()}</time>${extensions}</trkpt>`;
}

export function traceToGpx(trace: Trace): string {
  const segments = splitTraceSegments(trace);
  const metadataExtensions = [
    extension('appVersion', APP_VERSION),
    extension('schemaVersion', trace.schemaVersion ?? 1),
    extension('sessionId', trace.sessionId),
    extension('source', trace.source ?? 'legacy'),
    extension('startedAt', trace.startedAt),
    extension('endedAt', trace.endedAt),
    extension('segmentCount', segments.length),
    traceDiagnosticsExtensions(trace)
  ].join('');

  const segmentXml = segments.map((segment) => {
    const points = segment.map(positionToGpxPoint).join('\n');
    return `    <trkseg>\n${points}\n    </trkseg>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="${escapeXml(APP_VERSION)}" xmlns="http://www.topografix.com/GPX/1/1" xmlns:capclair="https://cap-clair.app/gpx/2">\n  <metadata>\n    <name>${escapeXml(trace.routeName)}</name>\n    <desc>${escapeXml(APP_VERSION)}</desc>\n    <time>${escapeXml(trace.endedAt ?? trace.date)}</time>\n    <extensions>${metadataExtensions}</extensions>\n  </metadata>\n  <trk>\n    <name>${escapeXml(trace.routeName)}</name>\n${segmentXml}\n  </trk>\n</gpx>`;
}

export function traceToJson(trace: Trace): string {
  return JSON.stringify({ exportedAt: new Date().toISOString(), appVersion: APP_VERSION, trace }, null, 2);
}

function downloadTextFile(fileName: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 500);
}

async function exportTextFile(fileName: string, content: string, mimeType: string, chooserTitle: string): Promise<TraceExportResult> {
  const isAndroidNative = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';

  if (isAndroidNative) {
    await NativeTraceExport.exportFile({ fileName, content, mimeType, chooserTitle });
    return {
      ok: true,
      mode: 'android-share',
      fileName,
      message: 'Fichier prêt à partager via Android.'
    };
  }

  downloadTextFile(fileName, content, mimeType);
  return {
    ok: true,
    mode: 'web-download',
    fileName,
    message: 'Téléchargement lancé.'
  };
}

export async function exportGpx(trace: Trace): Promise<TraceExportResult> {
  return exportTextFile(traceFileName(trace, 'gpx'), traceToGpx(trace), 'application/gpx+xml', 'Partager la trace GPX CAP CLAIR');
}

export async function exportJson(trace: Trace): Promise<TraceExportResult> {
  return exportTextFile(traceFileName(trace, 'json'), traceToJson(trace), 'application/json', 'Partager la trace JSON CAP CLAIR');
}

export function downloadGpx(trace: Trace): void {
  exportGpx(trace).catch((error) => {
    console.error('Export GPX impossible', error);
  });
}
