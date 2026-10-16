import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  payload: { auth: vi.fn(), findByID: vi.fn(), find: vi.fn() },
}))

vi.mock('payload', async (importOriginal) => ({
  ...(await importOriginal<typeof import('payload')>()),
  getPayload: vi.fn(async () => mocks.payload),
}))
vi.mock('@/payload.config', () => ({ default: Promise.resolve({}) }))

import { POST as mintLink } from '@/app/(frontend)/api/content-sync/preview-link/route'
import { GET as fetchPreview } from '@/app/(frontend)/api/content-sync/article-preview/route'
import { PREVIEW_TTL_SECONDS, signPreview, verifyPreview } from '@/lib/in-the-picture/preview'

const environment = { ...process.env }
const draft = {
  id: 31, client: 1, clientConfirmed: false, status: 'draft', updatedAt: '2026-10-16T12:00:00.000Z',
  slug: 'income-averaging', title: 'Income averaging', excerpt: 'Intro', author: 'Jane Editor',
  publishedDate: '2026-10-16T00:00:00.000Z', readingTime: '5 min read',
  websiteCategory: 'tax-tips', websiteServiceSlug: 'income-averaging',
  markdownContent: '## Heading\n\nBody text.',
}

function mint(body: unknown, origin = 'https://cms.test') {
  return mintLink(new Request('https://cms.test/api/content-sync/preview-link', {
    method: 'POST', headers: { 'content-type': 'application/json', origin }, body: JSON.stringify(body),
  }))
}
function fetchWith(query: Record<string, string>) {
  return fetchPreview(new Request(`https://cms.test/api/content-sync/article-preview?${new URLSearchParams(query)}`))
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.PAYLOAD_SECRET = 'test-payload-secret-value-1234567890'
  process.env.IN_THE_PICTURE_CLIENT_ID = '1'
  process.env.IN_THE_PICTURE_WEBSITE_ORIGIN = 'https://itp.example.com'
  mocks.payload.auth.mockResolvedValue({ user: { id: 7, role: 'admin' } })
  mocks.payload.find.mockResolvedValue({ docs: [] })
  mocks.payload.findByID.mockImplementation(async ({ collection }: { collection: string }) =>
    collection === 'clients' ? { id: 1, authors: [{ name: 'Jane Editor' }] } : draft,
  )
})
afterEach(() => { process.env = { ...environment } })

describe('In The Picture preview links', () => {
  it('signs links that verify only for the same post, before expiry, with this secret', () => {
    const now = Date.parse('2026-10-16T12:00:00.000Z')
    const signed = signPreview(31, now)
    expect(signed).not.toBeNull()
    const { exp, sig } = signed as { exp: number; sig: string }
    expect(verifyPreview(31, String(exp), sig, now)).toBe(true)
    expect(verifyPreview(32, String(exp), sig, now)).toBe(false)
    expect(verifyPreview(31, String(exp), sig, now + (PREVIEW_TTL_SECONDS + 1) * 1000)).toBe(false)
    expect(verifyPreview(31, String(exp + 1), sig, now)).toBe(false)
    process.env.PAYLOAD_SECRET = 'a-different-secret-value-0987654321'
    expect(verifyPreview(31, String(exp), sig, now)).toBe(false)
    delete process.env.PAYLOAD_SECRET
    expect(signPreview(31, now)).toBeNull()
  })

  it('mints a website link only for a same-origin blog editor', async () => {
    const ok = await mint({ postId: 31 })
    expect(ok.status).toBe(200)
    const { url } = (await ok.json()) as { url: string }
    const link = new URL(url)
    expect(`${link.origin}${link.pathname}`).toBe('https://itp.example.com/preview/cms-article/31')
    expect(verifyPreview(31, link.searchParams.get('exp'), link.searchParams.get('sig'))).toBe(true)
    expect(ok.headers.get('cache-control')).toContain('no-store')

    expect((await mint({ postId: 31 }, 'https://evil.example.com')).status).toBe(403)
    mocks.payload.auth.mockResolvedValueOnce({ user: null })
    expect((await mint({ postId: 31 })).status).toBe(401)
    mocks.payload.auth.mockResolvedValueOnce({ user: { id: 8, role: 'user', featureAccess: [] } })
    expect((await mint({ postId: 31 })).status).toBe(401)
    expect((await mint({ postId: '31 OR 1' })).status).toBe(400)
  })

  it('names what to fix instead of minting a link for an incomplete post', async () => {
    mocks.payload.findByID.mockImplementation(async ({ collection }: { collection: string }) =>
      collection === 'clients' ? { id: 1, authors: [{ name: 'Jane Editor' }] } : { ...draft, readingTime: '' },
    )
    const response = await mint({ postId: 31 })
    expect(response.status).toBe(422)
    expect(await response.json()).toEqual({ error: expect.stringContaining('Fill in Reading Time') })
  })

  it('returns the draft article only for a valid signed link to this client’s post', async () => {
    const signed = signPreview(31) as { exp: number; sig: string }
    const ok = await fetchWith({ postId: '31', exp: String(signed.exp), sig: signed.sig })
    expect(ok.status).toBe(200)
    const event = (await ok.json()) as { event: string; postId: string; revision: string; article: { slug: string } }
    expect(event).toMatchObject({ event: 'published', postId: '31', revision: '2026-10-16T12:00:00.000Z', article: { slug: 'income-averaging' } })
    expect(mocks.payload.findByID).toHaveBeenCalledWith(expect.objectContaining({ collection: 'blog-posts', id: 31, draft: true }))

    expect((await fetchWith({ postId: '31', exp: String(signed.exp), sig: 'x'.repeat(43) })).status).toBe(404)
    expect((await fetchWith({ postId: '32', exp: String(signed.exp), sig: signed.sig })).status).toBe(404)
    expect((await fetchWith({ postId: '31' })).status).toBe(404)
    mocks.payload.findByID.mockImplementation(async () => ({ ...draft, client: 2 }))
    expect((await fetchWith({ postId: '31', exp: String(signed.exp), sig: signed.sig })).status).toBe(404)
  })
})

describe('Website preview tab', () => {
  it('shows only on In The Picture posts', async () => {
    const { BlogPosts } = await import('@/collections/BlogPosts')
    const tabs = BlogPosts.fields.flatMap((field) => ('tabs' in field ? field.tabs : []))
    const tab = tabs.find((candidate) => 'label' in candidate && candidate.label === 'Website preview')
    const condition = tab?.admin?.condition as ((data: Record<string, unknown>) => boolean) | undefined
    expect(condition).toBeTypeOf('function')
    expect(condition?.({ client: 1 })).toBe(true)
    expect(condition?.({ client: { id: 1 } })).toBe(true)
    expect(condition?.({ client: 2 })).toBe(false)
    delete process.env.IN_THE_PICTURE_CLIENT_ID
    expect(condition?.({ client: 1 })).toBe(false)
  })
})
