import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

interface PdfTextItem {
  str: string;
  hasEOL?: boolean;
  transform?: number[];
}

export function pageTextFromItems(items: PdfTextItem[]) {
  const positioned = items
    .filter((item) => item.str.trim())
    .map((item, index) => ({
      text: item.str,
      x: item.transform?.[4] ?? index,
      y: item.transform?.[5] ?? 0,
      index
    }));
  if (positioned.length === 0) return '';
  const rows: Array<{ y: number; entries: typeof positioned }> = [];
  for (const item of positioned) {
    let row = rows.find((candidate) => Math.abs(candidate.y - item.y) < 2.2);
    if (!row) {
      row = { y: item.y, entries: [] };
      rows.push(row);
    }
    row.entries.push(item);
  }
  rows.sort((a, b) => b.y - a.y);
  return rows.map((row) => row.entries.sort((a, b) => a.x - b.x || a.index - b.index).map((entry) => entry.text).join(' ').trim()).join('\n');
}


export function ensureExploitablePdfText(text: string) {
  if (text.replace(/\s/g, '').length < 80) {
    throw new Error('Ce PDF ne contient pas de couche texte exploitable. Consultez SOFIA ou collez le contenu du PIB. Aucun OCR automatique n’est utilisé.');
  }
  return text;
}

async function fingerprintBytes(data: Uint8Array) {
  if (globalThis.crypto?.subtle) {
    const digest = await globalThis.crypto.subtle.digest('SHA-256', data.slice().buffer as ArrayBuffer);
    return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
  }
  let hash = 2166136261;
  for (const byte of data) hash = Math.imul(hash ^ byte, 16777619);
  return `fnv-${(hash >>> 0).toString(16)}`;
}

export async function extractTextFromPdf(file: File): Promise<{ text: string; pageCount: number; fingerprint: string }> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const data = new Uint8Array(await file.arrayBuffer());
  const fingerprint = await fingerprintBytes(data);
  const loadingTask = pdfjs.getDocument({ data, useWorkerFetch: false });
  const document = await loadingTask.promise;
  const pages: string[] = [];
  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      pages.push(pageTextFromItems(content.items as PdfTextItem[]));
      page.cleanup();
    }
  } finally {
    await document.destroy();
  }
  const text = pages.join('\n\n');
  ensureExploitablePdfText(text);
  return { text, pageCount: pages.length, fingerprint };
}
