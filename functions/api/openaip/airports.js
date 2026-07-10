const OPENAIP_BASE_URL = 'https://api.core.openaip.net/api/airports';

function jsonResponse(body, status = 200, cacheSeconds = 0) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': cacheSeconds > 0 ? `public, max-age=${cacheSeconds}` : 'no-store'
    }
  });
}

function numberParam(searchParams, name) {
  const raw = searchParams.get(name);
  if (raw === null) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getCoordinates(item) {
  const candidates = [
    item?.geometry?.coordinates,
    item?.location?.coordinates,
    item?.position?.coordinates,
    item?.coordinates
  ];

  for (const coordinates of candidates) {
    if (Array.isArray(coordinates) && coordinates.length >= 2) {
      const lon = Number(coordinates[0]);
      const lat = Number(coordinates[1]);
      if (Number.isFinite(lon) && Number.isFinite(lat)) return { lon, lat };
    }
  }

  const lat = Number(item?.latitude ?? item?.lat);
  const lon = Number(item?.longitude ?? item?.lon ?? item?.lng);
  if (Number.isFinite(lon) && Number.isFinite(lat)) return { lon, lat };

  return null;
}

function normalizeAirport(item) {
  const coordinates = getCoordinates(item);
  if (!coordinates) return null;
  return {
    id: String(item?._id ?? item?.id ?? `${coordinates.lon},${coordinates.lat}`),
    name: String(item?.name ?? item?.title ?? 'Airport'),
    icaoCode: item?.icaoCode || item?.icao || undefined,
    type: item?.type,
    latitude: coordinates.lat,
    longitude: coordinates.lon,
    elevationValue: item?.elevation?.value ?? item?.elevation?.val ?? item?.elevation,
    elevationUnit: item?.elevation?.unit
  };
}

function extractItems(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.features)) return payload.features.map((feature) => ({ ...feature.properties, geometry: feature.geometry }));
  return [];
}

export async function onRequestGet({ request, env }) {
  const apiKey = env.OPENAIP_API_KEY;
  if (!apiKey) {
    return jsonResponse({ error: 'OPENAIP_API_KEY missing in Cloudflare environment' }, 500);
  }

  const url = new URL(request.url);
  const minLon = numberParam(url.searchParams, 'minLon');
  const minLat = numberParam(url.searchParams, 'minLat');
  const maxLon = numberParam(url.searchParams, 'maxLon');
  const maxLat = numberParam(url.searchParams, 'maxLat');
  const limit = clamp(numberParam(url.searchParams, 'limit') ?? 120, 1, 200);

  if ([minLon, minLat, maxLon, maxLat].some((value) => value === null)) {
    return jsonResponse({ error: 'Expected minLon, minLat, maxLon, maxLat' }, 400);
  }

  if (maxLon <= minLon || maxLat <= minLat) {
    return jsonResponse({ error: 'Invalid bbox order' }, 400);
  }

  const lonSpan = maxLon - minLon;
  const latSpan = maxLat - minLat;
  if (lonSpan > 4 || latSpan > 4) {
    return jsonResponse({ error: 'BBox too large for CAP CLAIR dev proxy' }, 413);
  }

  const upstreamUrl = new URL(OPENAIP_BASE_URL);
  upstreamUrl.searchParams.set('page', '1');
  upstreamUrl.searchParams.set('limit', String(limit));
  upstreamUrl.searchParams.set('bbox', `${minLon},${minLat},${maxLon},${maxLat}`);

  const upstream = await fetch(upstreamUrl.toString(), {
    headers: {
      accept: 'application/json',
      'x-openaip-api-key': apiKey
    }
  });

  const payload = await upstream.json().catch(() => ({}));
  if (!upstream.ok) {
    return jsonResponse({ error: 'openAIP upstream error', status: upstream.status, detail: payload }, upstream.status);
  }

  const rawItems = extractItems(payload);
  const airports = rawItems
    .map(normalizeAirport)
    .filter(Boolean)
    .filter((airport) => airport.longitude >= minLon && airport.longitude <= maxLon && airport.latitude >= minLat && airport.latitude <= maxLat)
    .slice(0, limit);

  return jsonResponse({
    source: 'openaip',
    upstreamCount: rawItems.length,
    airports
  }, 200, 3600);
}
