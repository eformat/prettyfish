/**
 * Pretty Fish edge worker.
 *
 * Routes /api/relay/* and /api/mcp/* to the relay Durable Object worker.
 * All other requests fall through to the Cloudflare Assets (SPA).
 *
 * Static assets are served by the Assets binding — the Worker fetch handler
 * is NOT invoked for asset requests, so there is no per-request cost for
 * loading JS/CSS/HTML files.
 */

export interface Env {
  ASSETS: { fetch: (request: Request) => Promise<Response> }
}

const RELAY_WORKER_URL = 'https://prettyfish-relay.binalgo.workers.dev'

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    // Proxy relay and MCP API calls to the relay worker
    if (url.pathname.startsWith('/api/relay/') || url.pathname.startsWith('/api/mcp/')) {
      const targetUrl = `${RELAY_WORKER_URL}${url.pathname}${url.search}`
      // Forward request preserving method, headers, body
      return fetch(targetUrl, {
        method: request.method,
        headers: request.headers,
        body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : null,
        redirect: 'follow',
      })
    }

    // Everything else → SPA assets (served by Cloudflare Assets, not billed as worker requests)
    return env.ASSETS.fetch(request)
  },
}
