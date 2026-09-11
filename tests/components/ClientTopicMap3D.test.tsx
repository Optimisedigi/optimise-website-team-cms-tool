import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildTopicAuthorityGraph } from '@/lib/topic-authority-graph'

vi.mock('@payloadcms/ui', () => ({ useDocumentInfo: () => ({ id: 'client-1' }) }))

/**
 * Stand-in for the WebGL renderer. jsdom has no WebGL context, and the real
 * module would pull three.js into the test run, so the chainable surface is
 * recorded instead and asserted on.
 */
const graphData = vi.fn()
const destructor = vi.fn()
const linkForce = { distance: vi.fn() }
const chargeForce = { strength: vi.fn(), distanceMax: vi.fn() }
const instance: Record<string, any> = {}

vi.mock('3d-force-graph', () => {
  const chainable = new Proxy(instance, {
    get(target, prop: string) {
      if (prop === 'graphData') return graphData
      if (prop === '_destructor') return destructor
      if (prop === 'd3Force') {
        return (name: string) => (name === 'link' ? linkForce : chargeForce)
      }
      if (prop === 'onEngineStop') return (fn: () => void) => (target.engineStop = fn)
      if (prop === 'zoomToFit') return (target.zoomToFit ??= vi.fn())
      if (!(prop in target)) target[prop] = vi.fn(() => chainable)
      return target[prop]
    },
  })
  chargeForce.strength.mockReturnValue(chargeForce)
  // Must be a function expression: the component calls it with `new`.
  return {
    default: vi.fn(function () {
      return chainable
    }),
  }
})

const graph = buildTopicAuthorityGraph({
  configuredCategories: ['SEO'],
  posts: [
    { id: 1, title: 'SEO guide', slug: 'seo-guide', status: 'published', category: 'SEO', tags: ['Audit'], markdownContent: '[Service](/services)' },
    { id: 2, title: 'Second post', slug: 'second', status: 'published', category: 'SEO', tags: ['Audit'], markdownContent: '' },
  ],
  suggestions: [{ id: 1, sourceUrl: '/blog/seo-guide', targetUrl: '/contact', status: 'pending', confidenceScore: 80 }],
  derivedAt: '2026-01-01T00:00:00.000Z',
})

const Component = (await import('@/components/ClientTopicMap')).default

async function renderReady() {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ ok: true, graph }) })))
  const view = render(<Component />)
  await screen.findByRole('heading', { name: 'Topical coverage graph' })
  return view
}

describe('ClientTopicMap 3D view', () => {
  beforeEach(() => {
    graphData.mockClear()
    destructor.mockClear()
    linkForce.distance.mockClear()
    chargeForce.strength.mockClear()
    for (const key of Object.keys(instance)) delete instance[key]
  })

  it('defaults to the accessible 2D view', async () => {
    const { container } = await renderReady()
    expect(screen.getByRole('button', { name: '2D' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: '3D' })).toHaveAttribute('aria-pressed', 'false')
    expect(container.querySelector('svg.topicGraph__svg')).toBeInTheDocument()
    expect(container.querySelector('.topicGraph__scene')).not.toBeInTheDocument()
  })

  it('swaps to the 3D scene and feeds it the filtered graph', async () => {
    const { container } = await renderReady()
    fireEvent.click(screen.getByRole('button', { name: '3D' }))

    await waitFor(() => expect(graphData).toHaveBeenCalled())
    const payload = graphData.mock.calls.at(-1)![0] as { nodes: any[]; links: any[] }
    expect(payload.nodes.length).toBeGreaterThan(0)
    expect(payload.links.length).toBeGreaterThan(0)
    // Every link must reference nodes that are actually present in the scene.
    const ids = new Set(payload.nodes.map((node) => node.id))
    expect(payload.links.every((link) => ids.has(link.source) && ids.has(link.target))).toBe(true)

    expect(container.querySelector('svg.topicGraph__svg')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '3D' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('hides the canvas from assistive tech and keeps the relationship table', async () => {
    const { container } = await renderReady()
    fireEvent.click(screen.getByRole('button', { name: '3D' }))

    await waitFor(() => expect(container.querySelector('.topicGraph__scene')).toBeInTheDocument())
    expect(container.querySelector('.topicGraph__scene')).toHaveAttribute('aria-hidden', 'true')
    expect(screen.getByRole('table')).toHaveAccessibleName(/Complete accessible alternative/)
  })

  it('applies the compact layout forces', async () => {
    await renderReady()
    fireEvent.click(screen.getByRole('button', { name: '3D' }))

    await waitFor(() => expect(linkForce.distance).toHaveBeenCalled())
    // Short links and a capped repulsion keep the graph tight in the panel.
    expect(linkForce.distance).toHaveBeenCalledWith(18)
    expect(chargeForce.strength).toHaveBeenCalledWith(-48)
    expect(chargeForce.distanceMax).toHaveBeenCalledWith(190)
  })

  it('releases the WebGL renderer when leaving the 3D view', async () => {
    await renderReady()
    fireEvent.click(screen.getByRole('button', { name: '3D' }))
    await waitFor(() => expect(graphData).toHaveBeenCalled())

    fireEvent.click(screen.getByRole('button', { name: '2D' }))
    await waitFor(() => expect(destructor).toHaveBeenCalled())
  })

  it('offers the 2D fallback when the renderer fails to load', async () => {
    const module = await import('3d-force-graph')
    vi.mocked(module.default).mockImplementationOnce(() => {
      throw new Error('WebGL unavailable')
    })
    await renderReady()
    fireEvent.click(screen.getByRole('button', { name: '3D' }))

    expect(await screen.findByText(/The 3D view could not be loaded/)).toBeInTheDocument()
  })
})
