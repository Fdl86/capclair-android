export function onRequestGet() {
  return new Response(JSON.stringify({
    ok: true,
    service: 'weather',
    endpoint: '/api/weather/wind-aloft',
    cacheRuntime: typeof caches !== 'undefined' && caches.default ? 'available' : 'unavailable'
  }), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*'
    }
  });
}
