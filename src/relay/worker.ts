/**
 * Pretty Fish Relay Worker
 *
 * Architecture:
 * ─────────────
 * One Cloudflare Durable Object (DO) per relay session.
 * Each session is created by one browser tab and consumed by one AI agent.
 *
 * The DO uses the WebSocket Hibernation API so it sleeps between messages
 * and only wakes when traffic arrives — zero idle cost.
 *
 * The MCP server is created FRESH per HTTP request (stateless mode).
 * This is correct for Cloudflare Workers: in-memory state (like McpServer)
 * is lost when the DO hibernates, so it must never be cached on the instance.
 *
 * The only persistent state is the session record in DurableObjectStorage.
 * WebSockets survive hibernation via acceptWebSocket (hibernation API).
 *
 * Flow:
 *   Browser → POST /relay/sessions     → creates session, returns {sessionId, wsUrl, mcpUrl}
 *   Browser → WS  /relay/{id}/ws?token → browser WebSocket connection
 *   Agent   → WS  /relay/{id}/agent    → agent WebSocket connection (for future use)
 *   Agent   → POST /relay/{id}/mcp     → MCP Streamable HTTP (per request)
 *
 * Every MCP tool call is forwarded to the browser via WebSocket command/result.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { z } from 'zod'
import type {
  PublicRelaySessionResponse,
  RelayEnvelope,
  RelayPeerRole,
  RelaySessionRecord,
} from './protocol.js'

// ── Cloudflare-specific type declarations ─────────────────────────────────────

declare const WebSocketPair: new () => { 0: WebSocket; 1: WebSocket }

declare class WebSocketRequestResponsePair {
  constructor(request: string, response: string)
  getRequest(): string
  getResponse(): string
}

interface DurableObjectStorage {
  get<T>(key: string): Promise<T | undefined>
  put(key: string, value: unknown): Promise<void>
}

interface DurableObjectState {
  storage: DurableObjectStorage
  blockConcurrencyWhile<T>(callback: () => Promise<T>): Promise<T>
  acceptWebSocket(ws: WebSocket, tags?: string[]): void
  getWebSockets(tag?: string): WebSocket[]
  getTags(ws: WebSocket): string[]
  setWebSocketAutoResponse(pair?: WebSocketRequestResponsePair): void
  getWebSocketAutoResponse(): WebSocketRequestResponsePair | null
  getWebSocketAutoResponseTimestamp(ws: WebSocket): Date | null
}

// ── Environment ───────────────────────────────────────────────────────────────

export interface RelayWorkerEnv {
  RELAY_SESSIONS: {
    idFromName(name: string): { toString(): string }
    get(id: { toString(): string }): { fetch(req: Request): Promise<Response> }
  }
  RELAY_BOOTSTRAP_TOKEN: string
}

// ── Constants ─────────────────────────────────────────────────────────────────

const SESSION_KEY = 'session'
const COMMAND_TIMEOUT_MS = 20_000

const ALLOWED_ORIGINS = [
  /^https:\/\/pretty\.fish$/,
  /^https:\/\/www\.pretty\.fish$/,
  /^https:\/\/prettyfish\.binalgo\.workers\.dev$/,
  /^http:\/\/localhost:\d+$/,
  /^http:\/\/127\.0\.0\.1:\d+$/,
]

// ── Word list for human-readable session IDs ──────────────────────────────────

const WORDS = [
  'amber','azure','birch','bloom','brass','brook','cedar','chalk','clay','cloud',
  'cobalt','coral','crane','crisp','denim','dewdrop','dove','dusk','elder','fawn',
  'fern','field','finch','flame','flint','foam','frost','gale','glint','grove',
  'hazel','heron','holly','honey','husk','indigo','iris','ivory','jade','juniper',
  'kelp','lark','lemon','lichen','lime','linen','loch','lotus','lunar','maple',
  'marsh','mist','moss','mote','muslin','myrtle','navy','nimbus','oak','oat',
  'obsidian','ochre','olive','onyx','opal','orchid','otter','pebble','pine','plum',
  'poppy','prairie','quartz','rain','reed','robin','rose','rune','rush','sable',
  'sage','sand','seafoam','sienna','slate','snow','solstice','sorrel','sparrow',
  'spruce','stone','straw','stream','sycamore','tallow','taupe','teal','thistle',
  'thyme','tide','timber','topaz','tulip','tundra','umber','vale','vapor','vine',
  'violet','vole','walnut','wave','wheat','willow','wren','yarrow','zephyr',
]

function makeSessionId(): string {
  const pick = () => WORDS[Math.floor(Math.random() * WORDS.length)]
  const hex = () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, '0')
  return `${pick()}-${pick()}-${pick()}-${hex()}`
}

function makeToken(): string {
  return crypto.randomUUID().replace(/-/g, '')
}

// ── HMAC helpers ──────────────────────────────────────────────────────────────

async function hmacSign(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message))
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('')
}

// ── CORS / Response helpers ───────────────────────────────────────────────────

function corsHeaders(origin: string | null): HeadersInit {
  const allowed = ALLOWED_ORIGINS.some(p => p.test(origin ?? ''))
  return allowed ? {
    'Access-Control-Allow-Origin': origin!,
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, Mcp-Session-Id, MCP-Protocol-Version',
    'Access-Control-Max-Age': '86400',
  } : {}
}

function json(body: unknown, status = 200, extraHeaders: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  })
}

function getBaseUrl(req: Request): string {
  const u = new URL(req.url)
  return `${u.protocol}//${u.host}`
}

// ── Worker entrypoint (main fetch) ────────────────────────────────────────────

export async function handleRelayRequest(req: Request, env: RelayWorkerEnv): Promise<Response> {
  const url = new URL(req.url)
  const origin = req.headers.get('origin')
  const cors = corsHeaders(origin)

  // Preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors })
  }

  // POST /relay/sessions — create a new relay session
  if (req.method === 'POST' && url.pathname === '/relay/sessions') {
    const sessionId = makeSessionId()
    const browserToken = makeToken()
    const browserProof = makeToken()
    const base = getBaseUrl(req)

    const session: RelaySessionRecord = {
      sessionId,
      browserToken,
      browserProof,
      createdAt: Date.now(),
    }

    // Store the session in the DO
    const stub = getStub(env, sessionId)
    await stub.fetch(new Request(`${base}/do-internal/setup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(session),
    }))

    const response: PublicRelaySessionResponse = {
      sessionId,
      browserToken,
      wsUrl: `${base.replace(/^http/, 'ws')}/relay/${sessionId}/ws?token=${browserToken}`,
      mcpUrl: `${base}/relay/${sessionId}/mcp`,
      browserProof,
    }
    return json(response, 200, cors)
  }

  // /relay/{sessionId}/... — route to the appropriate DO
  const sessionMatch = url.pathname.match(/^\/relay\/([^/]+)(\/.*)$/)
  if (sessionMatch) {
    const [, sessionId, subpath] = sessionMatch
    const stub = getStub(env, sessionId)

    // Forward to the DO, rewriting the URL to the subpath
    const doUrl = new URL(req.url)
    doUrl.pathname = subpath
    const doReq = new Request(doUrl.toString(), {
      method: req.method,
      headers: req.headers,
      body: req.method !== 'GET' && req.method !== 'HEAD' ? req.body : undefined,
      // @ts-expect-error — Cloudflare-specific
      duplex: 'half',
    })

    const res = await stub.fetch(doReq)

    // WebSocket upgrades (101) must be returned DIRECTLY from the DO stub.
    // Wrapping in new Response() drops the Cloudflare `webSocket` property,
    // which breaks the upgrade handshake entirely.
    if (res.status === 101) {
      return res
    }

    // For regular responses, add CORS headers
    const headers = new Headers(res.headers)
    Object.entries(cors).forEach(([k, v]) => headers.set(k, v as string))
    return new Response(res.body, { status: res.status, headers })
  }

  return json({ error: 'Not found' }, 404, cors)
}

function getStub(env: RelayWorkerEnv, sessionId: string) {
  const id = env.RELAY_SESSIONS.idFromName(sessionId)
  return env.RELAY_SESSIONS.get(id)
}

// ── Durable Object ────────────────────────────────────────────────────────────

/**
 * One DO instance per relay session.
 *
 * Hibernation strategy:
 * - WebSockets use the hibernation API (acceptWebSocket) → DO sleeps between messages
 * - McpServer is created fresh per HTTP request (never stored on instance)
 * - Only DurableObjectStorage data survives hibernation
 * - ping/pong handled via setWebSocketAutoResponse → zero wake-up cost
 *
 * Pending commands (pendingHttpCommands Map) are in-memory only.
 * If the DO hibernates while a command is pending, the promise will reject
 * on the next wake via the timeout. This is acceptable: MCP tool calls
 * hold the HTTP connection open (via SSE) so the DO stays awake during a call.
 */
