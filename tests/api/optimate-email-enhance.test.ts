import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('next/headers', () => ({
  headers: vi.fn(() => Promise.resolve(new Headers())),
}))

const mockPayload = {
  auth: vi.fn(),
}

vi.mock('payload', () => ({
  getPayload: vi.fn(() => Promise.resolve(mockPayload)),
}))

vi.mock('@/payload.config', () => ({
  default: Promise.resolve({}),
}))

vi.mock('@/lib/agents/_shared/llm', () => ({
  callLLM: vi.fn(),
}))

vi.mock('@/lib/agents/_shared/optimate-default-models', () => ({
  getOptiMateDefaultModels: vi.fn(),
}))

vi.mock('@/lib/agents/optimate-google-ads/memory-loader', () => ({
  loadPinnedMemoryBlock: vi.fn(),
}))

import { callLLM } from '@/lib/agents/_shared/llm'
import { getOptiMateDefaultModels } from '@/lib/agents/_shared/optimate-default-models'
import { loadPinnedMemoryBlock } from '@/lib/agents/optimate-google-ads/memory-loader'
import { POST } from '@/app/(frontend)/api/optimate/email/enhance/route'

const mockCallLLM = vi.mocked(callLLM)
const mockGetDefaults = vi.mocked(getOptiMateDefaultModels)
const mockLoadSoul = vi.mocked(loadPinnedMemoryBlock)

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost:3001/api/optimate/email/enhance', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function llmReply(text: string, model = 'kimi-k2.6') {
  return {
    model,
    providerModel: model,
    source: 'api-key' as const,
    stopReason: 'end_turn' as const,
    usage: { inputTokens: 10, outputTokens: 10 },
    message: { role: 'assistant' as const, content: [{ type: 'text' as const, text }] },
  }
}

describe('POST /api/optimate/email/enhance', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPayload.auth.mockResolvedValue({ user: { id: 1 } })
    mockGetDefaults.mockResolvedValue({
      defaultChatModel: 'kimi-k2.6',
      defaultAutonomousModel: 'kimi-k2.6',
      emailAssistantModel: 'kimi-k2.6',
      voiceRealtimeModel: 'gpt-realtime-mini',
      blogImageGenerationModel: 'imagen-4.0-fast-generate-001',
      chatHistoryTokenLimit: 6000,
      googleMateStarterQuestions: [],
      googleMatePortfolioStarterQuestions: [],
      invoiceMateStarterQuestions: [],
    })
    mockCallLLM.mockResolvedValue(llmReply('Draft a concise email thanking Sarah for the report.'))
    mockLoadSoul.mockResolvedValue({ text: '' })
  })

  it('rejects unauthenticated requests before calling the model', async () => {
    mockPayload.auth.mockResolvedValue({ user: null })

    const response = await POST(makeRequest({ prompt: 'thank Sarah', mode: 'draft' }))

    expect(response.status).toBe(401)
    expect(mockCallLLM).not.toHaveBeenCalled()
  })

  it.each([
    [{ mode: 'draft' }, 'prompt is required'],
    [{ prompt: 'hello', mode: 'summarise' }, 'mode must be draft or reply'],
    [{ prompt: 'hello', mode: 'draft', model: 'not-a-model' }, 'Unknown model'],
  ])('rejects invalid input %#', async (body, expectedError) => {
    const response = await POST(makeRequest(body))

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({ error: expectedError })
    expect(mockCallLLM).not.toHaveBeenCalled()
  })

  it('rejects oversized prompts', async () => {
    const response = await POST(makeRequest({ prompt: 'a'.repeat(8_001), mode: 'reply' }))

    expect(response.status).toBe(400)
    expect(mockCallLLM).not.toHaveBeenCalled()
  })

  it('rewrites with the selected CMS model and no tools', async () => {
    const response = await POST(makeRequest({
      prompt: 'thank sarah for the report',
      mode: 'draft',
      model: 'kimi-k2.6',
    }))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      enhancedPrompt: 'Draft a concise email thanking Sarah for the report.',
      modelUsed: 'kimi-k2.6',
    })
    expect(mockCallLLM).toHaveBeenCalledWith(expect.objectContaining({
      model: 'kimi-k2.6',
      reasoningMode: 'off',
      messages: [{ role: 'user', content: [{ type: 'text', text: 'thank sarah for the report' }] }],
    }))
    expect(mockCallLLM.mock.calls[0]?.[0]).not.toHaveProperty('tools')
  })

  it('uses the configured email model when the browser does not supply one', async () => {
    await POST(makeRequest({ prompt: 'thank sarah', mode: 'reply' }))

    expect(mockGetDefaults).toHaveBeenCalledWith(mockPayload)
    expect(mockCallLLM).toHaveBeenCalledWith(expect.objectContaining({ model: 'kimi-k2.6' }))
  })

  it('applies the same soul rules GmailMate writes the draft with', async () => {
    mockLoadSoul.mockResolvedValue({
      text: '## Working with this team\n\n- **tone**: Never use em dashes.',
    })

    await POST(makeRequest({ prompt: 'thank sarah', mode: 'draft' }))

    expect(mockLoadSoul).toHaveBeenCalledWith([], {
      includePinnedFacts: false,
      soulAgentKeys: ['email'],
    })
    const system = mockCallLLM.mock.calls[0]?.[0]?.system as string
    expect(system).toContain('Never use em dashes.')
    // The rules shape the wording; they must not be pasted into the user's box.
    expect(system).toMatch(/Do NOT restate them/)
    expect(system).toContain('never authorise adding facts the user did not supply')
  })

  it('forbids bolting on email craft the user never asked for', async () => {
    await POST(makeRequest({ prompt: 'thank sarah', mode: 'draft' }))

    const system = mockCallLLM.mock.calls[0]?.[0]?.system as string
    expect(system).toMatch(/Do not bolt on email-craft instructions/)
    expect(system).toMatch(/subject line, greeting, sign-off/)
    expect(system).toMatch(/Keep the result close to the length of the user's request/)
  })

  it('still enhances when the soul lookup fails', async () => {
    mockLoadSoul.mockRejectedValue(new Error('db down'))

    const response = await POST(makeRequest({ prompt: 'thank sarah', mode: 'draft' }))

    expect(response.status).toBe(200)
    expect(mockCallLLM).toHaveBeenCalledTimes(1)
  })

  it('keeps the original in the browser when the model returns no text', async () => {
    mockCallLLM.mockResolvedValue(llmReply('   '))

    const response = await POST(makeRequest({ prompt: 'thank sarah', mode: 'draft' }))

    expect(response.status).toBe(502)
    await expect(response.json()).resolves.toMatchObject({ error: expect.stringContaining('original text was kept') })
  })
})
