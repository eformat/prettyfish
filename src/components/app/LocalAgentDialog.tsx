import { useEffect, useRef, useState } from 'react'
import { Check, Copy, PlugsConnected, Sparkle, X, CaretDown } from '@phosphor-icons/react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { LocalAgentBridgeControls } from '@/hooks/useLocalAgentBridge'
import type { RemoteAgentRelayControls } from '@/hooks/useRemoteAgentRelay'
import { cn } from '@/lib/utils'

interface LocalAgentPanelProps {
  open: boolean
  onClose: () => void
  bridge: LocalAgentBridgeControls
  remoteRelay: RemoteAgentRelayControls
}

// ── Copy button ────────────────────────────────────────────────────────────────

function CopyButton({ value, label, size = 'sm' }: { value: string; label: string; size?: 'sm' | 'xs' }) {
  const [copied, setCopied] = useState(false)

  return (
    <Button
      type="button"
      variant="outline"
      size={size === 'xs' ? 'sm' : 'sm'}
      className={size === 'xs' ? 'h-7 px-2 text-xs' : undefined}
      onClick={async () => {
        if (!value) return
        await navigator.clipboard.writeText(value)
        setCopied(true)
        window.setTimeout(() => setCopied(false), 1500)
      }}
      disabled={!value}
    >
      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      {copied ? 'Copied!' : label}
    </Button>
  )
}

// ── Code block ─────────────────────────────────────────────────────────────────

function CodeBlock({ code }: { code: string }) {
  return (
    <pre className="overflow-x-auto rounded-lg bg-black px-3 py-2.5 text-[11px] leading-relaxed text-zinc-100 dark:bg-black dark:text-zinc-100">
      {code}
    </pre>
  )
}

// ── Status dot ─────────────────────────────────────────────────────────────────

function StatusDot({ status }: { status: 'disconnected' | 'connecting' | 'connected' | 'error' }) {
  return (
    <span className={cn(
      'inline-block h-2 w-2 rounded-full shrink-0',
      status === 'connected' && 'bg-green-500',
      status === 'connecting' && 'bg-amber-400 animate-pulse',
      status === 'error' && 'bg-red-500',
      status === 'disconnected' && 'bg-zinc-400 dark:bg-zinc-600',
    )} />
  )
}

// ── Main panel ─────────────────────────────────────────────────────────────────

export function LocalAgentDialog({ open, onClose, bridge, remoteRelay }: LocalAgentPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const [advancedOpen, setAdvancedOpen] = useState(false)

  const hasSession = Boolean(remoteRelay.sessionId && remoteRelay.agentToken)
  const isConnected = remoteRelay.status === 'connected'
  const isBusy = remoteRelay.status === 'connecting'
  const localConnected = bridge.status === 'connected'
  const localBusy = bridge.status === 'connecting'

  // Auto-create a hosted session when the panel opens for the first time
  useEffect(() => {
    if (!open) return
    if (hasSession || isBusy || isConnected) return
    void remoteRelay.createHostedSession()
  }, [hasSession, isBusy, isConnected, open, remoteRelay])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  const configSnippet = remoteRelay.getHostedConfigSnippet()

  return (
    <>
      {/* Backdrop — click to close */}
      <div
        className="absolute inset-0 z-40"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        ref={panelRef}
        data-testid="local-agent-dialog"
        role="dialog"
        aria-label="Connect MCP"
        className={cn(
          'absolute top-14 right-4 z-50 w-[360px] rounded-2xl border text-sm',
          'bg-popover text-popover-foreground',
          'ring-1 ring-foreground/8',
          'shadow-xl shadow-black/10 dark:shadow-black/40',
          '[box-shadow:0_8px_32px_rgba(0,0,0,0.12)]',
          'dark:[box-shadow:0_8px_32px_rgba(0,0,0,0.45)]',
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <Sparkle className="h-4 w-4 text-primary" />
            <span className="font-semibold">Connect MCP</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-3 p-4">

          {/* ── Step 1: Session status ── */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <StatusDot status={remoteRelay.status} />
                <span className="font-medium">
                  {isConnected ? 'Session ready' : isBusy ? 'Creating session…' : hasSession ? 'Session paused' : 'No session'}
                </span>
                {remoteRelay.displayId && (
                  <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                    {remoteRelay.displayId}
                  </span>
                )}
              </div>
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2.5 text-xs"
                onClick={() => void remoteRelay.createHostedSession()}
                disabled={isBusy}
              >
                <PlugsConnected className="h-3 w-3" />
                {hasSession ? 'New' : 'Generate'}
              </Button>
            </div>

            {remoteRelay.error && (
              <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-400">
                {remoteRelay.error}
              </div>
            )}
          </div>

          {/* Divider */}
          <div className="h-px bg-border" />

          {/* ── Step 2: MCP config snippet ── */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">MCP config</p>
              <CopyButton value={configSnippet} label="Copy" size="xs" />
            </div>
            <CodeBlock code={configSnippet} />
            <p className="text-xs text-muted-foreground">
              Paste this into your AI client (Claude Desktop, Cursor, etc.) to connect it to this browser tab.
            </p>
          </div>

          {/* Divider */}
          <div className="h-px bg-border" />

          {/* ── Advanced: local bridge ── */}
          <div>
            <button
              type="button"
              onClick={() => setAdvancedOpen(v => !v)}
              className="flex w-full items-center justify-between gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors py-0.5"
            >
              <span className="font-medium">Advanced: local bridge</span>
              <CaretDown className={cn('h-3.5 w-3.5 transition-transform', advancedOpen && 'rotate-180')} />
            </button>

            {advancedOpen && (
              <div className="mt-3 space-y-3">
                <p className="text-xs text-muted-foreground">
                  Use when your MCP client runs on the same machine and you want a direct localhost connection instead of the hosted relay.
                </p>

                <div className="space-y-1.5">
                  <label htmlFor="local-agent-bridge-url" className="text-xs font-medium">
                    Bridge URL
                  </label>
                  <Input
                    id="local-agent-bridge-url"
                    data-testid="local-agent-bridge-url"
                    value={bridge.bridgeUrl}
                    onChange={(e) => bridge.setBridgeUrl(e.target.value)}
                    placeholder="http://127.0.0.1:46321"
                    disabled={localBusy}
                    className="h-8 text-xs"
                  />
                </div>

                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <StatusDot status={bridge.status} />
                    <span className="text-xs text-muted-foreground">
                      {localConnected ? `Session: ${bridge.sessionId?.slice(0, 8) ?? '…'}` : bridge.status}
                    </span>
                  </div>
                  {localConnected ? (
                    <Button
                      data-testid="local-agent-disconnect-button"
                      variant="outline"
                      size="sm"
                      className="h-7 px-2.5 text-xs"
                      onClick={() => void bridge.disconnect()}
                      disabled={localBusy}
                    >
                      Disconnect
                    </Button>
                  ) : (
                    <Button
                      data-testid="local-agent-connect-button"
                      size="sm"
                      className="h-7 px-2.5 text-xs"
                      onClick={() => void bridge.connect()}
                      disabled={localBusy}
                    >
                      {localBusy ? 'Connecting…' : 'Connect'}
                    </Button>
                  )}
                </div>

                {bridge.error && (
                  <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-400">
                    {bridge.error}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
