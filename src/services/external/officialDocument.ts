import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';

export async function openOfficialDocument(url: string): Promise<void> {
  if (!url.startsWith('https://')) throw new Error('Adresse du document officiel invalide.');
  if (Capacitor.isNativePlatform()) {
    await Browser.open({ url, presentationStyle: 'popover' });
    return;
  }
  const opened = window.open(url, '_blank', 'noopener,noreferrer');
  if (!opened) window.location.assign(url);
}
