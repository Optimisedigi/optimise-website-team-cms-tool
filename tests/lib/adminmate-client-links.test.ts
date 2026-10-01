import { describe, expect, it, vi } from 'vitest'
import { createClientLinksTool } from '@/lib/agents/adminmate/client-links'
import { isSafeClientLinkHref, toSafeClientLink } from '@/lib/agents/adminmate/client-link-href'
import type { ClientContractRecord } from '@/lib/agents/adminmate/client-details'
import type { AdminMateClient } from '@/lib/agents/adminmate/tools'
import type { ToolContext } from '@/lib/agents/_shared/tool'

const existing: AdminMateClient[] = [
  {
    id: '31',
    name: 'We Can Quit',
    slug: 'we-can-quit',
    websiteUrl: 'https://wecanquit.com.au',
    isActive: true,
  },
  { id: '7', name: 'Acme Corp', slug: 'acme-corp', isActive: true },
  { id: '8', name: 'Acme Plumbing', slug: 'acme-plumbing', isActive: true },
]

const contract = (overrides: Partial<ClientContractRecord>): ClientContractRecord => ({
  id: '1',
  title: 'Agreement',
  status: 'completed',
  linkedToClient: true,
  clientName: 'We Can Quit',
  contractDate: null,
  contractStartDate: null,
  contractEndDate: null,
  sentAt: null,
  agencySignedAt: null,
  clientSignedAt: null,
  clientSignerName: null,
  currency: 'AUD',
  monthlyRetainer: null,
  setupFee: null,
  hideSetupFee: false,
  monthlyHosting: null,
  annualHosting: null,
  additionalWork: [],
  pricingNotes: null,
  contractTerm: null,
  paymentTerms: null,
  scopeOfWork: null,
  paymentTermsOverride: null,
  terminationOverride: null,
  annualReviewEnabled: false,
  annualReviewTierTableText: null,
  hasSignedPdf: false,
  updatedAt: null,
  ...overrides,
})

const ctx = { log: vi.fn() } as unknown as ToolContext

async function run(tool: ReturnType<typeof createClientLinksTool>, args: unknown) {
  return tool.execute(tool.validate ? tool.validate(args) : args, ctx) as Promise<{
    ok: boolean
    data?: Record<string, unknown>
    error?: string
  }>
}

describe('get_client_links', () => {
  it('links each contract to its CMS record and the signed PDF or a preview', async () => {
    const getContracts = vi.fn(async () => [
      contract({ id: '12', title: 'SEO Retainer', status: 'completed', hasSignedPdf: true }),
      contract({ id: '15', title: 'Website Hosting', status: 'sent' }),
    ])
    const tool = createClientLinksTool(existing, { getContracts })

    const result = await run(tool, { client: 'we can quit', kinds: ['contracts'] })

    expect(result.ok).toBe(true)
    expect(result.data?.links).toEqual([
      { label: 'SEO Retainer (signed)', href: '/admin/collections/contracts/12' },
      { label: 'SEO Retainer — signed PDF', href: '/api/contracts/12/download-pdf' },
      { label: 'Website Hosting (sent)', href: '/admin/collections/contracts/15' },
      { label: 'Website Hosting — PDF preview', href: '/api/contracts/15/preview-pdf' },
    ])
    expect(getContracts).toHaveBeenCalledWith('31', ['We Can Quit'])
  })

  it('returns only the kinds asked for and skips the contract lookup otherwise', async () => {
    const getContracts = vi.fn(async () => [contract({})])
    const tool = createClientLinksTool(existing, { getContracts })

    const result = await run(tool, { client: '31', kinds: ['client_record', 'client_hub'] })

    expect(result.data?.links).toEqual([
      { label: 'We Can Quit — client record', href: '/admin/collections/clients/31' },
      { label: 'We Can Quit — client hub', href: '/client/we-can-quit/hub' },
    ])
    expect(getContracts).not.toHaveBeenCalled()
  })

  it('links the hub for slugs with uppercase or underscores by encoding them', async () => {
    const tool = createClientLinksTool(
      [{ id: '50', name: 'Odd Slug', slug: 'Odd_Slug.co', isActive: true }],
      { getContracts: async () => [] },
    )
    const result = await run(tool, { client: '50', kinds: ['client_hub'] })
    expect(result.data?.links).toEqual([
      { label: 'Odd Slug — client hub', href: '/client/Odd_Slug.co/hub' },
    ])
  })

  it('keeps every contract when the client has the maximum number, plus the record and hub', async () => {
    const ten = Array.from({ length: 10 }, (_, index) =>
      contract({ id: String(100 + index), title: `Contract ${index + 1}` }),
    )
    const tool = createClientLinksTool(existing, { getContracts: async () => ten })

    const result = await run(tool, {
      client: '31',
      kinds: ['client_record', 'client_hub', 'contracts'],
    })

    const links = result.data?.links as Array<{ href: string }>
    expect(links).toHaveLength(22)
    expect(links.at(-1)?.href).toBe('/api/contracts/109/preview-pdf')
    expect(result.data?.note).toMatch(/10 most recent contracts/)
  })

  it('says so when the client has no contracts or they cannot be loaded', async () => {
    const none = await run(createClientLinksTool(existing, { getContracts: async () => [] }), {
      client: 'We Can Quit',
      kinds: ['contracts'],
    })
    expect(none.data).toMatchObject({
      links: [],
      note: 'No contracts are recorded in the CMS for this client.',
    })

    const failed = await run(createClientLinksTool(existing, { getContracts: async () => null }), {
      client: 'We Can Quit',
      kinds: ['contracts'],
    })
    expect(failed.data).toMatchObject({ links: [], note: 'Contracts could not be loaded.' })
  })

  it('asks which client when the name is ambiguous, and errors when nothing matches', async () => {
    const tool = createClientLinksTool(existing, { getContracts: async () => [] })

    const ambiguous = await run(tool, { client: 'acme', kinds: ['client_record'] })
    expect(ambiguous.data).toMatchObject({ needsClientChoice: true })
    expect(ambiguous.data).not.toHaveProperty('links')

    const none = await run(tool, { client: 'Nobody Pty Ltd', kinds: ['client_record'] })
    expect(none.ok).toBe(false)
  })

  it('adds proposal, briefing and audit links from the sources reader and notes empty or failed kinds', async () => {
    const getLinks = vi.fn(async () => ({
      proposals: [{ label: 'We Can Quit proposal', href: '/proposals/we-can-quit' }],
      discovery_briefings: [],
      audits: null,
    }))
    const getContracts = vi.fn(async () => [])
    const tool = createClientLinksTool(existing, { getContracts }, { getLinks })

    const result = await run(tool, {
      client: 'we can quit',
      kinds: ['proposals', 'discovery_briefings', 'audits'],
    })

    expect(getLinks).toHaveBeenCalledWith({ id: '31', name: 'We Can Quit', slug: 'we-can-quit' }, [
      'proposals',
      'discovery_briefings',
      'audits',
    ])
    expect(getContracts).not.toHaveBeenCalled()
    expect(result.data?.links).toEqual([
      { label: 'We Can Quit proposal', href: '/proposals/we-can-quit' },
    ])
    expect(result.data?.note).toBe(
      'No discovery briefings are recorded in the CMS for this client. Links for audits could not be loaded.',
    )
  })

  it('says when there are more links than fit', async () => {
    const many = Array.from({ length: 45 }, (_, index) => ({
      label: `Deck ${index}`,
      href: `/partners/we-can-quit/d${index}/`,
    }))
    const tool = createClientLinksTool(
      existing,
      { getContracts: async () => [] },
      { getLinks: async () => ({ decks: many }) },
    )

    const result = await run(tool, { client: '31', kinds: ['decks'] })

    expect(result.data?.links).toHaveLength(40)
    expect(result.data?.note).toMatch(/Showing 40 of 45 links/)
  })

  it('explains when the extra link kinds are not wired up', async () => {
    const tool = createClientLinksTool(existing, { getContracts: async () => [] })
    const result = await run(tool, { client: '31', kinds: ['proposals'] })
    expect(result.data).toMatchObject({
      links: [],
      note: 'Links for proposals are not available right now.',
    })
  })

  it('rejects unknown link kinds', () => {
    const tool = createClientLinksTool(existing, { getContracts: async () => [] })
    expect(() => tool.validate?.({ client: '31', kinds: ['billing_portal'] })).toThrow(
      /unknown link kind/,
    )
    expect(() => tool.validate?.({ client: '31', kinds: [] })).toThrow(/at least one/)
  })
})

