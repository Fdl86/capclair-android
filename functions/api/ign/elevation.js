// CAP CLAIR - Proxy altimétrie IGN Géoplateforme (profil terrain le long de la route).
// API publique sans clé : https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevationLine.json
// Données non libres côté tuiles, mais le calcul altimétrique RGE ALTI est accessible librement.
// Le terrain étant immuable, on cache très agressivement (30 jours).

const UPSTREAM = 'https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevationLine.json';
const CACHE_SECONDS = 2592000; // 30 jours

function jsonResponse(payload, cacheSeconds = CACHE_SECONDS, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': `public, max-age=${cacheSeconds}, s-maxage=${cacheSeconds}`,
      'Access-Control-Allow-Origin': '*',
      'X-Cap-Clair-Proxy': 'ign-elevation'
    }
  });
}

function clampSampling(value) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return 80;
  return Math.max(2, Math.min(120, parsed));
}

// Accepte uniquement des listes de nombres séparées par "|" (anti-injection sur l'URL amont).
function isSafeCoordList(raw) {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 4000) return false;
  return /^-?\d+(\.\d+)?(\|-?\d+(\.\d+)?)*$/.test(raw);
}

// La réponse IGN avec zonly=true est { elevations: [number, ...] }.
// On reste défensif : on accepte aussi un tableau d'objets { z }.
function extractElevations(data) {
  if (!data || !Array.isArray(data.elevations)) return [];
  return data.elevations
    .map((item) => (typeof item === 'number' ? item : item && typeof item.z === 'number' ? item.z : null))
    .filter((value) => value !== null);
}

export async function onRequestGet(context) {
  const { request } = context;
  const url = new URL(request.url);
  const lon = url.searchParams.get('lon');
  const lat = url.searchParams.get('lat');
  const sampling = clampSampling(url.searchParams.get('sampling'));

  if (!isSafeCoordList(lon) || !isSafeCoordList(lat)) {
    return jsonResponse({ elevations: [] }, 60);
  }

  const cache = caches.default;
  const cacheKey = new Request(url.toString(), request);
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const upstreamUrl = new URL(UPSTREAM);
  upstreamUrl.searchParams.set('lon', lon);
  upstreamUrl.searchParams.set('lat', lat);
  upstreamUrl.searchParams.set('resource', 'ign_rge_alti_wld');
  upstreamUrl.searchParams.set('delimiter', '|');
  upstreamUrl.searchParams.set('zonly', 'true');
  upstreamUrl.searchParams.set('sampling', String(sampling));
  upstreamUrl.searchParams.set('profile_mode', 'simple');
  upstreamUrl.searchParams.set('indent', 'false');

  // L'API alti IGN est lente et intermittente : un seul appel, pas de retry, dégradé propre.
  let elevations = [];
  try {
    const upstream = await fetch(upstreamUrl.toString(), {
      headers: { Accept: 'application/json' }
    });
    if (upstream.ok) {
      const data = await upstream.json();
      elevations = extractElevations(data);
    }
  } catch (error) {
    elevations = [];
  }

  // En cas d'échec amont : 200 + tableau vide, mais cache court (réessai possible plus tard).
  if (elevations.length === 0) {
    return jsonResponse({ elevations: [] }, 300);
  }

  const response = jsonResponse({ elevations }, CACHE_SECONDS);
  context.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}
