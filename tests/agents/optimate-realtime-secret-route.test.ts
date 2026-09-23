import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockPayload = {
  auth: vi.fn(),
}
type VoiceDefaults = { voiceRealtimeModel: string; voiceAuthMethod?: string }
const getDefaults = vi.fn(
  async (_payload?: unknown): Promise<VoiceDefaults> => ({ voiceRealtimeModel: 'gpt-realtime-mini' }),
)

vi.mock('payload', () => ({
  getPayload: vi.fn(() => Promise.resolve(mockPayload)),
}))
vi.mock('@/payload.config', () => ({ default: Promise.resolve({}) }))
vi.mock('next/headers', () => ({
  headers: vi.fn(async () => new Headers()),
}))
vi.mock('@/lib/agents/_shared/optimate-default-models', () => ({
  getOptiMateDefaultModels: (payload?: unknown) => getDefaults(payload),
}))
const resolveCredential = vi.fn()
vi.mock('@/lib/agents/_shared/llm/auth/resolver', () => ({
  resolveCredential: (provider: string) => resolveCredential(provider),
}))

import { POST } from '@/app/(frontend)/api/optimate/realtime-secret/route'

const ORIGINAL_OPENAI_API_KEY = process.env.OPENAI_API_KEY

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/optimate/realtime-secret', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  mockPayload.auth.mockReset()
  getDefaults.mockReset()
  getDefaults.mockResolvedValue({ voiceRealtimeModel: 'gpt-realtime-mini' })
  resolveCredential.mockReset()
  process.env.OPENAI_API_KEY = 'sk-test'
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('POST /api/optimate/realtime-secret', () => {
  it('rejects unauthenticated requests', async () => {
    mockPayload.auth.mockResolvedValue({ user: null })

    const res = await POST(makeRequest({ session: { instructions: 'hi' } }))

    expect(res.status).toBe(401)
  })

  it('requires OPENAI_API_KEY', async () => {
    mockPayload.auth.mockResolvedValue({ user: { id: 1 } })
    delete process.env.OPENAI_API_KEY

    const res = await POST(makeRequest({ session: { instructions: 'hi' } }))
    const body = await res.json()

    expect(res.status).toBe(500)
    expect(body.error).toMatch(/OPENAI_API_KEY/)
  })

  it('mints a Realtime client secret using the configured mini voice model', async () => {
    mockPayload.auth.mockResolvedValue({ user: { id: 1 } })
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          value: 'ek_test_123',
          expires_at: 1756310470,
          session: { model: 'gpt-realtime-mini' },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    const res = await POST(
      makeRequest({
        session: {
          instructions: 'Use OptiMate voice rules.',
          tools: [{ type: 'function', name: 'get_campaign_performance' }],
          turnDetection: { type: 'server_vad', create_response: true },
        },
      }),
    )
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({ value: 'ek_test_123', expires_at: 1756310470, model: 'gpt-realtime-mini' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(init.headers).toEqual({
      Authorization: 'Bearer sk-test',
      'Content-Type': 'application/json',
    })
    const payload = JSON.parse(String(init.body))
    expect(payload.session.model).toBe('gpt-realtime-mini')
    expect(payload.session.reasoning).toBeUndefined()
    expect(payload.session.tools).toEqual([{ type: 'function', name: 'get_campaign_performance' }])
  })

  it('adds reasoning only for gpt-realtime-2', async () => {
    mockPayload.auth.mockResolvedValue({ user: { id: 1 } })
    getDefaults.mockResolvedValue({ voiceRealtimeModel: 'gpt-realtime-2' })
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          value: 'ek_test_456',
          session: { model: 'gpt-realtime-2' },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    await POST(makeRequest({ session: { instructions: 'hi' } }))

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    const payload = JSON.parse(String(init.body))
    expect(payload.session.model).toBe('gpt-realtime-2')
    expect(payload.session.reasoning).toEqual({ effort: 'minimal' })
  })

  it('mints gpt-realtime-2.1 as a realtime session with minimal reasoning', async () => {
    mockPayload.auth.mockResolvedValue({ user: { id: 1 } })
    getDefaults.mockResolvedValue({ voiceRealtimeModel: 'gpt-realtime-2.1' })
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({ value: 'ek_test_21', session: { model: 'gpt-realtime-2.1' } }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    const res = await POST(makeRequest({ session: { instructions: 'hi' } }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.model).toBe('gpt-realtime-2.1')
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    const payload = JSON.parse(String(init.body))
    expect(payload.session.type).toBe('realtime')
    expect(payload.session.model).toBe('gpt-realtime-2.1')
    expect(payload.session.reasoning).toEqual({ effort: 'minimal' })
  })

  it('uses the ChatGPT plan login instead of OPENAI_API_KEY when voice billing is codex-oauth', async () => {
    mockPayload.auth.mockResolvedValue({ user: { id: 1 } })
    getDefaults.mockResolvedValue({
      voiceRealtimeModel: 'gpt-realtime-2.1',
      voiceAuthMethod: 'codex-oauth',
    })
    resolveCredential.mockResolvedValue({
      source: 'oauth',
      authHeader: { Authorization: 'Bearer oauth-token', 'chatgpt-account-id': 'acct_1' },
    })
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({ value: 'ek_plan', session: { model: 'gpt-realtime-2.1' } }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    const res = await POST(makeRequest({ session: { instructions: 'hi' } }))

    expect(res.status).toBe(200)
    expect(resolveCredential).toHaveBeenCalledWith('openai-codex')
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    const headers = init.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer oauth-token')
    expect(headers['chatgpt-account-id']).toBe('acct_1')
    expect(headers.Authorization).not.toContain('sk-test')
  })

  it('does not fall back to OPENAI_API_KEY when the ChatGPT plan login is missing', async () => {
    mockPayload.auth.mockResolvedValue({ user: { id: 1 } })
    getDefaults.mockResolvedValue({
      voiceRealtimeModel: 'gpt-realtime-2.1',
      voiceAuthMethod: 'codex-oauth',
    })
    resolveCredential.mockResolvedValue({
      source: 'api-key',
      authHeader: { Authorization: 'Bearer sk-test' },
    })
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const res = await POST(makeRequest({ session: { instructions: 'hi' } }))
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toMatch(/ChatGPT/)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

afterEach(() => {
  if (ORIGINAL_OPENAI_API_KEY === undefined) delete process.env.OPENAI_API_KEY
  else process.env.OPENAI_API_KEY = ORIGINAL_OPENAI_API_KEY
})
