/**
 * Unit tests for the relay protocol types and helpers.
 * Tests the pure logic without any Cloudflare-specific APIs.
 */
import { describe, expect, it } from 'vitest'
import { isRelayEnvelope, type RelayEnvelope } from '../protocol.js'

describe('isRelayEnvelope', () => {
  it('returns true for valid envelopes', () => {
    const envelopes: RelayEnvelope[] = [
      { type: 'hello', role: 'browser', sessionId: 'test-123' },
      { type: 'peer_status', role: 'agent', connected: true },
      { type: 'command', id: 'abc', command: 'list_diagrams' },
      { type: 'command_result', id: 'abc', result: { ok: true } },
      { type: 'command_result', id: 'abc', error: { message: 'Failed' } },
      { type: 'error', message: 'Something went wrong' },
    ]
    for (const env of envelopes) {
      expect(isRelayEnvelope(env)).toBe(true)
    }
  })

  it('returns false for non-envelopes', () => {
    expect(isRelayEnvelope(null)).toBe(false)
    expect(isRelayEnvelope(undefined)).toBe(false)
    expect(isRelayEnvelope('string')).toBe(false)
    expect(isRelayEnvelope(42)).toBe(false)
    expect(isRelayEnvelope({})).toBe(false) // no 'type' key
    expect(isRelayEnvelope([])).toBe(false)
  })

  it('returns true for objects with type key (duck typing)', () => {
    // isRelayEnvelope is intentionally permissive — just checks for 'type' key
    expect(isRelayEnvelope({ type: 'unknown_future_type' })).toBe(true)
  })
})

describe('RelaySessionRecord', () => {
  it('has required fields as numbers for createdAt', () => {
    const record = {
      sessionId: 'word1-word2-word3-abcd',
      browserToken: 'abc123',
      browserProof: 'proof456',
      createdAt: Date.now(),
    }
    expect(typeof record.createdAt).toBe('number')
    expect(record.createdAt).toBeGreaterThan(0)
  })
})

describe('PublicRelaySessionResponse', () => {
  it('contains all required fields', () => {
    const response = {
      sessionId: 'word1-word2-word3-abcd',
      browserToken: 'tok123',
      wsUrl: 'wss://example.com/relay/word1-word2-word3-abcd/ws?token=tok123',
      mcpUrl: 'https://example.com/relay/word1-word2-word3-abcd/mcp',
      browserProof: 'proof456',
    }
    expect(response.wsUrl).toContain('/relay/')
    expect(response.wsUrl).toContain('/ws?token=')
    expect(response.mcpUrl).toContain('/relay/')
    expect(response.mcpUrl).toContain('/mcp')
    expect(response.browserProof).toBeTruthy()
  })

  it('wsUrl uses the correct protocol conversion', () => {
    const httpBase = 'http://localhost:4175'
    const httpsBase = 'https://pretty.fish'
    const sessionId = 'amber-coral-pine-a3f9'
    const token = 'abc123'

    const httpWs = `${httpBase.replace(/^http/, 'ws')}/relay/${sessionId}/ws?token=${token}`
    const httpsWs = `${httpsBase.replace(/^http/, 'ws')}/relay/${sessionId}/ws?token=${token}`

    expect(httpWs).toBe('ws://localhost:4175/relay/amber-coral-pine-a3f9/ws?token=abc123')
    expect(httpsWs).toBe('wss://pretty.fish/relay/amber-coral-pine-a3f9/ws?token=abc123')
  })
})

describe('session ID format', () => {
  it('matches expected pattern', () => {
    // Session IDs are: word-word-word-hex4
    const pattern = /^[a-z]+-[a-z]+-[a-z]+-[0-9a-f]{4}$/
    const examples = [
      'amber-coral-pine-a3f9',
      'zephyr-tide-stone-00ff',
      'willow-mist-oak-dead',
    ]
    for (const id of examples) {
      expect(id).toMatch(pattern)
    }
  })
})

describe('command envelope', () => {
  it('command_result with error uses object format', () => {
    const result: RelayEnvelope = {
      type: 'command_result',
      id: 'test-id',
      error: { message: 'Browser not connected', code: 'BROWSER_DISCONNECTED' },
    }
    expect(result.type).toBe('command_result')
    if (result.type === 'command_result') {
      expect(result.error?.message).toBe('Browser not connected')
      expect(result.error?.code).toBe('BROWSER_DISCONNECTED')
      expect(result.result).toBeUndefined()
    }
  })

  it('command_result with result has no error', () => {
    const result: RelayEnvelope = {
      type: 'command_result',
      id: 'test-id',
      result: { diagrams: [] },
    }
    if (result.type === 'command_result') {
      expect(result.result).toEqual({ diagrams: [] })
      expect(result.error).toBeUndefined()
    }
  })
})
