import { createServer } from 'node:http'
import { randomUUID, createHmac } from 'node:crypto'
import { WebSocketServer } from 'ws'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { z } from 'zod'

const PORT = parseInt(process.env.PORT || '8081', 10)

// ── In-memory session store ──────────────────────────────────────────────────

const sessions = new Map()

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

function makeToken() {
  return randomUUID().replaceAll('-', '')
}

function makeSessionId() {
  const arr = new Uint32Array(3)
  crypto.getRandomValues(arr)
  const words = Array.from(arr).map((n) => WORDS[n % WORDS.length]).join('-')
  const hash = randomUUID().replaceAll('-', '').slice(0, 4)
  return `${words}-${hash}`
}

function hmacSign(key, message) {
  return createHmac('sha256', key).update(message).digest('hex')
}

function getSession(sessionId) {
  return sessions.get(sessionId) || null
}

function jsonResponse(res, body, status = 200) {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(body))
}

function corsHeaders(res) {
  res.setHeader('access-control-allow-origin', '*')
  res.setHeader('access-control-allow-methods', 'GET,POST,DELETE,OPTIONS')
  res.setHeader('access-control-allow-headers', 'content-type,authorization,mcp-protocol-version,accept')
  res.setHeader('access-control-max-age', '86400')
}

// ── Session class (replaces Durable Object) ──────────────────────────────────

class RelaySession {
  constructor(record) {
    this.record = record
    this.browserSocket = null
    this.agentSocket = null
    this.pendingHttpCommands = new Map()
  }

  sendTo(socket, message) {
    if (!socket || socket.readyState !== 1) return false
    socket.send(JSON.stringify(message))
    return true
  }

  notifyPeerStatus(role, connected) {
    const counterpart = role === 'browser' ? this.agentSocket : this.browserSocket
    this.sendTo(counterpart, { type: 'peer_status', role, connected })
  }

  attachSocket(ws, role) {
    // Close existing socket for this role
    if (role === 'browser' && this.browserSocket) {
      try { this.browserSocket.close() } catch {}
    }
    if (role === 'agent' && this.agentSocket) {
      try { this.agentSocket.close() } catch {}
    }

    if (role === 'browser') this.browserSocket = ws
    else this.agentSocket = ws

    // Send hello
    ws.send(JSON.stringify({
      type: 'hello',
      role,
      sessionId: this.record.sessionId,
    }))
    this.notifyPeerStatus(role, true)

    ws.on('message', (data) => {
      let envelope
      try {
        envelope = JSON.parse(typeof data === 'string' ? data : data.toString())
      } catch { return }

      // Handle ping/pong
      if (envelope.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong' }))
        return
      }

      // Handle command results from browser
      if (envelope.type === 'command_result') {
        const pending = this.pendingHttpCommands.get(envelope.id)
        if (!pending) return
        clearTimeout(pending.timer)
        this.pendingHttpCommands.delete(envelope.id)
        if (envelope.error) {
          pending.resolve({ jsonrpc: '2.0', id: envelope.id, error: { code: -32000, message: envelope.error.message } })
        } else {
          pending.resolve({ jsonrpc: '2.0', id: envelope.id, result: envelope.result })
        }
        return
      }

      // Forward messages between peers
      if (role === 'browser') {
        this.sendTo(this.agentSocket, envelope)
      } else if (role === 'agent') {
        this.sendTo(this.browserSocket, envelope)
      }
    })

    ws.on('close', () => {
      if (role === 'browser' && this.browserSocket === ws) this.browserSocket = null
      if (role === 'agent' && this.agentSocket === ws) this.agentSocket = null
      this.notifyPeerStatus(role, false)
    })

    ws.on('error', () => {
      if (role === 'browser' && this.browserSocket === ws) this.browserSocket = null
      if (role === 'agent' && this.agentSocket === ws) this.agentSocket = null
      this.notifyPeerStatus(role, false)
    })
  }

