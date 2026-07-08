import { beforeEach, describe, expect, it, vi } from 'vitest'

const callbacks: Array<() => Promise<void> | void> = []
const execute = vi.fn(async () => ({}))
const callLLM = vi.fn(async () => ({
  message: {
    role: 'assistant',
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          headlines: ['Engine Parts', 'Quality Engines'],
          descriptions: ['Find reliable engine parts today.'],
        }),
      },
    ],
  },
  stopReason: 'end_turn',
  usage: { inputTokens: 1, outputTokens: 1 },
  model: 'grok-build',
  providerModel: 'grok-build',
  source: 'oauth',
}))

vi.mock('next/server', async (importActual) => {
  const actual = await importActual<typeof import('next/server')>()
  return {
    ...actual,
    after: (cb: () => Promise<void> | void) => {
      callbacks.push(cb)
    },
  }
})

vi.mock('payload', () => ({
  getPayload: vi.fn(async () => ({
    auth: vi.fn(async () => ({ user: { id: 1 } })),
    findByID: vi.fn(async () => ({
      id: 7,
      businessName: 'EPG Engines',
      websiteUrl: 'https://example.com',
      campaignProposal: {
        discoveredPages: [],
        proposedCampaigns: [
          {
            name: 'Search',
            adGroups: [
              {
                name: 'Engine Parts',
                landingPage: { url: 'https://example.com/parts' },
                keywords: [{ text: 'engine parts' }],
              },
            ],
          },
        ],
      },
    })),
    findGlobal: vi.fn(async () => ({
      defaultAutonomousModel: 'gpt-5.4',
      blogPrompterModel: 'grok-build',
    })),
    db: { client: { execute } },
  })),
}))

vi.mock('@/payload.config', () => ({ default: Promise.resolve({}) }))
vi.mock('@/lib/agents/_shared/llm', () => ({ callLLM }))

describe('POST /api/google-ads-audits/[id]/generate-ad-copy', () => {
  beforeEach(() => {
    callbacks.length = 0
    execute.mockClear()
    callLLM.mockClear()
    vi.stubGlobal(
      'fetch',
      vi.fn(() => {
        throw new Error('route should use callLLM, not direct Kimi fetch')
      }),
    )
  })

  it('uses the OptiMate Blog AI model selection for generation', async () => {
    const { POST } =
      await import('@/app/(frontend)/api/google-ads-audits/[id]/generate-ad-copy/route')

    const response = await POST(new Request('https://cms.test/api') as never, {
      params: Promise.resolve({ id: '7' }),
    })
    expect(response.status).toBe(200)

    expect(callbacks).toHaveLength(1)
    await callbacks[0]()

    expect(callLLM).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'grok-build',
        system: expect.stringContaining('Google Ads RSA'),
      }),
    )
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({
        sql: expect.stringContaining('generated_ad_copy'),
        args: [expect.stringContaining('Engine Parts'), 'generated', expect.any(String), '7'],
      }),
    )
  })
})
