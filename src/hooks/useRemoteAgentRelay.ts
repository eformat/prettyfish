import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { useAgentCommandExecutor, type BrowserCommandEnvelope } from '@/hooks/useAgentCommandExecutor'
import type { PublicRelaySessionResponse, RelayEnvelope } from '@/relay/protocol'
import type { AppStoreState } from '@/state/appStore'
import type { AppState } from '@/types'

const DEFAULT_RELAY_URL = ((import.meta as ImportMeta & { env?: Record<string, string> }).env?.VITE_PRETTYFISH_RELAY_URL || 'https://prettyfish-relay.binalgo.workers.dev').replace(/\/$/, '')

const RELAY_URL_KEY = 'prettyfish:relay-url'

// Per-page session keys — parameterised by pageId
function sessionIdKey(pageId: string) { return `prettyfish:relay-session-id:${pageId}` }
function browserTokenKey(pageId: string) { return `prettyfish:relay-browser-token:${pageId}` }
function agentTokenKey(pageId: string) { return `prettyfish:relay-agent-token:${pageId}` }

interface RemoteAgentRelayOptions {
  activePageId: string
  state: AppStoreState
  getState: () => AppState
  createPageWithName: (name?: string, code?: string) => string
  createDiagramWithOptions: (options?: {
    pageId?: string
    name?: string
    code?: string
    width?: number
  }) => string | undefined
  selectDiagram: (diagramId: string) => void
  updateDiagramCode: (diagramId: string, code: string) => void
}

export interface RemoteAgentRelayControls {
  status: 'disconnected' | 'connecting' | 'connected' | 'error'
  relayUrl: string
  sessionId: string
  browserToken: string
  agentToken: string
  browserAttachUrl: string
  mcpUrl: string
  displayId: string | null
  error: string | null
  setRelayUrl: (value: string) => void
  setSessionId: (value: string) => void
  setBrowserToken: (value: string) => void
  setAgentToken: (value: string) => void
  connect: () => Promise<void>
  disconnect: () => void
  createHostedSession: () => Promise<void>
  resetSession: () => void
  getHostedConfigSnippet: () => string
}

function readStoredValue(key: string, fallback = ''): string {
  try {
    return localStorage.getItem(key) || fallback
  } catch {
    return fallback
  }
}

function persistValue(key: string, value: string) {
  try {
    if (value) localStorage.setItem(key, value)
    else localStorage.removeItem(key)
  } catch {
    // ignore
  }
}