  async sendCommandToBrowser(command, args = {}, timeoutMs = 20000) {
    if (!this.browserSocket || this.browserSocket.readyState !== 1) {
      throw new Error('Pretty Fish browser is not attached to this relay session')
    }

    const id = randomUUID()
    const sig = this.record.browserProof ? hmacSign(this.record.browserProof, id) : ''

    const response = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingHttpCommands.delete(id)
        reject(new Error(`Timed out waiting for relay result: ${command}`))
      }, timeoutMs)

      this.pendingHttpCommands.set(id, { resolve, reject, timer })
      this.browserSocket.send(JSON.stringify({
        type: 'command',
        id,
        command,
        args,
        sig,
      }))
    })

    if (response.error) throw new Error(response.error.message)
    return response.result
  }

  createMcpServer() {
    const server = new McpServer({ name: 'prettyfish', version: '1.0.0' })
    const cmd = async (toolName, args = {}, timeoutMs) => {
      const result = await this.sendCommandToBrowser(toolName, args, timeoutMs)
      return { content: [{ type: 'text', text: JSON.stringify(result) }] }
    }

    server.tool('list_diagrams', 'List all diagrams across all pages in the current workspace.', {}, async () => cmd('list_diagrams'))
    server.tool('get_diagram', 'Get the current Mermaid source code and metadata for a specific diagram.',
      { diagramId: z.string().describe('The diagram ID to retrieve.') },
      async (args) => cmd('get_diagram', args),
    )
    server.tool('list_diagram_types', 'List all supported Mermaid diagram types.', {}, async () => cmd('list_diagram_types'))
    server.tool('get_diagram_reference', 'Get the full syntax reference for a Mermaid diagram type.',
      { type: z.string().describe('Diagram type ID (e.g. "flowchart", "sequence", "classDiagram").') },
      async (args) => cmd('get_diagram_reference', args),
    )
    server.tool('export_svg', 'Export a diagram as SVG.',
      { diagramId: z.string(), timeoutMs: z.number().optional() },
      async ({ diagramId, timeoutMs }) => cmd('export_svg', { diagramId, timeoutMs }, typeof timeoutMs === 'number' ? timeoutMs + 2000 : 22000),
    )
    server.tool('create_diagram', 'Create a new Mermaid diagram on the current page.',
      {
        name: z.string().optional().describe('A short descriptive name for the diagram.'),
        description: z.string().optional().describe('Optional short caption.'),
        code: z.string().optional().describe('Mermaid diagram source code.'),
        width: z.number().optional(),
        theme: z.string().optional().describe('Optional theme ID.'),
      },
      async (args) => cmd('create_diagram', args),
    )
    server.tool('set_diagram_code', "Replace a diagram's Mermaid source code.",
      { diagramId: z.string(), code: z.string(), timeoutMs: z.number().optional(), select: z.boolean().optional() },
      async ({ diagramId, code, timeoutMs, select }) => cmd('set_diagram_code', { diagramId, code, timeoutMs, select }, typeof timeoutMs === 'number' ? timeoutMs + 2000 : 22000),
    )
    server.tool('set_diagram_theme', 'Change the visual theme of a specific diagram.',
      { diagramId: z.string(), theme: z.string().describe('Theme ID.') },
      async (args) => cmd('set_theme', args),
    )
    server.tool('export_png', 'Export a diagram as a PNG image.',
      { diagramId: z.string() },
      async ({ diagramId }) => {
        const result = await this.sendCommandToBrowser('export_png', { diagramId }, 22000)
        if (!result?.diagram) {
          return { content: [{ type: 'text', text: JSON.stringify(result) }], isError: true }
        }
        return {
          content: [
            { type: 'text', text: JSON.stringify({ fileName: result.fileName, mimeType: result.mimeType }) },
            { type: 'image', data: result.diagram, mimeType: result.mimeType || 'image/png' },
          ],
        }
      },
    )
    server.tool('delete_diagram', 'Delete a diagram by ID.', { diagramId: z.string() }, async (args) => cmd('delete_diagram', args))
    server.tool('select_diagram', 'Bring a specific diagram into focus/view.', { diagramId: z.string() }, async (args) => cmd('select_diagram', args))
    server.tool('list_themes', 'List all available visual themes.', {}, async () => cmd('list_themes'))
    server.tool('session_info', 'Get current relay session info.', {}, async () => ({
      content: [{ type: 'text', text: JSON.stringify({
        sessionId: this.record.sessionId,
        browserAttached: this.browserSocket?.readyState === 1,
      }) }],
    }))

    return server
  }
}

