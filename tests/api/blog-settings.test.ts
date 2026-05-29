import { describe, expect, it, beforeEach, vi } from 'vitest'
import { DEFAULT_GLOBAL_BLOG_RULES, DEFAULT_GLOBAL_MARKDOWN_RULES } from '@/lib/blog-prompter'

vi.mock('next/headers', () => ({
  headers: vi.fn(() => Promise.resolve(new Headers())),
}))

const mockPayload = {
  auth: vi.fn(),
  findGlobal: vi.fn(),
}

vi.mock('payload', () => ({
  getPayload: vi.fn(() => Promise.resolve(mockPayload)),
}))

vi.mock('@/payload.config', () => ({
  default: Promise.resolve({}),
}))

import { GET } from '@/app/(frontend)/api/blog-settings/route'

describe('GET /api/blog-settings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 401 when user is not authenticated', async () => {
    mockPayload.auth.mockResolvedValue({ user: null })

    const res = await GET()
    const json = await res.json()

    expect(res.status).toBe(401)
    expect(json.error).toBe('Unauthorized')
  })

  it('returns global settings for authenticated users', async () => {
    mockPayload.auth.mockResolvedValue({ user: { id: 1 } })
    mockPayload.findGlobal.mockResolvedValue({
      globalBlogRules: 'Global rules',
      globalMarkdownRules: 'Markdown rules',
    })

    const res = await GET()
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json).toEqual({ globalBlogRules: 'Global rules', globalMarkdownRules: 'Markdown rules' })
    expect(mockPayload.findGlobal).toHaveBeenCalledWith({ slug: 'blog-settings' })
  })

  it('falls back when settings are blank', async () => {
    mockPayload.auth.mockResolvedValue({ user: { id: 1 } })
    mockPayload.findGlobal.mockResolvedValue({ globalBlogRules: '', globalMarkdownRules: '   ' })

    const res = await GET()
    const json = await res.json()

    expect(json.globalBlogRules).toBe(DEFAULT_GLOBAL_BLOG_RULES)
    expect(json.globalMarkdownRules).toBe(DEFAULT_GLOBAL_MARKDOWN_RULES)
  })
})
