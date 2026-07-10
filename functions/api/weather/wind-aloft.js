const LEVELS = [1000, 950, 925, 900, 850, 800, 750, 700];
const APPROX_HEIGHT_M = {
  1000: 110,
  950: 500,
  925: 800,
  900: 1000,
  850: 1500,
  800: 1900,
  750: 2500,
  700: 3000
};

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

function getRuntimeCache() {
  try {
    if (typeof caches !== 'undefined' && caches.default) return caches.default;
  } catch {
    // Cache API can be unavailable in some runtimes.
  }
  return null;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function roundNearestHourIso(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return new Date(Math.round(Date.now() / 3600000) * 3600000).toISOString();
  return new Date(Math.round(date.getTime() / 3600000) * 3600000).toISOString();
}

function normalizeOpenMeteoTime(value) {
  const text = String(value);
  if (text.endsWith('Z')) return text;
  if (text.length === 16) return `${text}:00Z`;
  return `${text}Z`;
}

function normalizeSample(sample) {
  const latitude = clamp(Number(sample.latitude), -90, 90);
  const longitude = clamp(Number(sample.longitude), -180, 180);
  const altitudeFt = clamp(Math.round(Number(sample.altitudeFt) / 500) * 500, 0, 12500);
  const timeIso = roundNearestHourIso(sample.timeIso);
  const latCell = Math.round(latitude * 10) / 10;
  const lonCell = Math.round(longitude * 10) / 10;

  return {
    sampleId: String(sample.sampleId || ''),
    branchId: String(sample.branchId || ''),
    latitude: latCell,
    longitude: lonCell,
    altitudeFt,
    timeIso,
    normalizedKey: `${timeIso.slice(0, 13)}Z:${latCell.toFixed(1)}:${lonCell.toFixed(1)}:${altitudeFt}`
  };
}

function validSample(sample) {
  return sample.sampleId && sample.branchId && Number.isFinite(sample.latitude) && Number.isFinite(sample.longitude) && Number.isFinite(sample.altitudeFt);
}

function windToComponents(directionDeg, speedKt) {
  const rad = directionDeg * Math.PI / 180;
  return {
    u: -speedKt * Math.sin(rad),
    v: -speedKt * Math.cos(rad)
  };
}

function componentsToWind(u, v) {
  const speedKt = Math.max(0, Math.round(Math.sqrt(u * u + v * v)));
  const directionDeg = Math.round((Math.atan2(-u, -v) * 180 / Math.PI + 360) % 360);
  return { directionDeg, speedKt };
}

function pickHourIndex(times, targetIso) {
  const targetDate = new Date(targetIso);
  let bestIndex = 0;
  let bestDelta = Number.POSITIVE_INFINITY;

  for (let index = 0; index < times.length; index += 1) {
    const candidate = new Date(normalizeOpenMeteoTime(times[index]));
    const delta = Math.abs(candidate.getTime() - targetDate.getTime());
    if (Number.isFinite(delta) && delta < bestDelta) {
      bestDelta = delta;
      bestIndex = index;
    }
  }

  return bestIndex;
}

function auditLevel(value) {
  if (!value) return null;
  return {
    pressureHpa: value.level,
    heightFt: Math.round(value.height * 3.28084),
    directionDeg: Math.round(value.direction),
    speedKt: Math.round(value.speed)
  };
}

function interpolateWind(hourly, index, sample, providerName, endpoint) {
  const altitudeM = sample.altitudeFt * 0.3048;
  const values = LEVELS.map((level) => {
    const speed = hourly[`wind_speed_${level}hPa`]?.[index];
    const direction = hourly[`wind_direction_${level}hPa`]?.[index];
    const height = hourly[`geopotential_height_${level}hPa`]?.[index] ?? APPROX_HEIGHT_M[level];

    if (!Number.isFinite(speed) || !Number.isFinite(direction) || !Number.isFinite(height)) return null;
    const components = windToComponents(direction, speed);
    return { level, speed, direction, height, ...components };
  }).filter(Boolean).sort((a, b) => a.height - b.height);

  if (!values.length) return null;

  const build = (wind, lower, upper, ratio) => ({
    directionDeg: wind.directionDeg,
    speedKt: wind.speedKt,
    sourceTimeIso: null,
    provider: providerName,
    endpoint,
    fallback: false,
    normalizedKey: sample.normalizedKey,
    auditSamples: [{
      sampleId: sample.sampleId,
      latitude: sample.latitude,
      longitude: sample.longitude,
      altitudeFt: sample.altitudeFt,
      requestedTimeIso: sample.timeIso,
      sourceTimeIso: null,
      provider: providerName,
      endpoint,
      fallback: false,
      cache: 'live',
      normalizedKey: sample.normalizedKey,
      lowerLevel: auditLevel(lower),
      upperLevel: auditLevel(upper),
      interpolationRatio: Number.isFinite(ratio) ? Number(ratio.toFixed(3)) : null
    }]
  });

  if (altitudeM <= values[0].height) {
    const first = values[0];
    return build({ directionDeg: Math.round(first.direction), speedKt: Math.round(first.speed) }, first, first, null);
  }

  if (altitudeM >= values[values.length - 1].height) {
    const last = values[values.length - 1];
    return build({ directionDeg: Math.round(last.direction), speedKt: Math.round(last.speed) }, last, last, null);
  }

  for (let indexValue = 0; indexValue < values.length - 1; indexValue += 1) {
    const lower = values[indexValue];
    const upper = values[indexValue + 1];

    if (altitudeM >= lower.height && altitudeM <= upper.height) {
      const ratio = (altitudeM - lower.height) / Math.max(1, upper.height - lower.height);
      const u = lower.u + (upper.u - lower.u) * ratio;
      const v = lower.v + (upper.v - lower.v) * ratio;
      return build(componentsToWind(u, v), lower, upper, ratio);
    }
  }

  const nearest = values[0];
  return build({ directionDeg: Math.round(nearest.direction), speedKt: Math.round(nearest.speed) }, nearest, nearest, null);
}

function createOpenMeteoUrl(baseUrl, sample) {
  const hourly = LEVELS.flatMap((level) => [
    `wind_speed_${level}hPa`,
    `wind_direction_${level}hPa`,
    `geopotential_height_${level}hPa`
  ]).join(',');

  const upstreamUrl = new URL(baseUrl);
  upstreamUrl.searchParams.set('latitude', String(sample.latitude));
  upstreamUrl.searchParams.set('longitude', String(sample.longitude));
  upstreamUrl.searchParams.set('hourly', hourly);
  upstreamUrl.searchParams.set('forecast_days', '3');
  upstreamUrl.searchParams.set('timezone', 'GMT');
  upstreamUrl.searchParams.set('wind_speed_unit', 'kn');
  upstreamUrl.searchParams.set('cell_selection', 'nearest');
  return upstreamUrl;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function markCache(wind, cache) {
  return {
    ...wind,
    cache,
    auditSamples: (wind.auditSamples ?? []).map((sample) => ({ ...sample, cache }))
  };
}

function withSourceTime(wind, sourceTimeIso) {
  return {
    ...wind,
    sourceTimeIso,
    auditSamples: (wind.auditSamples ?? []).map((sample) => ({ ...sample, sourceTimeIso }))
  };
}

async function fetchFromOpenMeteo(baseUrl, providerName, sample) {
  const upstreamUrl = createOpenMeteoUrl(baseUrl, sample);
  const endpoint = new URL(baseUrl).pathname.replace('/v1/', '');
  let upstream;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      upstream = await fetchWithTimeout(upstreamUrl.toString(), {
        headers: { Accept: 'application/json' }
      }, 12000);
      break;
    } catch {
      if (attempt === 1) return { wind: null, error: `${providerName}: timeout` };
      await sleep(500);
    }
  }

  if (!upstream) return { wind: null, error: `${providerName}: no response` };

  if (!upstream.ok) {
    let reason = `HTTP ${upstream.status}`;
    try {
      const errorBody = await upstream.json();
      reason = errorBody?.reason || reason;
    } catch {
      // Ignore body parse.
    }
    return { wind: null, error: `${providerName}: ${reason}` };
  }

  const data = await upstream.json();
  const times = data.hourly?.time ?? [];
  if (!times.length) {
    return { wind: null, error: `${providerName}: no hourly time array` };
  }

  const hourIndex = pickHourIndex(times, sample.timeIso);
  const sourceTimeIso = normalizeOpenMeteoTime(times[hourIndex]);
  const wind = interpolateWind(data.hourly, hourIndex, sample, providerName, endpoint);
  if (!wind) {
    return { wind: null, error: `${providerName}: no pressure-level wind for sample` };
  }

  return {
    wind: markCache(withSourceTime(wind, sourceTimeIso), 'live'),
    error: null
  };
}

