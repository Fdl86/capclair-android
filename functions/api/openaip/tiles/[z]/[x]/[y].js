const PNG_EMPTY_1X1 = Uint8Array.from([
  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82,
  0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 31, 21, 196, 137,
  0, 0, 0, 13, 73, 68, 65, 84, 120, 156, 99, 248, 255, 255, 63,
  0, 5, 254, 2, 254, 167, 53, 129, 132, 0, 0, 0, 0, 73, 69, 78,
  68, 174, 66, 96, 130
]);

function imageResponse(body, status = 200, cacheSeconds = 86400) {
  return new Response(body, {
    status,
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': `public, max-age=${cacheSeconds}`,
      'Access-Control-Allow-Origin': '*',
      'X-Cap-Clair-Proxy': 'openaip-tiles'
    }
  });
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*'
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
  const { params, env, request } = context;

  const apiKey = env.OPENAIP_API_KEY;
  if (!apiKey) {
    return jsonResponse({ error: 'OPENAIP_API_KEY missing' }, 500);
  }

  const z = toSafeInteger(params.z, 0, 18);
  const x = toSafeInteger(params.x, 0, Number.MAX_SAFE_INTEGER);
  const yName = String(params.y || '');
  const yMatch = yName.match(/^(\d+)\.png$/);
  const y = yMatch ? toSafeInteger(yMatch[1], 0, Number.MAX_SAFE_INTEGER) : null;

  if (z === null || x === null || y === null) {
    return imageResponse(PNG_EMPTY_1X1, 200, 60);
  }

  const maxTileIndex = 2 ** z - 1;
  if (x > maxTileIndex || y > maxTileIndex) {
    return imageResponse(PNG_EMPTY_1X1, 200, 60);
  }

  const cacheUrl = new URL(request.url);
  const cacheKey = new Request(cacheUrl.toString(), request);
  const cache = caches.default;

  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const upstreamUrl = new URL(`https://api.tiles.openaip.net/api/data/openaip/${z}/${x}/${y}.png`);

  const upstream = await fetch(upstreamUrl.toString(), {
    headers: {
      'Accept': 'image/png',
      'x-openaip-api-key': apiKey
    }
  });

  if (!upstream.ok) {
    const retrySeconds = upstream.status === 429 ? 3600 : 300;
    return imageResponse(PNG_EMPTY_1X1, 200, retrySeconds);
  }

  const response = new Response(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': upstream.headers.get('Content-Type') || 'image/png',
      'Cache-Control': 'public, max-age=86400, s-maxage=86400',
      'Access-Control-Allow-Origin': '*',
      'X-Cap-Clair-Proxy': 'openaip-tiles'
    }
  });

  context.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}
