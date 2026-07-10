export function onRequestGet({ env }) {
  return new Response(JSON.stringify({
    service: 'openaip',
    keyConfigured: Boolean(env.OPENAIP_API_KEY),
    proxy: 'cap-clair-cloudflare-pages-function'
  }), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store'
    }
  });
}
