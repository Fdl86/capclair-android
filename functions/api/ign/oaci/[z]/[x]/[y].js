const PNG_EMPTY_1X1 = Uint8Array.from([
  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82,
  0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 31, 21, 196, 137,
  0, 0, 0, 13, 73, 68, 65, 84, 120, 156, 99, 248, 255, 255, 63,
  0, 5, 254, 2, 254, 167, 53, 129, 132, 0, 0, 0, 0, 73, 69, 78,
  68, 174, 66, 96, 130
]);

function imageResponse(body, contentType = 'image/png', cacheSeconds = 300, status = 200) {
  return new Response(body, {
    status,
    headers: {
      'Content-Type': contentType,
      'Cache-Control': `public, max-age=${cacheSeconds}, s-maxage=${cacheSeconds}`,
      'Access-Control-Allow-Origin': '*',
      'X-Cap-Clair-Proxy': 'ign-oaci-vfr'
    }
  });
}

function toSafeInteger(value, min, max) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || String(parsed) !== String(value)) return null;
  if (parsed < min || parsed > max) return null;
  return parsed;
}

export async function onRequestGet(context) {
  const { params, request } = context;

  const z = toSafeInteger(params.z, 0, 18);
  const x = toSafeInteger(params.x, 0, Number.MAX_SAFE_INTEGER);
  const yName = String(params.y || '');
  const yMatch = yName.match(/^(\d+)\.jpg$/);
  const y = yMatch ? toSafeInteger(yMatch[1], 0, Number.MAX_SAFE_INTEGER) : null;

  if (z === null || x === null || y === null) {
    return imageResponse(PNG_EMPTY_1X1, 'image/png', 60);
  }

  const maxTileIndex = 2 ** z - 1;
  if (x > maxTileIndex || y > maxTileIndex || z < 6 || z > 11) {
    return imageResponse(PNG_EMPTY_1X1, 'image/png', 300);
  }

  const cacheUrl = new URL(request.url);
  const cacheKey = new Request(cacheUrl.toString(), request);
  const cache = caches.default;

  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const upstreamUrl = new URL('https://data.geopf.fr/private/wmts');
  upstreamUrl.searchParams.set('apikey', 'ign_scan_ws');
  upstreamUrl.searchParams.set('SERVICE', 'WMTS');
  upstreamUrl.searchParams.set('VERSION', '1.0.0');
  upstreamUrl.searchParams.set('REQUEST', 'GetTile');
  upstreamUrl.searchParams.set('LAYER', 'GEOGRAPHICALGRIDSYSTEMS.MAPS.SCAN-OACI');
  upstreamUrl.searchParams.set('STYLE', 'normal');
  upstreamUrl.searchParams.set('TILEMATRIXSET', 'PM');
  upstreamUrl.searchParams.set('TILEMATRIX', String(z));
  upstreamUrl.searchParams.set('TILEROW', String(y));
  upstreamUrl.searchParams.set('TILECOL', String(x));
  upstreamUrl.searchParams.set('FORMAT', 'image/jpeg');

  const upstream = await fetch(upstreamUrl.toString(), {
    headers: {
      Accept: 'image/jpeg,image/png;q=0.9,*/*;q=0.1'
    }
  });

  if (!upstream.ok) {
    if (upstream.status === 400 || upstream.status === 404) {
      const missingTile = imageResponse(PNG_EMPTY_1X1, 'image/png', 300);
      context.waitUntil(cache.put(cacheKey, missingTile.clone()));
      return missingTile;
    }

    const retrySeconds = upstream.status === 429 ? 3600 : 300;
    return imageResponse(PNG_EMPTY_1X1, 'image/png', retrySeconds, 503);
  }

  const contentType = upstream.headers.get('Content-Type') || 'image/jpeg';
  const response = new Response(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=86400, s-maxage=86400',
      'Access-Control-Allow-Origin': '*',
      'X-Cap-Clair-Proxy': 'ign-oaci-vfr'
    }
  });

  context.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}
