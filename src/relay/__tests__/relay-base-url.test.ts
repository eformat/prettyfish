import { describe, expect, it } from 'vitest'
import { resolveRelayBaseUrlForHost } from '@/hooks/useRemoteAgentRelay'

describe('resolveRelayBaseUrlForHost', () => {
  it('falls back to origin even on localhost (env var must be used for local dev split-origin)', () => {
    expect(resolveRelayBaseUrlForHost('localhost', undefined, 'http://localhost:4175')).toBe('http://localhost:4175')
    expect(resolveRelayBaseUrlForHost('127.0.0.1', undefined, 'http://127.0.0.1:4175')).toBe('http://127.0.0.1:4175')
  })

  it('uses window origin on non-local hosts', () => {
    expect(resolveRelayBaseUrlForHost('pretty.fish', undefined, 'https://pretty.fish')).toBe('https://pretty.fish')
    expect(resolveRelayBaseUrlForHost('prettyfish.binalgo.workers.dev', undefined, 'https://prettyfish.binalgo.workers.dev')).toBe('https://prettyfish.binalgo.workers.dev')
  })

  it('prefers explicit env override', () => {
    expect(resolveRelayBaseUrlForHost('pretty.fish', 'https://relay.example.com/', 'https://pretty.fish')).toBe('https://relay.example.com')
  })
})