async function fetchOpenMeteo(sample, request, context) {
  const cache = getRuntimeCache();
  const attempts = [
    ['https://api.open-meteo.com/v1/meteofrance', 'open-meteo-meteofrance']
  ];

  if (cache) {
    const cacheUrl = new URL(request.url);
    cacheUrl.pathname = `/api/weather/wind-cache-v3/${encodeURIComponent(sample.normalizedKey)}`;
    const cacheKey = new Request(cacheUrl.toString(), { method: 'GET' });
    const cached = await cache.match(cacheKey);
    if (cached) return { wind: markCache(await cached.json(), 'cloudflare'), errors: [] };

    const errors = [];
    for (const [baseUrl, providerName] of attempts) {
      const result = await fetchFromOpenMeteo(baseUrl, providerName, sample);
      if (result.wind) {
        const response = jsonResponse(result.wind, 200, 3600);
        context.waitUntil(cache.put(cacheKey, response.clone()));
        return { wind: result.wind, errors };
      }
      errors.push(result.error);
    }

    return { wind: null, errors };
  }

  const errors = [];
  for (const [baseUrl, providerName] of attempts) {
    const result = await fetchFromOpenMeteo(baseUrl, providerName, sample);
    if (result.wind) return { wind: result.wind, errors };
    errors.push(result.error);
  }

  return { wind: null, errors };
}

