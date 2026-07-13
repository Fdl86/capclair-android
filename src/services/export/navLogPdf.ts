import type { PDFFont, PDFPage, RGB } from 'pdf-lib';
import type { NavLogExportSnapshot } from './navLogExport.types';

const PAGE_HEIGHT = 595.32;
const INK = { r: 10 / 255, g: 33 / 255, b: 61 / 255 } as const;

interface TextStyle {
  font: PDFFont;
  size: number;
}

function pdfY(topOriginY: number): number {
  return PAGE_HEIGHT - topOriginY;
}

function safeText(value: string): string {
  return value
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/[–—]/g, '-')
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function fitText(value: string, font: PDFFont, size: number, maxWidth: number): string {
  const normalized = safeText(value);
  if (font.widthOfTextAtSize(normalized, size) <= maxWidth) return normalized;
  let candidate = normalized;
  while (candidate.length > 1 && font.widthOfTextAtSize(`${candidate}...`, size) > maxWidth) {
    candidate = candidate.slice(0, -1);
  }
  return candidate.length ? `${candidate}...` : '';
}

function drawText(
  page: PDFPage,
  value: string,
  x: number,
  topOriginY: number,
  style: TextStyle,
  color: RGB
): void {
  if (!value) return;
  page.drawText(safeText(value), {
    x,
    y: pdfY(topOriginY),
    size: style.size,
    font: style.font,
    color
  });
}

function drawCentered(
  page: PDFPage,
  value: string,
  centerX: number,
  topOriginY: number,
  style: TextStyle,
  color: RGB,
  maxWidth?: number
): void {
  const text = typeof maxWidth === 'number'
    ? fitText(value, style.font, style.size, maxWidth)
    : safeText(value);
  if (!text) return;
  const width = style.font.widthOfTextAtSize(text, style.size);
  drawText(page, text, centerX - width / 2, topOriginY, style, color);
}

function formatInteger(value: number | null): string {
  return value === null || !Number.isFinite(value) ? '' : String(Math.round(value));
}

function formatHeading(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '';
  const normalized = ((Math.round(value) % 360) + 360) % 360;
  return String(normalized).padStart(3, '0');
}

function formatSigned(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '';
  const rounded = Math.round(value);
  return rounded > 0 ? `+${rounded}` : String(rounded);
}

function formatDecimal(value: number | null, digits: number): string {
  if (value === null || !Number.isFinite(value)) return '';
  return value.toFixed(digits).replace('.', ',');
}

function deterministicDate(value: string | null): Date {
  if (value) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date;
  }
  return new Date('2000-01-01T00:00:00.000Z');
}

