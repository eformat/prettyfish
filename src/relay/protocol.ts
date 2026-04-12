/**
 * Pretty Fish Relay Protocol Types
 *
 * All messages exchanged between browser, agent, and relay server.
 */

export type RelayPeerRole = 'browser' | 'agent'

// ── Session ───────────────────────────────────────────────────────────────────

export interface RelaySessionRecord {
  sessionId: string
  browserToken: string   // Random token — only the browser tab knows this
  browserProof: string   // Used to HMAC-sign commands — proves origin
  createdAt: number      // Unix timestamp ms
}

export interface PublicRelaySessionResponse {
  sessionId: string
  wsUrl: string          // wss://…/relay/{id}/ws?token=…  (for browser)
  mcpUrl: string         // https://…/relay/{id}/mcp       (for agent)
  browserProof: string   // Returned to browser only — never shown to agent
  browserToken: string   // Token embedded in wsUrl — returned for convenience
}

// ── WebSocket envelope types ──────────────────────────────────────────────────

export interface RelayHelloMessage {
  type: 'hello'
  role: RelayPeerRole
  sessionId: string
}

export interface RelayPeerStatusMessage {
  type: 'peer_status'
  role: RelayPeerRole
  connected: boolean
}

export interface RelayCommandMessage {
  type: 'command'
  id: string
  command: string
  args?: Record<string, unknown>
  sig?: string  // HMAC-SHA256(browserProof, id) — browser verifies before executing
}

export interface RelayCommandResultMessage {
  type: 'command_result'
  id: string
  result?: unknown
  error?: { message: string; code?: string }
}

export interface RelayErrorMessage {
  type: 'error'
  message: string
}

export type RelayEnvelope =
  | RelayHelloMessage
  | RelayPeerStatusMessage
  | RelayCommandMessage
  | RelayCommandResultMessage
  | RelayErrorMessage

export function isRelayEnvelope(value: unknown): value is RelayEnvelope {
  return typeof value === 'object' && value !== null && 'type' in value
}