export async function onRequestPost(context) {
  let body;

  try {
    body = await context.request.json();
  } catch {
    return jsonResponse({ error: 'invalid json', samples: [] }, 400);
  }

  const incoming = Array.isArray(body?.samples) ? body.samples.slice(0, 40) : [];
  const normalized = incoming.map(normalizeSample).filter(validSample);

  const uniqueByKey = new Map();
  for (const sample of normalized) {
    if (!uniqueByKey.has(sample.normalizedKey)) uniqueByKey.set(sample.normalizedKey, sample);
  }

  const fetchedByKey = new Map();
  const errors = [];

  await Promise.all([...uniqueByKey.values()].map(async (sample) => {
    try {
      const result = await fetchOpenMeteo(sample, context.request, context);
      if (result.wind) {
        fetchedByKey.set(sample.normalizedKey, result.wind);
      } else {
        errors.push({ key: sample.normalizedKey, reasons: result.errors });
      }
    } catch (error) {
      errors.push({ key: sample.normalizedKey, reasons: [error instanceof Error ? error.message : 'unknown error'] });
    }
  }));

  const samples = normalized
    .map((sample) => {
      const wind = fetchedByKey.get(sample.normalizedKey);
      if (!wind) return null;
      const auditTemplate = wind.auditSamples?.[0];
      const auditSamples = auditTemplate ? [{
        ...auditTemplate,
        sampleId: sample.sampleId,
        latitude: sample.latitude,
        longitude: sample.longitude,
        altitudeFt: sample.altitudeFt,
        requestedTimeIso: sample.timeIso,
        normalizedKey: sample.normalizedKey
      }] : [];

      return {
        sampleId: sample.sampleId,
        branchId: sample.branchId,
        directionDeg: wind.directionDeg,
        speedKt: wind.speedKt,
        sourceTimeIso: wind.sourceTimeIso,
        provider: wind.provider,
        endpoint: wind.endpoint,
        fallback: wind.fallback,
        cache: wind.cache,
        normalizedKey: sample.normalizedKey,
        auditSamples
      };
    })
    .filter(Boolean);

  return jsonResponse({
    source: 'open-meteo-meteofrance-strict',
    mode: 'meteofrance-strict',
    generatedAt: new Date().toISOString(),
    samples,
    errors: errors.slice(0, 8),
    cacheRuntime: getRuntimeCache() ? 'available' : 'unavailable'
  });
}
