import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildTopicAuthorityGraph } from '@/lib/topic-authority-graph'

vi.mock('@payloadcms/ui', () => ({ useDocumentInfo: () => ({ id: 'client-1' }) }))
const graph = buildTopicAuthorityGraph({
  configuredCategories: ['SEO', 'Empty category'],
  posts: [
    { id: 1, title: 'SEO guide', slug: 'seo-guide', status: 'published', category: 'SEO', tags: ['Audit'], markdownContent: '[Service](/services)' },
    { id: 2, title: 'Isolated draft', slug: 'draft', status: 'draft', category: 'SEO', tags: [], markdownContent: '' },
  ],
  suggestions: [{ id: 1, sourceUrl: '/blog/seo-guide', targetUrl: '/contact', status: 'pending', confidenceScore: 80 }],
  derivedAt: '2026-01-01T00:00:00.000Z',
})
const Component = (await import('@/components/ClientTopicMap')).default

describe('ClientTopicMap', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('renders loading, category-first filters and the relationship alternative', async () => {
    let resolveFetch: (value: unknown) => void = () => {}
    vi.stubGlobal('fetch', vi.fn(() => new Promise((resolve) => { resolveFetch = resolve })))
    render(<Component />)
    expect(screen.getByRole('status')).toHaveTextContent('Building category')
    resolveFetch({ ok: true, json: async () => ({ ok: true, graph }) })
    expect(await screen.findByRole('heading', { name: 'Topical coverage graph' })).toBeInTheDocument()
    expect(screen.getByLabelText('Category')).toHaveTextContent('Empty category (0)')
    expect(screen.getByRole('table')).toHaveAccessibleName(/Complete accessible alternative/)
    expect(within(screen.getByRole('table')).getByText('published link')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }))
    expect(screen.getByRole('button', { name: 'Reset zoom' })).toHaveTextContent('110%')
  })

  it('retries a failed request', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: false }).mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, graph }) })
    vi.stubGlobal('fetch', fetchMock)
    render(<Component />)
    fireEvent.click(await screen.findByRole('button', { name: 'Retry topic graph' }))
    expect(await screen.findByRole('heading', { name: 'Topical coverage graph' })).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('filters categories and distinguishes no results', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ ok: true, graph }) })))
    render(<Component />)
    await screen.findByRole('heading', { name: 'Topical coverage graph' })
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'category:empty%20category' } })
    fireEvent.change(screen.getByLabelText('Publication status'), { target: { value: 'published' } })
    fireEvent.click(screen.getByLabelText('Show isolated'))
    expect(screen.getByRole('status')).toHaveTextContent('No graph evidence matches')
  })

  it('selects nodes with the keyboard and updates synchronized details', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ ok: true, graph }) })))
    render(<Component />)
    const node = await screen.findByRole('button', { name: /Article: SEO guide/ })
    fireEvent.keyDown(node, { key: 'Enter' })
    await waitFor(() => expect(screen.getByRole('link', { name: 'Open article in admin' })).toHaveAttribute('href', '/admin/collections/blog-posts/1'))
    expect(screen.getByText('Direct neighbors')).toBeInTheDocument()
    expect(node).toHaveAttribute('aria-pressed', 'true')
  })

  it('renders configured categories when there are no articles', async () => {
    const emptyGraph = buildTopicAuthorityGraph({ configuredCategories: ['SEO'], posts: [] })
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ ok: true, graph: emptyGraph }) })))
    render(<Component />)
    expect(await screen.findByText('No articles yet')).toBeInTheDocument()
    expect(screen.getByText('SEO: Empty')).toBeInTheDocument()
  })
})
