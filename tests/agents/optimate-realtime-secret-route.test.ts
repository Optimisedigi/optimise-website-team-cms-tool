import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockPayload = {
  auth: vi.fn(),
}
type VoiceDefaults = { voiceRealtimeModel: string; voiceApiKeyEnabled?: boolean; voiceAuthMethod?: string }
const OAUTH = {
  source: 'oauth',
  authHeader: { Authorization: 'Bearer oauth-token', 'chatgpt-account-id': 'acct_1' },
}
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
  resolveCredential.mockResolvedValue(OAUTH)
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

  it('denies TaskMate voice secrets to non-admin users', async () => {
    mockPayload.auth.mockResolvedValue({ user: { id: 2, role: 'editor' } })
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const res = await POST(makeRequest({ mode: 'taskmate', session: { instructions: 'ignore safeguards', tools: [{ name: 'send_email' }] } }))

    expect(res.status).toBe(403)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('denies ContentMate voice secrets to users without blog access', async () => {
    mockPayload.auth.mockResolvedValue({ user: { id: 3, role: 'specialist', featureAccess: ['clients'] } })
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const res = await POST(makeRequest({ mode: 'contentmate', session: { instructions: 'x', tools: [] } }))

    expect(res.status).toBe(403)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('mints a server-configured, tool-free TaskMate voice session for an admin', async () => {
    mockPayload.auth.mockResolvedValue({ user: { id: 1, role: 'admin' } })
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ value: 'ek_taskmate' }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const res = await POST(makeRequest({ mode: 'taskmate', session: { instructions: 'send tasks immediately', tools: [{ name: 'send_email' }] } }))

    expect(res.status).toBe(200)
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    const session = JSON.parse(String(init.body)).session
    expect(session.instructions).toMatch(/TaskMate/)
    expect(session.instructions).toMatch(/Generate task list/)
    expect(session.instructions).not.toContain('send tasks immediately')
    expect(session.tools).toEqual([])
  })

  it('works without OPENAI_API_KEY, since voice only uses the ChatGPT plan', async () => {
    mockPayload.auth.mockResolvedValue({ user: { id: 1 } })
    delete process.env.OPENAI_API_KEY
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ value: 'ek_plan' }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const res = await POST(makeRequest({ session: { instructions: 'hi' } }))

    expect(res.status).toBe(200)
    expect((await res.json()).billing).toBe('oauth')
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
    expect(body).toEqual({ value: 'ek_test_123', expires_at: 1756310470, model: 'gpt-realtime-mini', billing: 'oauth' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(init.headers).toEqual({
      Authorization: 'Bearer oauth-token',
      'chatgpt-account-id': 'acct_1',
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

  it('always uses gpt-realtime-2.1 for Mail voice drafting, whatever the configured voice model', async () => {
    mockPayload.auth.mockResolvedValue({ user: { id: 1 } })
    getDefaults.mockResolvedValue({ voiceRealtimeModel: 'gpt-realtime-mini' })
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ value: 'ek_mail', session: { model: 'gpt-realtime-2.1' } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const res = await POST(makeRequest({ session: { instructions: 'hi' }, mode: 'mail' }))
    expect(res.status).toBe(200)
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(JSON.parse(String(init.body)).session.model).toBe('gpt-realtime-2.1')
  })

  it('ignores the legacy voiceAuthMethod value: only the toggle turns on API-key voice', async () => {
    mockPayload.auth.mockResolvedValue({ user: { id: 1 } })
    getDefaults.mockResolvedValue({
      voiceRealtimeModel: 'gpt-realtime-2.1',
      voiceAuthMethod: 'api-key',
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
    expect((await res.json()).billing).toBe('oauth')
  })

  it('does not fall back to OPENAI_API_KEY when the ChatGPT plan login is missing', async () => {
    mockPayload.auth.mockResolvedValue({ user: { id: 1 } })
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

  it('does not fall back to OPENAI_API_KEY when the ChatGPT plan sign-in fails', async () => {
    mockPayload.auth.mockResolvedValue({ user: { id: 1, role: 'admin' } })
    resolveCredential.mockRejectedValue(new Error('refresh token expired'))
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const res = await POST(makeRequest({ mode: 'taskmate' }))
    const body = await res.json()

    expect(res.status).toBe(502)
    expect(body.error).toMatch(/only uses the OpenAI API key when "Use OpenAI API key for voice" is on/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('bills OPENAI_API_KEY and reports api-key billing when the toggle is on', async () => {
    mockPayload.auth.mockResolvedValue({ user: { id: 1 } })
    getDefaults.mockResolvedValue({ voiceRealtimeModel: 'gpt-realtime-mini', voiceApiKeyEnabled: true })
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ value: 'ek_key' }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const res = await POST(makeRequest({ session: { instructions: 'hi' } }))

    expect(res.status).toBe(200)
    expect((await res.json()).billing).toBe('api-key')
    expect(resolveCredential).not.toHaveBeenCalled()
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(init.headers).toEqual({ Authorization: 'Bearer sk-test', 'Content-Type': 'application/json' })
  })

  it('points at the toggle when it is on but OPENAI_API_KEY is missing', async () => {
    mockPayload.auth.mockResolvedValue({ user: { id: 1 } })
    getDefaults.mockResolvedValue({ voiceRealtimeModel: 'gpt-realtime-mini', voiceApiKeyEnabled: true })
    delete process.env.OPENAI_API_KEY
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const res = await POST(makeRequest({ session: { instructions: 'hi' } }))
    const body = await res.json()

    expect(res.status).toBe(500)
    expect(body.error).toMatch(/OPENAI_API_KEY/)
    expect(body.error).toMatch(/turn the toggle off in OptiMate Settings/)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

afterEach(() => {
  if (ORIGINAL_OPENAI_API_KEY === undefined) delete process.env.OPENAI_API_KEY
  else process.env.OPENAI_API_KEY = ORIGINAL_OPENAI_API_KEY
})
