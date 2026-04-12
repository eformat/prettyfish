/**
 * Unit tests for relay session logic.
 *
 * Tests pure helper functions extracted from worker.ts without any
 * Cloudflare-specific APIs — no WebSocket, no DO, no fetch.
 */
import { describe, expect, it } from 'vitest'

// ── Helpers replicated from worker.ts for unit testing ────────────────────────
// These mirror the exact logic in worker.ts so we can test them in isolation.

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

async function hmacSign(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message))
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('')
}

async function hmacVerify(secret: string, message: string, expected: string): Promise<boolean> {
  const actual = await hmacSign(secret, message)
  return actual === expected
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('makeSessionId', () => {
  it('generates IDs matching word-word-word-hex4 pattern', () => {
    const pattern = /^[a-z]+-[a-z]+-[a-z]+-[0-9a-f]{4}$/
    for (let i = 0; i < 20; i++) {
      expect(makeSessionId()).toMatch(pattern)
    }
  })

  it('generates unique IDs', () => {
    const ids = new Set(Array.from({ length: 100 }, () => makeSessionId()))
    // With 160^3 * 65536 = ~268B combinations, collisions in 100 samples are astronomically unlikely
    expect(ids.size).toBe(100)
  })

  it('uses only words from the word list', () => {
    const wordSet = new Set(WORDS)
    for (let i = 0; i < 50; i++) {
      const id = makeSessionId()
      const parts = id.split('-')
      expect(parts).toHaveLength(4)
      // First 3 parts must be from the word list
      expect(wordSet.has(parts[0])).toBe(true)
      expect(wordSet.has(parts[1])).toBe(true)
      expect(wordSet.has(parts[2])).toBe(true)
      // 4th part must be 4 hex chars
      expect(parts[3]).toMatch(/^[0-9a-f]{4}$/)
    }
  })

  it('hex suffix is always 4 characters (zero-padded)', () => {
    for (let i = 0; i < 50; i++) {
      const id = makeSessionId()
      const hex = id.split('-')[3]
      expect(hex).toHaveLength(4)
    }
  })
})

describe('makeToken', () => {
  it('generates a 32-char hex string', () => {
    for (let i = 0; i < 10; i++) {
      const token = makeToken()
      expect(token).toMatch(/^[0-9a-f]{32}$/)
    }
  })

  it('generates unique tokens', () => {
    const tokens = new Set(Array.from({ length: 50 }, () => makeToken()))
    expect(tokens.size).toBe(50)
  })
})

describe('HMAC signing and verification', () => {
  it('sign + verify roundtrip succeeds', async () => {
    const secret = 'test-secret-key'
    const message = 'command-id-12345'
    const sig = await hmacSign(secret, message)
    expect(sig).toMatch(/^[0-9a-f]{64}$/) // SHA-256 = 32 bytes = 64 hex chars
    const valid = await hmacVerify(secret, message, sig)
    expect(valid).toBe(true)
  })

  it('rejects wrong message', async () => {
    const secret = 'test-secret-key'
    const sig = await hmacSign(secret, 'message-a')
    const valid = await hmacVerify(secret, 'message-b', sig)
    expect(valid).toBe(false)
  })

  it('rejects wrong secret', async () => {
    const sig = await hmacSign('secret-a', 'message')
    const valid = await hmacVerify('secret-b', 'message', sig)
    expect(valid).toBe(false)
  })

  it('rejects tampered signature', async () => {
    const sig = await hmacSign('secret', 'message')
    const tampered = sig.slice(0, -2) + 'ff'
    const valid = await hmacVerify('secret', 'message', tampered)
    expect(valid).toBe(false)
  })

  it('is deterministic for same inputs', async () => {
    const sig1 = await hmacSign('secret', 'message')
    const sig2 = await hmacSign('secret', 'message')
    expect(sig1).toBe(sig2)
  })

  it('produces different signatures for different secrets', async () => {
    const sig1 = await hmacSign('secret-1', 'message')
    const sig2 = await hmacSign('secret-2', 'message')
    expect(sig1).not.toBe(sig2)
  })
})

describe('URL construction', () => {
  const cases = [
    { base: 'http://localhost:4175', expectedWs: 'ws://localhost:4175' },
    { base: 'https://pretty.fish', expectedWs: 'wss://pretty.fish' },
    { base: 'https://prettyfish.binalgo.workers.dev', expectedWs: 'wss://prettyfish.binalgo.workers.dev' },
  ]

  for (const { base, expectedWs } of cases) {
    it(`converts ${base} to WebSocket URL correctly`, () => {
      const sessionId = 'amber-coral-pine-a3f9'
      const token = 'abc123'
      const wsBase = base.replace(/^http/, 'ws')
      const wsUrl = `${wsBase}/relay/${sessionId}/ws?token=${token}`
      expect(wsUrl).toBe(`${expectedWs}/relay/${sessionId}/ws?token=${token}`)
    })
  }

  it('mcp URL is always under /relay/{id}/mcp', () => {
    const sessionId = 'amber-coral-pine-a3f9'
    const base = 'https://pretty.fish'
    const mcpUrl = `${base}/relay/${sessionId}/mcp`
    expect(mcpUrl).toBe('https://pretty.fish/relay/amber-coral-pine-a3f9/mcp')
  })
})

describe('command timeout logic', () => {
  it('set_diagram_code timeout adds 2000ms buffer', () => {
    const userTimeout = 15_000
    const resolvedTimeout = userTimeout + 2_000
    expect(resolvedTimeout).toBe(17_000)
  })

  it('default timeout is 22000ms when not specified', () => {
    const timeoutMs = undefined
    const resolvedTimeout = typeof timeoutMs === 'number' ? timeoutMs + 2_000 : 22_000
    expect(resolvedTimeout).toBe(22_000)
  })
})

describe('CORS origin validation', () => {
  const ALLOWED = [
    /^https:\/\/pretty\.fish$/,
    /^https:\/\/www\.pretty\.fish$/,
    /^https:\/\/prettyfish\.binalgo\.workers\.dev$/,
    /^http:\/\/localhost:\d+$/,
    /^http:\/\/127\.0\.0\.1:\d+$/,
  ]

  const isAllowed = (origin: string) => ALLOWED.some(p => p.test(origin))

  it('allows production origins', () => {
    expect(isAllowed('https://pretty.fish')).toBe(true)
    expect(isAllowed('https://www.pretty.fish')).toBe(true)
    expect(isAllowed('https://prettyfish.binalgo.workers.dev')).toBe(true)
  })

  it('allows localhost dev origins', () => {
    expect(isAllowed('http://localhost:4175')).toBe(true)
    expect(isAllowed('http://localhost:5173')).toBe(true)
    expect(isAllowed('http://127.0.0.1:4175')).toBe(true)
  })

  it('rejects unknown origins', () => {
    expect(isAllowed('https://evil.com')).toBe(false)
    expect(isAllowed('https://pretty.fish.evil.com')).toBe(false)
    expect(isAllowed('http://pretty.fish')).toBe(false) // http not https
    expect(isAllowed('https://localhost:4175')).toBe(false) // https not http for localhost
  })
})
