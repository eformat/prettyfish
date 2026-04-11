# Remote Agent Relay

Phase two moves command transport out of localhost and into a Cloudflare Worker relay, with a hosted MCP endpoint and a browser-generated session flow.

## Goals

- Keep the browser tab as the only executor of Pretty Fish mutations
- Let a remote MCP server communicate with the browser over a relay
- Move session creation and peer coordination into Cloudflare

## Files

- Worker entry: [src/relay/worker.ts](../src/relay/worker.ts)
- Shared protocol: [src/relay/protocol.ts](../src/relay/protocol.ts)
- Worker config: [wrangler.relay.jsonc](../wrangler.relay.jsonc)

## Session Model

1. Pretty Fish can create a browser-scoped session by calling `POST /api/relay/public/sessions`.
2. Operators can still create sessions directly with `POST /api/relay/sessions` plus `RELAY_BOOTSTRAP_TOKEN`.
3. The Worker creates a session in the Durable Object and returns:
   - `sessionId`
   - `browserToken`
   - `agentToken`
   - `mcpUrl`
   - `browserAttachUrl`
4. The browser connects by WebSocket to:
   - `/api/relay/sessions/:sessionId/browser?token=...`
5. MCP clients can either:
   - talk directly to the hosted endpoint at `/api/mcp/sessions/:sessionId?token=...`
   - or use the stdio fallback wrapper with `npx`
6. The Durable Object forwards:
   - `command` messages from agent to browser
   - `command_result` messages from browser to agent

## Current Scope

Current scope:

- browser-generated hosted sessions
- hosted MCP HTTP endpoint
- `npx` stdio fallback wrapper
- tokenized browser/agent websocket connection routes
- per-session Durable Object coordination
- browser-side command execution through the live Pretty Fish tab

Still needed for a more hardened production rollout:

- stronger public session issuance policy
- expiry, revocation, and audit logging
- optional custom domain routing so the MCP endpoint sits directly under `pretty.fish`

## Remote MCP Process

Use the remote MCP wrapper when your MCP client only supports local stdio:

```bash
npx -y github:pastelsky/prettyfish \
  --relay-url="https://your-relay.example.workers.dev" \
  --session-id="your-session-id" \
  --agent-token="your-agent-token"
```

The app UI now generates the session and gives you both:

- a hosted MCP URL for direct remote MCP clients
- an `npx` fallback snippet for stdio-only clients

## Local Development

```bash
wrangler dev -c wrangler.relay.jsonc
```

Set a real bootstrap token before using the operator-only session creation route:

```bash
export RELAY_BOOTSTRAP_TOKEN="your-secret"
```