export class RelaySessionDurableObject {
  private readonly state: DurableObjectState
  private session: RelaySessionRecord | null = null

  // In-memory pending commands — survives as long as DO is awake.
  // Lost on hibernation (which only happens between requests — never mid-request).
  private readonly pending = new Map<string, {
    resolve: (result: unknown) => void
    reject: (err: Error) => void
    timer: ReturnType<typeof setTimeout>
  }>()

  constructor(state: DurableObjectState) {
    this.state = state

    // Zero-cost keepalive: browser sends {"type":"ping"} every ~55s.
    // The DO auto-replies {"type":"pong"} WITHOUT waking up.
    this.state.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair('{"type":"ping"}', '{"type":"pong"}'),
    )
  }

  // ── Session management ──────────────────────────────────────────────────────

  private async loadSession(): Promise<RelaySessionRecord | null> {
    if (this.session) return this.session
    this.session = await this.state.storage.get<RelaySessionRecord>(SESSION_KEY) ?? null
    return this.session
  }

  // ── WebSocket helpers ───────────────────────────────────────────────────────

  private browserSocket(): WebSocket | null {
    return this.state.getWebSockets('browser')[0] ?? null
  }

  private agentSocket(): WebSocket | null {
    return this.state.getWebSockets('agent')[0] ?? null
  }

  private send(ws: WebSocket | null, msg: RelayEnvelope): void {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg))
    }
  }

  private notifyPeerStatus(role: RelayPeerRole, connected: boolean): void {
    const counterpart = role === 'browser' ? this.agentSocket() : this.browserSocket()
    this.send(counterpart, { type: 'peer_status', role, connected })
  }

  // ── Browser command forwarding ──────────────────────────────────────────────

  /**
   * Send a command to the browser and wait for the result.
   * The browser executes the command and sends back a command_result envelope.
   */
  private async command(
    name: string,
    args: Record<string, unknown> = {},
    timeoutMs = COMMAND_TIMEOUT_MS,
  ): Promise<unknown> {
    const session = await this.loadSession()
    const browser = this.browserSocket()

    if (!browser || browser.readyState !== WebSocket.OPEN) {
      throw new Error('Pretty Fish is not connected to this session. Open the app and connect first.')
    }

    const id = crypto.randomUUID()

    // Sign the command so the browser can verify it came from this trusted relay
    const sig = session?.browserProof ? await hmacSign(session.browserProof, id) : ''

    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`Command timed out after ${timeoutMs}ms: ${name}`))
      }, timeoutMs)

      this.pending.set(id, { resolve, reject, timer })

      this.send(browser, {
        type: 'command',
        id,
        command: name,
        args,
        sig,
      })
    })
  }

  // ── MCP Server (created fresh per HTTP request) ───────────────────────────

  /**
   * Creates a fresh McpServer with all tools registered.
   * Called once per MCP HTTP request — never stored on the instance.
   *
   * Why not cached? McpServer is non-serializable in-memory state.
   * DO hibernation discards in-memory state, so caching it would cause
   * tools to vanish silently after hibernation. Creating per-request is fast
   * (just registering handler closures) and correct.
   */
  private createMcpServer(): McpServer {
    const server = new McpServer({
      name: 'prettyfish',
      version: '1.0.0',
    }, {
      instructions: [
        'You are connected to Pretty Fish — a Mermaid diagram editor running in the user\'s browser.',
        'All diagram operations happen in the currently active page.',
        'Always call list_diagrams first to understand what exists.',
        'Use get_diagram to fetch a diagram\'s source before editing it.',
        'After create_diagram or set_diagram_code, check render.status — if "error", fix the syntax.',
      ].join('\n'),
    })

    // Helper: run a browser command and return MCP text result
    const cmd = async (name: string, args: Record<string, unknown> = {}, timeoutMs?: number) => {
      const result = await this.command(name, args, timeoutMs)
      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] }
    }

    // ── Workspace tools ─────────────────────────────────────────────────────

    server.tool(
      'session_info',
      'Get the current relay session status and whether the Pretty Fish browser tab is connected.',
      {},
      async () => {
        const session = await this.loadSession()
        return { content: [{ type: 'text' as const, text: JSON.stringify({
          sessionId: session?.sessionId ?? null,
          browserConnected: this.browserSocket()?.readyState === WebSocket.OPEN,
        }) }] }
      },
    )

    server.tool(
      'list_diagrams',
      'List all diagrams in the current workspace (all pages). Returns each diagram\'s ID, name, page, and type.',
      {},
      async () => cmd('list_diagrams'),
    )

    server.tool(
      'get_diagram',
      'Get the full Mermaid source code and metadata for a specific diagram. Call this before editing.',
      { diagramId: z.string().describe('Diagram ID from list_diagrams.') },
      async (args) => cmd('get_diagram', args),
    )

    server.tool(
      'create_diagram',
      [
        'Create a new Mermaid diagram on the CURRENT active page and wait for it to render.',
        'Returns render.status — if "error", the syntax is wrong; call set_diagram_code with corrected code.',
        'Always give a short descriptive name (e.g. "User Auth Flow", "DB Schema").',
      ].join(' '),
      {
        name: z.string().optional().describe('Short descriptive name for the diagram.'),
        description: z.string().optional().describe('Optional caption (8–10 words) shown below the diagram.'),
        code: z.string().optional().describe('Mermaid source code.'),
        width: z.number().optional().describe('Canvas width in pixels.'),
        theme: z.string().optional().describe('Theme ID (e.g. "blueprint", "neon", "brutalist"). Omit for default.'),
      },
      async (args) => cmd('create_diagram', args),
    )

    server.tool(
      'set_diagram_code',
      'Replace a diagram\'s Mermaid source and wait for render. Returns render.status and render.error if invalid.',
      {
        diagramId: z.string(),
        code: z.string().describe('New Mermaid source code.'),
        timeoutMs: z.number().optional().describe('Max wait time in ms (default 20000).'),
        select: z.boolean().optional().describe('Bring diagram into focus after update.'),
      },
      async ({ diagramId, code, timeoutMs, select }) => {
        const timeout = typeof timeoutMs === 'number' ? timeoutMs + 2_000 : 22_000
        return cmd('set_diagram_code', { diagramId, code, timeoutMs, select }, timeout)
      },
    )

    server.tool(
      'set_diagram_theme',
      'Change the visual theme of a specific diagram.',
      {
        diagramId: z.string(),
        theme: z.string().describe('Theme ID — use list_themes to see available options.'),
      },
      async (args) => cmd('set_theme', args),
    )

    server.tool(
      'list_themes',
      'List all available visual themes with their names and IDs.',
      {},
      async () => cmd('list_themes'),
    )

    server.tool(
      'select_diagram',
      'Bring a specific diagram into view/focus on the canvas.',
      { diagramId: z.string() },
      async (args) => cmd('select_diagram', args),
    )

    server.tool(
      'delete_diagram',
      'Permanently delete a diagram by ID.',
      { diagramId: z.string() },
      async (args) => cmd('delete_diagram', args),
    )

    server.tool(
      'export_png',
      'Export a diagram as a PNG image. Returns base64-encoded image data.',
      { diagramId: z.string() },
      async ({ diagramId }) => {
        const result = await this.command('export_png', { diagramId }, 22_000) as {
          fileName?: string; diagram?: string; mimeType?: string
        }
        if (!result?.diagram) {
          return { content: [{ type: 'text' as const, text: JSON.stringify(result) }], isError: true }
        }
        return {
          content: [
            { type: 'text' as const, text: JSON.stringify({ fileName: result.fileName }) },
            { type: 'image' as const, data: result.diagram, mimeType: (result.mimeType ?? 'image/png') as 'image/png' },
          ],
        }
      },
    )

    return server
  }

  // ── Fetch handler (HTTP requests to the DO) ───────────────────────────────

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url)

    // Internal setup route — called by the worker after session creation
    if (req.method === 'POST' && url.pathname === '/do-internal/setup') {
      const session = await req.json() as RelaySessionRecord
      this.session = session
      await this.state.storage.put(SESSION_KEY, session)
      return json({ ok: true })
    }

    const session = await this.loadSession()
    if (!session) return json({ error: 'Session not found' }, 404)

    // WebSocket connect — browser or agent
    if (url.pathname === '/ws' || url.pathname === '/agent') {
      if (req.headers.get('upgrade')?.toLowerCase() !== 'websocket') {
        return json({ error: 'WebSocket upgrade required' }, 426)
      }

      const role: RelayPeerRole = url.pathname === '/ws' ? 'browser' : 'agent'

      // Browser connections require a token
      if (role === 'browser') {
        const token = url.searchParams.get('token') ?? ''
        if (!token || token !== session.browserToken) {
          return json({ error: 'Invalid token' }, 403)
        }
      }

      const pair = new WebSocketPair()
      const [client, server] = Object.values(pair) as [WebSocket, WebSocket]

      // Hibernation API — DO sleeps between messages, WebSocket stays alive
      this.state.acceptWebSocket(server, [role])

      // Greet the new peer
      this.send(server, { type: 'hello', role, sessionId: session.sessionId })

      // Notify the counterpart
      this.notifyPeerStatus(role, true)

      return new Response(null, {
        status: 101,
        // @ts-expect-error — Cloudflare-specific webSocket property
        webSocket: client,
      })
    }

    // MCP Streamable HTTP — create fresh McpServer + transport per request
    if (url.pathname === '/mcp') {
      const mcpServer = this.createMcpServer()
      // Stateless transport: no sessionIdGenerator → created fresh each request.
      // The SDK handles initialize, notifications/initialized, tools/list, tools/call, etc.
      const transport = new WebStandardStreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true, // simpler for agents that don't stream
      })
      await mcpServer.connect(transport)
      const response = await transport.handleRequest(req)
      await transport.close()
      return response
    }

    return json({ error: 'Not found' }, 404)
  }

  // ── WebSocket message handler (called on wake from hibernation) ───────────

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    let envelope: RelayEnvelope
    try {
      envelope = JSON.parse(typeof message === 'string' ? message : new TextDecoder().decode(message))
    } catch {
      return
    }

    const tags = this.state.getTags(ws)
    const role = tags[0] as RelayPeerRole | undefined

    // Handle command results from the browser
    if (envelope.type === 'command_result') {
      const pending = this.pending.get(envelope.id)
      if (!pending) return
      clearTimeout(pending.timer)
      this.pending.delete(envelope.id)
      if (envelope.error) {
        pending.reject(new Error(envelope.error.message ?? 'Command failed'))
      } else {
        pending.resolve(envelope.result)
      }
      return
    }

    // Forward other messages to counterpart
    if (role === 'browser') {
      this.send(this.agentSocket(), envelope)
    } else if (role === 'agent') {
      this.send(this.browserSocket(), envelope)
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    const tags = this.state.getTags(ws)
    const role = tags[0] as RelayPeerRole | undefined
    if (role) this.notifyPeerStatus(role, false)
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    await this.webSocketClose(ws)
  }
}
