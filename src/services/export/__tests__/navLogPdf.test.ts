import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import type { NavLogExportSnapshot } from '../navLogExport.types';
import { renderNavLogPdf } from '../navLogPdf';

const template = new Uint8Array(readFileSync(new URL('../../../../public/templates/fiche-nav-a4-paysage-v5.pdf', import.meta.url)));

function sampleSnapshot(): NavLogExportSnapshot {
  return {
    schemaVersion: 1,
    documentDateIso: '2026-07-12T08:00:00.000Z',
    departure: { code: 'LFBI', altitudeFt: 423, runway: null, qnhHpa: null, radio: null },
    destination: { code: 'LFOO', altitudeFt: 104, runway: null, qnhHpa: null, radio: null },
    aircraft: {
      factorBase: 0.57,
      fuelBurnLh: 18,
      fuelBurnLmin: 0.3,
      unusableFuelL: 2,
      vsKt: null,
      vs0Kt: null,
      vfeKt: null,
      vfinMaxKt: null,
      hourMeterDeparture: null,
      hourMeterArrival: null,
      blockTimeDeparture: null,
      blockTimeArrival: null
    },
    fuelPlan: {
      routeMinutes: 73,
      taxiDepartureMinutes: 8,
      arrivalMinutes: 12,
      diversionMinutes: 11,
      alternateArrivalMinutes: 12,
      marginMinutes: null,
      finalReserveMinutes: 30,
      totalHours: null,
      regulatoryFuelL: null,
      fuelOnBoardL: null,
      flightTimeHours: null,
      timeLimitHours: null
    },
    branches: Array.from({ length: 8 }, (_, index) => ({
      id: `b${index}`,
      zminiFt: null,
      routeMagneticDeg: 298 - index * 5,
      driftDeg: index % 2 ? -5 : 6,
      headingMagneticDeg: 292 - index * 5,
      maxDriftDeg: 7,
      windAngleDeg: 64,
      waypointLabel: index === 7 ? 'POINT-EXCEPTIONNELLEMENT-LONG-ÉTÉ' : `WP${index + 1}`,
      factorBaseWind: 0.61,
      distanceNm: 17,
      timeStillAirMinutes: 10,
      timeWithWindMinutes: 11,
      estimatedPassageTime: null,
      actualPassageTime: null,
      radio: null,
      fuelConsumedL: null,
      fuelRemainingL: null
    })),
    totals: { distanceNm: 136, timeStillAirMinutes: 80, timeWithWindMinutes: 88, eta: null },
    reservoirRows: [null, null, null, null],
    omittedBranchCount: 0,
    warnings: []
  };
}

describe('nav log PDF renderer', () => {
  it('produces one A4 landscape page with a valid PDF signature', async () => {
    const bytes = await renderNavLogPdf(sampleSnapshot(), template);
    expect(new TextDecoder('latin1').decode(bytes.slice(0, 5))).toBe('%PDF-');
    const document = await PDFDocument.load(bytes);
    expect(document.getPageCount()).toBe(1);
    const { width, height } = document.getPage(0).getSize();
    expect(width).toBeCloseTo(841.92, 1);
    expect(height).toBeCloseTo(595.32, 1);
  });

  it('is deterministic for the same structured snapshot', async () => {
    const first = await renderNavLogPdf(sampleSnapshot(), template);
    const second = await renderNavLogPdf(sampleSnapshot(), template);
    expect(Array.from(first)).toEqual(Array.from(second));
  });

  it('accepts French accented waypoint names and long labels without throwing', async () => {
    await expect(renderNavLogPdf(sampleSnapshot(), template)).resolves.toBeInstanceOf(Uint8Array);
  });
});
