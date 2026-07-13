import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const payload = {
  auth: vi.fn(),
  findByID: vi.fn(),
  update: vi.fn(),
}

vi.mock('payload', () => ({ getPayload: vi.fn(async () => payload) }))
vi.mock('@/payload.config', () => ({ default: {} }))

describe('POST /api/proposals/[id]/refresh-keyword-data', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.stubEnv('GROWTH_TOOLS_URL', 'https://growth.example.com')
    vi.stubEnv('INTERNAL_API_KEY', 'secret')
    payload.auth.mockResolvedValue({ user: { id: 1 } })
    payload.findByID.mockImplementation(async ({ collection }: { collection: string }) => {
      if (collection === 'client-proposals') {
        return {
          websiteUrl: 'https://example.com',
          targetLocation: 'vn',
          searchLanguage: 'vi',
          keywordSnapshot: 7,
          keywordCategories: [{ keywords: 'existing keyword\nnew keyword' }],
        }
      }
      return {
        id: 7,
        keywords: [{ keyword: 'existing keyword', position: 8, searchVolume: 100 }],
      }
    })
    payload.update.mockResolvedValue({})
  })

  it('requests only new category keywords and merges their metrics into the linked snapshot', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      keywords: [{ keyword: 'new keyword', position: 12, search_volume: 250, opportunity: 'medium' }],
    }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const { POST } = await import('@/app/(frontend)/api/proposals/[id]/refresh-keyword-data/route')

    const response = await POST(
      new NextRequest('http://localhost/api/proposals/42/refresh-keyword-data', { method: 'POST' }),
      { params: Promise.resolve({ id: '42' }) },
    )

    expect(response.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      website: 'https://example.com',
      keywords: 'new keyword',
      location: 'vn',
      language: 'vi',
    })
    expect(payload.update).toHaveBeenCalledWith(expect.objectContaining({
      collection: 'keyword-snapshots',
      id: 7,
      data: expect.objectContaining({
        totalKeywords: 2,
        top10: 1,
        avgPosition: 10,
        opportunities: 1,
        rankingDistribution: { top10: 1, top20: 2, top50: 2, notFound: 0 },
        keywords: [
          { keyword: 'existing keyword', position: 8, searchVolume: 100 },
          {
            keyword: 'new keyword',
            position: 12,
            search_volume: 250,
            searchVolume: 250,
            opportunity: 'medium',
          },
        ],
      }),
    }))
    await expect(response.json()).resolves.toMatchObject({ requested: 1, added: 1, totalKeywords: 2 })
  })
})
