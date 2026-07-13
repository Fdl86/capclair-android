import { Capacitor, registerPlugin } from '@capacitor/core';
import type { AircraftProfile, FuelPlanConfig } from '../../domain/aircraft.types';
import type { NavRoute } from '../../domain/navigation.types';
import type { NavLogExportResult } from './navLogExport.types';
import { navLogFileName } from './navLogFileName';
import { renderNavLogPdf } from './navLogPdf';
import { buildNavLogSnapshot } from './navLogSnapshot';

interface NativeTraceExportPlugin {
  exportFile(options: {
    fileName: string;
    mimeType: string;
    content: string;
    encoding?: 'utf8' | 'base64';
    chooserTitle?: string;
  }): Promise<{ shared?: boolean; fileName?: string; uri?: string }>;
}

export interface ExportNavLogPdfInput {
  route: NavRoute;
  aircraft: AircraftProfile;
  fuelPlanConfig: FuelPlanConfig;
  alternateCode: string;
}

const NativeTraceExport = registerPlugin<NativeTraceExportPlugin>('NativeTraceExport');
let templatePromise: Promise<Uint8Array> | null = null;

function templateUrl(): string {
  return new URL('templates/fiche-nav-a4-paysage-v5.pdf', document.baseURI).toString();
}

async function loadTemplate(): Promise<Uint8Array> {
  if (!templatePromise) {
    templatePromise = fetch(templateUrl(), { cache: 'force-cache' })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Gabarit PDF indisponible (${response.status}).`);
        return new Uint8Array(await response.arrayBuffer());
      })
      .catch((error) => {
        templatePromise = null;
        throw error;
      });
  }
  return templatePromise;
}

function bytesToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length));
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function downloadPdf(fileName: string, bytes: Uint8Array): void {
  const copy = Uint8Array.from(bytes);
  const blob = new Blob([copy.buffer], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function exportNavLogPdf(input: ExportNavLogPdfInput): Promise<NavLogExportResult> {
  const snapshot = buildNavLogSnapshot(input);
  const fileName = navLogFileName(snapshot);
  const template = await loadTemplate();
  const pdfBytes = await renderNavLogPdf(snapshot, template);

  if (Capacitor.isNativePlatform()) {
    await NativeTraceExport.exportFile({
      fileName,
      mimeType: 'application/pdf',
      content: bytesToBase64(pdfBytes),
      encoding: 'base64',
      chooserTitle: 'Partager le log de navigation CAP CLAIR'
    });
    return {
      ok: true,
      mode: 'android-share',
      fileName,
      message: snapshot.warnings.length
        ? `PDF prêt à partager. ${snapshot.warnings.join(' ')}`
        : 'PDF prêt à partager via Android.',
      omittedBranchCount: snapshot.omittedBranchCount,
      warnings: snapshot.warnings
    };
  }

  downloadPdf(fileName, pdfBytes);
  return {
    ok: true,
    mode: 'web-download',
    fileName,
    message: snapshot.warnings.length
      ? `Téléchargement lancé. ${snapshot.warnings.join(' ')}`
      : 'Téléchargement du PDF lancé.',
    omittedBranchCount: snapshot.omittedBranchCount,
    warnings: snapshot.warnings
  };
}