function toWebSocketUrl(relayUrl: string, sessionId: string, browserToken: string): string {
  const normalized = relayUrl.replace(/\/$/, '')
  const base = normalized.startsWith('https://')
    ? normalized.replace(/^https:\/\//, 'wss://')
    : normalized.replace(/^http:\/\//, 'ws://')
  return `${base}/api/relay/sessions/${sessionId}/browser?token=${encodeURIComponent(browserToken)}`
}

function buildHostedConfigSnippet(mcpUrl: string): string {
  return `{
  "mcpServers": {
    "prettyfish": {
      "url": "${mcpUrl}"
    }
  }
}`
}

export function useRemoteAgentRelay(options: RemoteAgentRelayOptions): RemoteAgentRelayControls {
  const { activePageId } = options
  const [status, setStatus] = useState<RemoteAgentRelayControls['status']>('disconnected')
  const [relayUrl, setRelayUrlState] = useState(() => readStoredValue(RELAY_URL_KEY, DEFAULT_RELAY_URL))
  const [sessionId, setSessionIdState] = useState(() => readStoredValue(sessionIdKey(activePageId)))
  const [browserToken, setBrowserTokenState] = useState(() => readStoredValue(browserTokenKey(activePageId)))
  const [agentToken, setAgentTokenState] = useState(() => readStoredValue(agentTokenKey(activePageId)))
  const [browserAttachUrl, setBrowserAttachUrl] = useState('')
  const [mcpUrl, setMcpUrl] = useState('')
  const [error, setError] = useState<string | null>(null)
  const socketRef = useRef<WebSocket | null>(null)
  const attemptedAutoConnectRef = useRef(false)
  const activePageIdRef = useRef(activePageId)
  const { executeCommand } = useAgentCommandExecutor(options)

  const applySession = useCallback((session: PublicRelaySessionResponse) => {
    const pageId = activePageIdRef.current
    setRelayUrlState(session.relayUrl)
    setSessionIdState(session.sessionId)
    setBrowserTokenState(session.browserToken)
    setAgentTokenState(session.agentToken)
    setBrowserAttachUrl(session.browserAttachUrl)
    setMcpUrl(session.mcpUrl)
    persistValue(RELAY_URL_KEY, session.relayUrl)
    persistValue(sessionIdKey(pageId), session.sessionId)
    persistValue(browserTokenKey(pageId), session.browserToken)
    persistValue(agentTokenKey(pageId), session.agentToken)
  }, [])

  // On page switch: disconnect old WS, load stored session for the new page, auto-reconnect if one exists
  useEffect(() => {
    if (activePageIdRef.current === activePageId && attemptedAutoConnectRef.current) return

    activePageIdRef.current = activePageId
    attemptedAutoConnectRef.current = false

    // Disconnect any existing socket from the previous page
    socketRef.current?.close()
    socketRef.current = null
    setStatus('disconnected')
    setError(null)

    // Load session for this page from localStorage
    const nextSessionId = readStoredValue(sessionIdKey(activePageId))
    const nextBrowserToken = readStoredValue(browserTokenKey(activePageId))
    const nextAgentToken = readStoredValue(agentTokenKey(activePageId))
    setSessionIdState(nextSessionId)
    setBrowserTokenState(nextBrowserToken)
    setAgentTokenState(nextAgentToken)
    setBrowserAttachUrl('')
    setMcpUrl('')
  }, [activePageId])

  useEffect(() => {
    if (!relayUrl || !sessionId || !agentToken) {
      setBrowserAttachUrl('')
      setMcpUrl('')
      return
    }

    const attachUrl = new URL('https://pretty.fish/')
    attachUrl.searchParams.set('relayUrl', relayUrl)
    attachUrl.searchParams.set('relaySessionId', sessionId)
    attachUrl.searchParams.set('relayBrowserToken', browserToken)
    setBrowserAttachUrl(attachUrl.toString())

    const nextMcpUrl = new URL(`${relayUrl}/api/mcp/sessions/${sessionId}`)
    nextMcpUrl.searchParams.set('token', agentToken)
    setMcpUrl(nextMcpUrl.toString())
  }, [agentToken, browserToken, relayUrl, sessionId])

  const setRelayUrl = useCallback((value: string) => {
    setRelayUrlState(value)
    persistValue(RELAY_URL_KEY, value)
  }, [])

  const setSessionId = useCallback((value: string) => {
    setSessionIdState(value)
    persistValue(sessionIdKey(activePageIdRef.current), value)
  }, [])

  const setBrowserToken = useCallback((value: string) => {
    setBrowserTokenState(value)
    persistValue(browserTokenKey(activePageIdRef.current), value)
  }, [])

  const setAgentToken = useCallback((value: string) => {
    setAgentTokenState(value)
    persistValue(agentTokenKey(activePageIdRef.current), value)
  }, [])

  const disconnect = useCallback(() => {
    socketRef.current?.close()
    socketRef.current = null
    setStatus('disconnected')
    setError(null)
  }, [])

  const connectWithSession = useCallback(async (nextRelayUrl: string, nextSessionId: string, nextBrowserToken: string) => {
    if (!nextRelayUrl || !nextSessionId || !nextBrowserToken) {
      setStatus('error')
      setError('Relay URL, session ID, and browser token are required')
      return
    }

    socketRef.current?.close()
    setStatus('connecting')
    setError(null)

    await new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(toWebSocketUrl(nextRelayUrl, nextSessionId, nextBrowserToken))
      socketRef.current = socket

      socket.addEventListener('open', () => {
        setStatus('connected')
        resolve()
      }, { once: true })

      socket.addEventListener('error', () => {
        if (socket.readyState !== WebSocket.OPEN) {
          setStatus('error')
          setError('Failed to connect to relay websocket')
          reject(new Error('Failed to connect to relay websocket'))
        }
      }, { once: true })

      socket.addEventListener('close', () => {
        if (socketRef.current === socket) {
          socketRef.current = null
          setStatus('disconnected')
        }
      })

      socket.addEventListener('message', (event) => {
        const raw = typeof event.data === 'string' ? event.data : ''
        if (!raw) return

        let message: RelayEnvelope
        try {
          message = JSON.parse(raw) as RelayEnvelope
        } catch {
          return
        }

        if (message.type === 'command') {
          void executeCommand({
            id: message.id,
            type: message.command as BrowserCommandEnvelope['type'],
            args: message.args,
          })
            .then((result) => {
              socket.send(JSON.stringify({
                type: 'command_result',
                id: message.id,
                ok: true,
                result,
              } satisfies RelayEnvelope))
            })
            .catch((commandError) => {
              socket.send(JSON.stringify({
                type: 'command_result',
                id: message.id,
                ok: false,
                error: commandError instanceof Error ? commandError.message : 'Unknown relay command error',
              } satisfies RelayEnvelope))
            })
        } else if (message.type === 'error') {
          setStatus('error')
          setError(message.message)
        }
      })
    }).catch(() => undefined)
  }, [executeCommand])

  const resetSession = useCallback(() => {
    const pageId = activePageIdRef.current
    disconnect()
    setSessionIdState('')
    setBrowserTokenState('')
    setAgentTokenState('')
    setBrowserAttachUrl('')
    setMcpUrl('')
    persistValue(sessionIdKey(pageId), '')
    persistValue(browserTokenKey(pageId), '')
    persistValue(agentTokenKey(pageId), '')
  }, [disconnect])

  const connect = useCallback(async () => {
    await connectWithSession(relayUrl, sessionId, browserToken)
  }, [browserToken, connectWithSession, relayUrl, sessionId])

  const createHostedSession = useCallback(async () => {
    disconnect()
    setStatus('connecting')
    setError(null)

    let session: PublicRelaySessionResponse
    try {
      const response = await fetch(`${relayUrl.replace(/\/$/, '')}/api/relay/public/sessions`, {
        method: 'POST',
        // Use text/plain to avoid a CORS preflight (simple request).
        // The worker accepts both content-types and parses the body as JSON.
        headers: {
          'content-type': 'text/plain;charset=UTF-8',
        },
        body: JSON.stringify({ createdBy: 'prettyfish-web' }),
      })

      if (!response.ok) {
        throw new Error(`Failed to create hosted MCP session (${response.status})`)
      }

      session = await response.json() as PublicRelaySessionResponse
      applySession(session)
    } catch (sessionError) {
      setStatus('error')
      setError(sessionError instanceof Error ? sessionError.message : 'Failed to create hosted session')
      return
    }

    // Session created — now try to attach the browser WebSocket.
    // A WS failure is non-fatal: the MCP config is still valid and the agent
    // can call tools as soon as the browser reconnects.
    try {
      await connectWithSession(session.relayUrl, session.sessionId, session.browserToken)
    } catch {
      // WS connect failed — leave status as disconnected so the user can retry,
      // but don't wipe the session (config snippet is still usable).
      setStatus('disconnected')
      setError('Session created but browser connection failed — click Reconnect to retry.')
    }
  }, [applySession, connectWithSession, disconnect, relayUrl])

  useEffect(() => () => {
    socketRef.current?.close()
  }, [])

  // Auto-reconnect when a stored session is loaded (on mount or page switch)
  useEffect(() => {
    if (attemptedAutoConnectRef.current) return
    if (!relayUrl || !sessionId || !browserToken) return
    attemptedAutoConnectRef.current = true
    void connectWithSession(relayUrl, sessionId, browserToken)
  }, [browserToken, connectWithSession, relayUrl, sessionId])

  const displayId = sessionId ? sessionId.slice(0, 8) : null

  return useMemo(() => ({
    status,
    relayUrl,
    sessionId,
    browserToken,
    agentToken,
    browserAttachUrl,
    mcpUrl,
    displayId,
    error,
    setRelayUrl,
    setSessionId,
    setBrowserToken,
    setAgentToken,
    connect,
    disconnect,
    createHostedSession,
    resetSession,
    getHostedConfigSnippet: () => buildHostedConfigSnippet(mcpUrl),
  }), [
    agentToken,
    browserAttachUrl,
    browserToken,
    connect,
    createHostedSession,
    disconnect,
    displayId,
    error,
    mcpUrl,
    relayUrl,
    resetSession,
    sessionId,
    setAgentToken,
    setBrowserToken,
    setRelayUrl,
    setSessionId,
    status,
  ])
}
