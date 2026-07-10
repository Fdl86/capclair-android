function jsonResponse(body, status = 200, cacheSeconds = 0) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': cacheSeconds > 0 ? `public, max-age=${cacheSeconds}` : 'no-store',
      'Access-Control-Allow-Origin': '*'
    }
  });
}

export function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Accept'
    }
  });
}

function normalizeItems(body) {
  const rawItems = Array.isArray(body?.items)
    ? body.items
    : (Array.isArray(body?.ids) ? body.ids.map((id) => ({ icao: id, candidates: [{ icao: id, distanceKm: 0 }] })) : []);

  return rawItems
    .map((item) => {
      const icao = String(item?.icao || '').trim().toUpperCase();
      const candidates = Array.isArray(item?.candidates) ? item.candidates : [];
      const normalizedCandidates = candidates
        .map((candidate) => ({
          icao: String(candidate?.icao || '').trim().toUpperCase(),
          distanceKm: Number(candidate?.distanceKm ?? 0)
        }))
        .filter((candidate) => /^[A-Z0-9]{4}$/.test(candidate.icao))
        .slice(0, 16);

      if (/^[A-Z0-9]{4}$/.test(icao) && !normalizedCandidates.some((candidate) => candidate.icao === icao)) {
        normalizedCandidates.unshift({ icao, distanceKm: 0 });
      }

      return { icao, candidates: normalizedCandidates };
    })
    .filter((item) => /^[A-Z0-9]{4}$/.test(item.icao))
    .slice(0, 6);
}

function rawMetar(item) {
  return item?.rawOb || item?.raw_text || item?.raw || item?.metar || '';
}

function rawTaf(item) {
  return item?.rawTAF || item?.rawTaf || item?.raw_text || item?.raw || item?.taf || '';
}

async function fetchJsonProduct(product, ids) {
  const url = new URL(`https://aviationweather.gov/api/data/${product}`);
  url.searchParams.set('ids', ids.join(','));
  url.searchParams.set('format', 'json');

  const response = await fetch(url.toString(), {
    headers: { Accept: 'application/json' }
  });

  if (response.status === 204 || response.status === 404) return [];
  if (!response.ok) throw new Error(`${product} ${response.status}`);

  try {
    const data = await response.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function itemId(item) {
  return String(item?.icaoId || item?.station_id || item?.id || '').toUpperCase();
}

function makeEmptyReport(requestedIcao) {
  return {
    icao: requestedIcao,
    requestedIcao,
    stationIcao: requestedIcao,
    stationDistanceKm: 0,
    metarRaw: '',
    tafRaw: '',
    updatedAtIso: new Date().toISOString(),
    source: 'aviationweather.gov',
    status: 'missing'
  };
}

function buildReportForItem(item, metarById, tafById) {
  const selected = item.candidates.find((candidate) => {
    const metar = metarById.get(candidate.icao);
    const taf = tafById.get(candidate.icao);
    return Boolean(rawMetar(metar) || rawTaf(taf));
  });

  if (!selected) return makeEmptyReport(item.icao);

  const metar = metarById.get(selected.icao);
  const taf = tafById.get(selected.icao);
  const metarRaw = rawMetar(metar);
  const tafRaw = rawTaf(taf);

  return {
    icao: item.icao,
    requestedIcao: item.icao,
    stationIcao: selected.icao,
    stationDistanceKm: Number(selected.distanceKm.toFixed(1)),
    metarRaw,
    tafRaw,
    updatedAtIso: new Date().toISOString(),
    source: 'aviationweather.gov',
    status: metarRaw || tafRaw ? 'ok' : 'missing'
  };
}

export async function onRequestPost(context) {
  let body;
  try {
    body = await context.request.json();
  } catch {
    return jsonResponse({ error: 'invalid json', reports: [] }, 400);
  }

  const items = normalizeItems(body);
  if (!items.length) return jsonResponse({ generatedAt: new Date().toISOString(), reports: [] });

  const ids = [...new Set(items.flatMap((item) => item.candidates.map((candidate) => candidate.icao)))].slice(0, 80);

  try {
    const [metars, tafs] = await Promise.all([
      fetchJsonProduct('metar', ids),
      fetchJsonProduct('taf', ids)
    ]);

    const metarById = new Map();
    const tafById = new Map();

    for (const item of metars) {
      const id = itemId(item);
      if (id) metarById.set(id, item);
    }

    for (const item of tafs) {
      const id = itemId(item);
      if (id) tafById.set(id, item);
    }

    return jsonResponse({
      generatedAt: new Date().toISOString(),
      reports: items.map((item) => buildReportForItem(item, metarById, tafById))
    }, 200, 300);
  } catch (error) {
    return jsonResponse({
      generatedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'weather fetch failed',
      reports: items.map((item) => ({ ...makeEmptyReport(item.icao), status: 'error' }))
    }, 200);
  }
}
