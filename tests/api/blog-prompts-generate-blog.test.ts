import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('next/headers', () => ({
  headers: vi.fn(() => Promise.resolve(new Headers())),
}))

const mockPayload = {
  auth: vi.fn(),
  findGlobal: vi.fn(),
  create: vi.fn(),
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

import { callLLM } from '@/lib/agents/_shared/llm'
import { getOptiMateDefaultModels } from '@/lib/agents/_shared/optimate-default-models'
import { POST } from '@/app/(frontend)/api/blog-prompts/generate-blog/route'

const mockCallLLM = vi.mocked(callLLM)
const mockGetOptiMateDefaultModels = vi.mocked(getOptiMateDefaultModels)

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost:3001/api/blog-prompts/generate-blog', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function llmReply(text: string, model = 'kimi-k2.6') {
  return {
    model,
    message: { content: [{ type: 'text', text }] },
    stopReason: 'stop',
  }
}

describe('POST /api/blog-prompts/generate-blog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPayload.findGlobal.mockResolvedValue({
      globalBlogRules: 'Use Australian English.',
      globalMarkdownRules: 'Use tight markdown.',
    })
    mockGetOptiMateDefaultModels.mockResolvedValue({
      defaultAutonomousModel: 'kimi-k2.6',
      blogPrompterModel: undefined,
    })
    mockCallLLM.mockResolvedValue(llmReply('# Blog\nContent'))
    mockPayload.create.mockResolvedValue({ id: 123, title: 'Blog' })
  })

  it('returns 401 unauthenticated', async () => {
    mockPayload.auth.mockResolvedValue({ user: null })

    const res = await POST(makeRequest({ prompt: 'Write a blog' }))
    const json = await res.json()

    expect(res.status).toBe(401)
    expect(json.error).toBe('Unauthorized')
    expect(mockCallLLM).not.toHaveBeenCalled()
  })

  it('returns 400 when prompt is missing', async () => {
    mockPayload.auth.mockResolvedValue({ user: { id: 1 } })

    const res = await POST(makeRequest({}))
    const json = await res.json()

    expect(res.status).toBe(400)
    expect(json.error).toBe('prompt is required')
    expect(mockCallLLM).not.toHaveBeenCalled()
  })

  it('returns markdown and calls callLLM with supplied prompt', async () => {
    mockPayload.auth.mockResolvedValue({ user: { id: 1 } })

    const res = await POST(makeRequest({ prompt: 'Generated prompt text' }))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.ok).toBe(true)
    expect(json.markdown).toBe('# Blog\nContent')
    expect(json.model).toBe('kimi-k2.6')
    expect(mockCallLLM).toHaveBeenCalledTimes(1)
    expect(mockCallLLM).toHaveBeenCalledWith(expect.objectContaining({
      model: 'kimi-k2.6',
      messages: [{ role: 'user', content: [{ type: 'text', text: 'Generated prompt text' }] }],
    }))
  })

  it('uses only the direct LLM route dependencies', async () => {
    mockPayload.auth.mockResolvedValue({ user: { id: 1 } })

    await POST(makeRequest({ prompt: 'Generated prompt text' }))

    expect(mockPayload.findGlobal).toHaveBeenCalledWith({ slug: 'blog-settings', overrideAccess: true })
    expect(mockGetOptiMateDefaultModels).toHaveBeenCalledWith(mockPayload)
    expect(mockCallLLM).toHaveBeenCalledTimes(1)
  })

  it('requires a client id when creating a draft', async () => {
    mockPayload.auth.mockResolvedValue({ user: { id: 1 } })

    const res = await POST(makeRequest({ prompt: 'Generated prompt text', createDraft: true }))
    const json = await res.json()

    expect(res.status).toBe(400)
    expect(json.error).toBe('clientId is required to create a blog draft')
    expect(mockPayload.create).not.toHaveBeenCalled()
  })

  it('creates a draft Blog Post with markdownSource for the selected client', async () => {
    mockPayload.auth.mockResolvedValue({ user: { id: 1 } })
    mockCallLLM.mockResolvedValue(llmReply('# My Generated Blog\nContent'))

    const res = await POST(makeRequest({ prompt: 'Generated prompt text', clientId: 42, createDraft: true }))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.draft).toEqual({ id: 123, title: 'Blog', adminUrl: '/admin/collections/blog-posts/123' })
    expect(mockPayload.create).toHaveBeenCalledWith({
      collection: 'blog-posts',
      data: expect.objectContaining({
        client: 42,
        clientConfirmed: true,
        title: 'My Generated Blog',
        slug: 'my-generated-blog',
        status: 'draft',
        markdownSource: '# My Generated Blog\nContent',
      }),
      overrideAccess: true,
      draft: true,
    })
  })

  it('falls back when the Blog Prompter model fails', async () => {
    mockPayload.auth.mockResolvedValue({ user: { id: 1 } })
    mockGetOptiMateDefaultModels.mockResolvedValue({
      defaultAutonomousModel: 'kimi-k2.6',
      blogPrompterModel: 'claude-sonnet-4.6',
    })
    mockCallLLM
      .mockRejectedValueOnce(new Error('provider down'))
      .mockResolvedValueOnce(llmReply('# Fallback blog', 'kimi-k2.6'))

    const res = await POST(makeRequest({ prompt: 'Generated prompt text' }))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.markdown).toBe('# Fallback blog')
    expect(json.warning).toContain('fell back to autonomous default kimi-k2.6')
    expect(mockCallLLM).toHaveBeenNthCalledWith(1, expect.objectContaining({ model: 'claude-sonnet-4.6' }))
    expect(mockCallLLM).toHaveBeenNthCalledWith(2, expect.objectContaining({ model: 'kimi-k2.6' }))
  })
})