describe('isSafeClientLinkHref', () => {
  it.each([
    ['/admin/collections/contracts/12', true],
    ['/admin/collections/clients/31', true],
    ['/api/contracts/12/download-pdf', true],
    ['/client/we-can-quit/hub', true],
    ['/client/Odd_Slug.co/hub', true],
    ['/client/a%2Fb/hub', true],
    ['/client/a/b/hub', false],
    ['/client/a:b/hub', false],
    ['/client/../hub', false],
    ['/client/./hub', false],
    ['/client/v1.2/hub', true],
    ['/proposals/we-can-quit', true],
    ['/client/we-can-quit/discovery/007', true],
    ['/client-proposal/wcq/discovery/012', true],
    ['/audits/wcq-seo', true],
    ['/seo-audit-proposals/wcq/v2', true],
    ['/reports/we-can-quit', true],
    ['/negative-keyword-build/wcq-ads', true],
    ['/partners/we-can-quit/google-ads-audit-5/', true],
    ['/admin/collections/google-ads-audits/5', true],
    ['/partners/../admin', false],
    ['/proposals/..', false],
    ['https://evil.example/admin/collections/contracts/12', false],
    ['https://lookerstudio.google.com/r/abc', false],
    ['//evil.example', false],
    ['/\\evil.example', false],
    ['/admin/collections/users/1', false],
    ['javascript:alert(1)', false],
    [42, false],
  ])('%s -> %s', (href, safe) => {
    expect(isSafeClientLinkHref(href)).toBe(safe)
  })
})

describe('toSafeClientLink', () => {
  it.each([
    [
      { label: 'Proposal', href: '/proposals/wcq' },
      { label: 'Proposal', href: '/proposals/wcq' },
    ],
    [
      { label: 'Looker', href: 'https://lookerstudio.google.com/r/abc', external: true },
      { label: 'Looker', href: 'https://lookerstudio.google.com/r/abc', external: true },
    ],
    [{ label: 'Looker', href: 'https://lookerstudio.google.com/r/abc' }, null],
    [{ label: 'Insecure', href: 'http://insecure.example', external: true }, null],
    [{ label: 'Creds', href: 'https://user:pass@evil.example', external: true }, null],
    [{ label: 'Backslash', href: 'https://evil.example\\@good.example', external: true }, null],
    [{ label: 'Script', href: 'javascript:alert(1)', external: true }, null],
    [{ label: '  ', href: '/proposals/wcq' }, null],
    ['not an object', null],
  ])('%j -> %j', (input, expected) => {
    expect(toSafeClientLink(input)).toEqual(expected)
  })
})
