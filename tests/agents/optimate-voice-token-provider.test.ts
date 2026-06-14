/**
 * Realtime token-provider seam (plan §6.6: single-machine by design; multi-user
 * later = flip the provider, no voice/tool rewrite).
 *
 * These tests lock the contract that makes that claim true:
 *   - getTokenProvider() selects purely off NEXT_PUBLIC_OPTIMATE_VOICE_PROVIDER.
 *   - The default is the server API-key provider.
 *   - Every provider satisfies the same TokenProvider interface (getSecret +
 *     getStatus), so a swapped provider needs zero changes in the consumers
 *     (OptiMateVoice / OptiMateMultiChat).
 *   - isVoiceEnabled() is the feature flag (provider env var present).
 *   - apiKeyProvider calls the app server's Realtime secret route.
 *   - localBridgeProvider.getStatus() reports unreachable when the helper is
 *     down (fetch throws) — the UI's "launch the helper" hint depends on this.
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  apiKeyProvider,
  getTokenProvider,
  isVoiceEnabled,
  localBridgeProvider,
  type TokenProvider,
} from '@/lib/realtime/token-provider'

const ORIGINAL = process.env.NEXT_PUBLIC_OPTIMATE_VOICE_PROVIDER

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.NEXT_PUBLIC_OPTIMATE_VOICE_PROVIDER
  else process.env.NEXT_PUBLIC_OPTIMATE_VOICE_PROVIDER = ORIGINAL
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function assertTokenProviderShape(p: TokenProvider) {
  expect(typeof p.getSecret).toBe('function')
  expect(typeof p.getStatus).toBe('function')
}

describe('getTokenProvider', () => {
  it('defaults to the API-key provider when unset', () => {
    delete process.env.NEXT_PUBLIC_OPTIMATE_VOICE_PROVIDER
    const p = getTokenProvider()
    expect(p).toBe(apiKeyProvider)
    assertTokenProviderShape(p)
  })

  it('returns the API-key provider for provider=api-key', () => {
    process.env.NEXT_PUBLIC_OPTIMATE_VOICE_PROVIDER = 'api-key'
    expect(getTokenProvider()).toBe(apiKeyProvider)
  })

  it('returns the local bridge for provider=local', () => {
    process.env.NEXT_PUBLIC_OPTIMATE_VOICE_PROVIDER = 'local'
    expect(getTokenProvider()).toBe(localBridgeProvider)
  })

  it('throws a clear error for an unknown provider (the single flip-point)', () => {
    process.env.NEXT_PUBLIC_OPTIMATE_VOICE_PROVIDER = 'bogus'
    expect(() => getTokenProvider()).toThrow(/Unknown OptiMate voice provider "bogus"/)
  })
})

describe('isVoiceEnabled', () => {
  it('defaults to true so the local helper voice button stays visible', () => {
    process.env.NEXT_PUBLIC_OPTIMATE_VOICE_PROVIDER = 'local'
    expect(isVoiceEnabled()).toBe(true)
    delete process.env.NEXT_PUBLIC_OPTIMATE_VOICE_PROVIDER
    expect(isVoiceEnabled()).toBe(true)
  })
})

describe('apiKeyProvider', () => {
  it('reports ready because the app server owns OpenAI connectivity', async () => {
    await expect(apiKeyProvider.getStatus()).resolves.toEqual({ reachable: true, connected: true })
  })

  it('parses a minted secret from the app route', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            value: 'ek_test_api',
            expires_at: 1756310470,
            model: 'gpt-realtime-mini',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    const secret = await apiKeyProvider.getSecret({
      auditId: '7',
      session: { instructions: 'hi' },
    })

    expect(fetchMock).toHaveBeenCalledWith('/api/optimate/realtime-secret', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ auditId: '7', session: { instructions: 'hi' } }),
    })
    expect(secret).toEqual({ value: 'ek_test_api', expiresAt: 1756310470, model: 'gpt-realtime-mini' })
  })
})

describe('localBridgeProvider.getStatus', () => {
  it('reports unreachable when the helper is down (fetch rejects)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('ECONNREFUSED'))),
    )
    const status = await localBridgeProvider.getStatus()
    expect(status).toEqual({ reachable: false, connected: false })
  })

  it('reports reachable+connected when the helper says connected', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ connected: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        ),
      ),
    )
    const status = await localBridgeProvider.getStatus()
    expect(status).toEqual({ reachable: true, connected: true })
  })

  it('parses a minted secret from /realtime-secret', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              value: 'ek_test_123',
              expires_at: 1756310470,
              model: 'gpt-realtime-2',
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
        ),
      ),
    )
    const secret = await localBridgeProvider.getSecret({ auditId: '7', session: {} })
    expect(secret).toEqual({ value: 'ek_test_123', expiresAt: 1756310470, model: 'gpt-realtime-2' })
  })

  it('surfaces the helper error message on a non-OK secret response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ error: 'Sign in to OpenAI before starting Realtime.' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
          }),
        ),
      ),
    )
    await expect(localBridgeProvider.getSecret({ auditId: '7', session: {} })).rejects.toThrow(
      /Sign in to OpenAI before starting Realtime/,
    )
  })
})
