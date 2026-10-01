import { describe, expect, it, vi } from 'vitest'
import type { Payload } from 'payload'
import { createPayloadClientLinkSourcesReader } from '@/lib/agents/adminmate/client-link-sources'

type FindArgs = { collection: string; where: unknown; select: Record<string, true> }

const client = { id: '31', name: 'We Can Quit', slug: 'we-can-quit' }

function payloadWith(docs: Record<string, Array<Record<string, unknown>>>) {
  const find = vi.fn(async (args: FindArgs) => ({ docs: docs[args.collection] ?? [] }))
  return { payload: { find } as unknown as Payload, find }
}

describe('createPayloadClientLinkSourcesReader', () => {
  it('links proposals to their page only once the audit is complete', async () => {
    const { payload } = payloadWith({
      'client-proposals': [
        {
          id: 4,
          businessName: 'We Can Quit',
          slug: 'we-can-quit',
          auditStatus: 'completed',
          createdAt: '2026-05-01T00:00:00.000Z',
        },
        {
          id: 9,
          businessName: 'We Can Quit',
          slug: 'we-can-quit-2',
          auditStatus: 'running',
          createdAt: '2026-09-01T00:00:00.000Z',
        },
      ],
    })

    const result = await createPayloadClientLinkSourcesReader(payload).getLinks(client, [
      'proposals',
    ])

    expect(result.proposals).toEqual([
      { label: 'We Can Quit proposal (2026-05-01)', href: '/proposals/we-can-quit' },
      {
        label: 'We Can Quit proposal (2026-05-01) — CMS record',
        href: '/admin/collections/client-proposals/4',
      },
      {
        label: 'We Can Quit proposal (2026-09-01) — CMS record',
        href: '/admin/collections/client-proposals/9',
      },
    ])
  })

  it('links discovery briefings on the client and on their proposal', async () => {
    const { payload, find } = payloadWith({
      'client-proposals': [{ id: 4, businessName: 'We Can Quit', slug: 'wcq-proposal' }],
      'client-discovery-briefings': [
        { id: 7, title: 'Discovery briefing', client: 31, clientProposal: null },
        { id: 12, title: 'Proposal briefing', client: null, clientProposal: 4 },
      ],
    })

    const result = await createPayloadClientLinkSourcesReader(payload).getLinks(client, [
      'discovery_briefings',
    ])

    expect(result.discovery_briefings).toEqual([
      { label: 'Discovery briefing', href: '/client/we-can-quit/discovery/007' },
      {
        label: 'Discovery briefing — CMS record',
        href: '/admin/collections/client-discovery-briefings/7',
      },
      { label: 'Proposal briefing', href: '/client-proposal/wcq-proposal/discovery/012' },
      {
        label: 'Proposal briefing — CMS record',
        href: '/admin/collections/client-discovery-briefings/12',
      },
    ])
    const briefingQuery = find.mock.calls.find(
      ([args]) => args.collection === 'client-discovery-briefings',
    )?.[0]
    expect(briefingQuery?.where).toEqual({
      or: [{ client: { equals: 31 } }, { clientProposal: { in: [4] } }],
    })
  })

  it('links audit reports, the report page and CMS records across audit types', async () => {
    const { payload } = payloadWith({
      'seo-audits': [
        {
          id: 3,
          websiteUrl: 'wecanquit.com.au',
          reportSlug: 'wcq-seo',
          createdAt: '2026-08-01T00:00:00.000Z',
        },
      ],
      'google-ads-audits': [{ id: 5, businessName: 'We Can Quit', slug: 'wcq-ads' }],
      'tag-setup-audits': [{ id: 8, url: 'https://wecanquit.com.au' }],
    })

    const links = (await createPayloadClientLinkSourcesReader(payload).getLinks(client, ['audits']))
      .audits

    expect(links).toEqual([
      { label: 'SEO & CRO report page', href: '/reports/we-can-quit' },
      { label: 'SEO audit — wecanquit.com.au (2026-08-01) — report', href: '/audits/wcq-seo' },
      {
        label: 'SEO audit — wecanquit.com.au (2026-08-01) — CMS record',
        href: '/admin/collections/seo-audits/3',
      },
      {
        label: 'Google Ads audit — We Can Quit — negative keyword build',
        href: '/negative-keyword-build/wcq-ads',
      },
      {
        label: 'Google Ads audit — We Can Quit — CMS record',
        href: '/admin/collections/google-ads-audits/5',
      },
      {
        label: 'Tag setup audit — https://wecanquit.com.au — CMS record',
        href: '/admin/collections/tag-setup-audits/8',
      },
    ])
  })

  it('keeps other audit types when one fails to load, and fails only when all do', async () => {
    const find = vi.fn(async (args: FindArgs) => {
      if (args.collection === 'cro-audits') throw new Error('no such table')
      if (args.collection === 'tag-setup-audits')
        return { docs: [{ id: 8, url: 'https://wecanquit.com.au' }] }
      return { docs: [] }
    })
    const result = await createPayloadClientLinkSourcesReader({
      find,
    } as unknown as Payload).getLinks(client, ['audits'])
    expect(result.audits).toEqual([
      {
        label: 'Tag setup audit — https://wecanquit.com.au — CMS record',
        href: '/admin/collections/tag-setup-audits/8',
      },
    ])

    const allFail = vi.fn(async () => {
      throw new Error('database is locked')
    })
    const failed = await createPayloadClientLinkSourcesReader({
      find: allFail,
    } as unknown as Payload).getLinks(client, ['audits'])
    expect(failed.audits).toBeNull()
  })

  it('links decks and saved hub links, dropping unsafe ones', async () => {
    const { payload } = payloadWith({
      clients: [
        {
          id: 31,
          presentations: [
            { title: 'Google Ads Audit', deckSlug: 'google-ads-audit-5', isPublic: false },
            {
              title: 'Legacy deck',
              deckUrl: 'https://cms.optimisedigital.online/partners/we-can-quit/legacy/',
            },
          ],
          clientPortalLinks: [
            {
              label: 'Looker dashboard',
              url: 'https://lookerstudio.google.com/r/abc',
              visibility: 'client_visible',
              sortOrder: 2,
            },
            {
              label: 'Strategy doc',
              url: 'https://docs.google.com/document/d/x',
              visibility: 'internal',
              sortOrder: 1,
            },
            {
              label: 'Bad',
              url: 'javascript:alert(1)',
              visibility: 'client_visible',
              sortOrder: 0,
            },
          ],
        },
      ],
    })

    const result = await createPayloadClientLinkSourcesReader(payload).getLinks(client, [
      'decks',
      'portal_links',
    ])

    expect(result.decks).toEqual([
      { label: 'Google Ads Audit (not public)', href: '/partners/we-can-quit/google-ads-audit-5/' },
      {
        label: 'Legacy deck',
        href: 'https://cms.optimisedigital.online/partners/we-can-quit/legacy/',
        external: true,
      },
    ])
    expect(result.portal_links).toEqual([
      {
        label: 'Strategy doc (internal)',
        href: 'https://docs.google.com/document/d/x',
        external: true,
      },
      { label: 'Looker dashboard', href: 'https://lookerstudio.google.com/r/abc', external: true },
    ])
  })

  it('reports a kind as unavailable when loading fails, without failing the others', async () => {
    const find = vi.fn(async (args: FindArgs) => {
      if (args.collection === 'client-proposals') throw new Error('database is locked')
      return { docs: [{ id: 31, presentations: [{ title: 'Deck', deckSlug: 'd1' }] }] }
    })
    const reader = createPayloadClientLinkSourcesReader({ find } as unknown as Payload)

    const result = await reader.getLinks(client, ['proposals', 'decks'])

    expect(result.proposals).toBeNull()
    expect(result.decks).toEqual([{ label: 'Deck', href: '/partners/we-can-quit/d1/' }])
  })
})