export async function renderNavLogPdf(
  snapshot: NavLogExportSnapshot,
  templateBytes: Uint8Array
): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const pdf = await PDFDocument.load(templateBytes, { updateMetadata: false });
  const page = pdf.getPage(0);
  const helvetica = await pdf.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(INK.r, INK.g, INK.b);
  const black = rgb(0, 0, 0);
  const white = rgb(1, 1, 1);

  const topBold = { font: helveticaBold, size: 7.4 };
  const topRegular = { font: helvetica, size: 7.0 };
  const fuelBold = { font: helveticaBold, size: 6.8 };
  const fuelPlanBold = { font: helveticaBold, size: 7.2 };
  const branchBold = { font: helveticaBold, size: 6.8 };
  const branchSmall = { font: helvetica, size: 5.8 };
  const waypointBold = { font: helveticaBold, size: 7.2 };
  const totalsBold = { font: helveticaBold, size: 6.6 };

  // The reference sheet contains an ETA label. The validated CAP CLAIR V1
  // deliberately removes the entire ETA area and leaves it blank.
  page.drawRectangle({
    x: 288.95,
    y: PAGE_HEIGHT - 465.15,
    width: 77.5,
    height: 21,
    color: white
  });

  drawCentered(page, snapshot.departure.code, 101.70, 22.48, topBold, ink, 38);
  drawCentered(page, formatInteger(snapshot.departure.altitudeFt), 143.46, 22.34, topRegular, ink, 22);
  drawCentered(page, snapshot.destination.code, 101.70, 68.20, topBold, ink, 38);
  drawCentered(page, formatInteger(snapshot.destination.altitudeFt), 143.46, 68.06, topRegular, ink, 22);

  drawText(page, formatDecimal(snapshot.aircraft.factorBase, 2), 56.38, 112.99, fuelBold, ink);
  drawCentered(page, formatDecimal(snapshot.aircraft.fuelBurnLh, 1), 191.745, 124.33, fuelBold, ink, 28);
  drawCentered(page, formatDecimal(snapshot.aircraft.fuelBurnLmin, 2), 263.745, 124.33, fuelBold, ink, 28);
  drawCentered(page, formatDecimal(snapshot.aircraft.unusableFuelL, 1), 287.235, 135.49, fuelBold, ink, 24);

  drawCentered(page, formatInteger(snapshot.fuelPlan.routeMinutes), 411.435, 34.11, fuelPlanBold, ink, 18);
  drawCentered(page, formatInteger(snapshot.fuelPlan.diversionMinutes), 411.435, 67.95, fuelPlanBold, ink, 18);
  drawCentered(page, formatInteger(snapshot.fuelPlan.alternateArrivalMinutes), 410.255, 79.52, fuelPlanBold, ink, 18);
  drawCentered(page, formatInteger(snapshot.fuelPlan.finalReserveMinutes), 411.435, 101.79, fuelPlanBold, ink, 18);

  snapshot.branches.forEach((branch, index) => {
    const offset = index * 33.84;
    const auxOriginY = 180.30 + offset;
    const mainOriginY = 191.72 + offset;
    const waypointOriginY = 197.73 + offset;

    drawCentered(page, formatHeading(branch.windAngleDeg), 174.96, auxOriginY, branchSmall, ink, 18);
    drawCentered(page, formatDecimal(branch.factorBaseWind, 2), 197.64, auxOriginY, branchSmall, ink, 18);

    drawCentered(page, formatHeading(branch.routeMagneticDeg), 84.96, mainOriginY, branchBold, ink, 22);
    drawCentered(page, formatSigned(branch.driftDeg), 107.46, mainOriginY, branchBold, ink, 18);
    drawCentered(page, formatHeading(branch.headingMagneticDeg), 130.14, mainOriginY, branchBold, ink, 22);
    drawCentered(page, formatInteger(branch.maxDriftDeg), 152.64, mainOriginY, branchBold, ink, 16);
    drawCentered(page, formatInteger(branch.distanceNm), 220.25, mainOriginY, branchBold, ink, 20);
    drawCentered(page, formatInteger(branch.timeStillAirMinutes), 243.18, mainOriginY, branchBold, ink, 18);
    drawCentered(page, formatInteger(branch.timeWithWindMinutes), 265.86, mainOriginY, branchBold, ink, 18);
    drawCentered(page, branch.waypointLabel, 186.48, waypointOriginY, waypointBold, ink, 42);
  });

  drawCentered(page, formatInteger(snapshot.totals.distanceNm), 215.30, 457.65, totalsBold, ink, 28);
  drawCentered(page, formatInteger(snapshot.totals.timeStillAirMinutes), 243.10, 457.65, totalsBold, ink, 18);
  drawCentered(page, formatInteger(snapshot.totals.timeWithWindMinutes), 271.22, 457.65, totalsBold, ink, 26);

  // Final repair strokes from the visually approved V5. They are drawn last so
  // numbers and white masks can never create pale gaps in these borders.
  page.drawLine({
    start: { x: 277.04, y: PAGE_HEIGHT - 442.78 },
    end: { x: 277.04, y: PAGE_HEIGHT - 150.63 },
    thickness: 0.60,
    color: black
  });
  page.drawLine({
    start: { x: 209.28, y: PAGE_HEIGHT - 442.78 },
    end: { x: 209.28, y: PAGE_HEIGHT - 150.63 },
    thickness: 0.65,
    color: black
  });
  page.drawLine({
    start: { x: 231.84, y: PAGE_HEIGHT - 465.34 },
    end: { x: 231.84, y: PAGE_HEIGHT - 443.98 },
    thickness: 0.65,
    color: black
  });

  const documentDate = deterministicDate(snapshot.documentDateIso);
  pdf.setTitle('CAP CLAIR - Log de navigation');
  pdf.setAuthor('CAP CLAIR');
  pdf.setSubject('Log de navigation VFR');
  pdf.setCreator('CAP CLAIR');
  pdf.setProducer('CAP CLAIR / pdf-lib');
  pdf.setCreationDate(documentDate);
  pdf.setModificationDate(documentDate);

  return pdf.save({ useObjectStreams: false });
}