// ── HTTP server ──────────────────────────────────────────────────────────────

const server = createServer(async (req, res) => {
  corsHeaders(res)

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  const url = new URL(req.url, `http://localhost:${PORT}`)

  // POST /relay/sessions/public — create session
  if (req.method === 'POST' && (url.pathname === '/relay/sessions' || url.pathname === '/relay/sessions/public')) {
    let browserProof = ''
    try {
      const body = await readBody(req)
      if (body) {
        const parsed = JSON.parse(body)
        if (typeof parsed.browserProof === 'string') browserProof = parsed.browserProof
      }
    } catch {}
    if (!browserProof) browserProof = makeToken()

    const sessionId = makeSessionId()
    const record = {
      sessionId,
      browserToken: makeToken(),
      browserProof,
      createdAt: new Date().toISOString(),
    }

    const session = new RelaySession(record)
    sessions.set(sessionId, session)

    // Clean up sessions after 24 hours
    setTimeout(() => sessions.delete(sessionId), 24 * 60 * 60 * 1000)

    const proto = req.headers['x-forwarded-proto'] || req.headers['x-scheme'] || 'https'
    const baseUrl = `${proto}://${req.headers['x-forwarded-host'] || req.headers.host}`
    return jsonResponse(res, {
      ...record,
      mcpUrl: `${baseUrl}/mcp/${sessionId}`,
    }, 201)
  }

  // POST/GET /mcp/:sessionId — MCP requests
  const mcpMatch = url.pathname.match(/^\/mcp\/([^/]+)$/)
  if (mcpMatch) {
    const session = sessions.get(mcpMatch[1])
    if (!session) return jsonResponse(res, { error: 'Session not found' }, 404)

    if (req.method === 'POST' || req.method === 'GET' || req.method === 'DELETE') {
      const mcpServer = session.createMcpServer()
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      })
      await mcpServer.connect(transport)

      try {
        await transport.handleRequest(req, res)
      } finally {
        await transport.close()
      }
      return
    }

    return jsonResponse(res, { error: 'Method not allowed' }, 405)
  }

  jsonResponse(res, { error: 'Not found' }, 404)
})

// ── WebSocket server ─────────────────────────────────────────────────────────

const wss = new WebSocketServer({ server })

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, `http://localhost:${PORT}`)
  const match = url.pathname.match(/^\/relay\/sessions\/([^/]+)\/(browser|agent)$/)

  if (!match) {
    ws.close(4000, 'Invalid path')
    return
  }

  const [, sessionId, role] = match
  const session = sessions.get(sessionId)

  if (!session) {
    ws.close(4004, 'Session not found')
    return
  }

  // Validate browser token
  if (role === 'browser') {
    const token = url.searchParams.get('token') || ''
    if (!token || token !== session.record.browserToken) {
      ws.close(4003, 'Invalid relay token')
      return
    }
  }

  session.attachSocket(ws, role)
})

// ── Helpers ──────────────────────────────────────────────────────────────────

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks).toString()))
    req.on('error', reject)
  })
}

server.listen(PORT, '0.0.0.0', () => {
  console.log(`prettyfish-relay listening on :${PORT}`)
})
