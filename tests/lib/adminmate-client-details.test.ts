import { describe, expect, it, vi } from 'vitest'
import type { Payload } from 'payload'
import {
  buildClientDetails,
  createClientDetailsTool,
  createPayloadClientDetailsReader,
  lexicalToPlainText,
  resolveClient,
  validateClientDetailsArgs,
  projectBudget,
  type ClientBudgetRecord,
  type ClientContractRecord,
  type ClientDetailsExtras,
  type ClientDetailsReader,
  type DiscoveryBriefingRecord,
} from '@/lib/agents/adminmate/client-details'
import type { OptimateClientProfile } from '@/lib/optimate-client-profile'
import type { AdminMateClient } from '@/lib/agents/adminmate/tools'
import type { ToolContext } from '@/lib/agents/_shared/tool'

const existing: AdminMateClient[] = [
  {
    id: '42',
    name: 'EPG engines',
    slug: 'epg',
    websiteUrl: 'https://epgengines.com.au',
    isActive: true,
  },
  { id: '7', name: 'Acme Corp', slug: 'acme-corp', isActive: true },
  { id: '8', name: 'Acme Plumbing', slug: 'acme-plumbing', isActive: false },
]
const epgClient = existing[0] as AdminMateClient

// Shaped like buildOptimateClientProfile output (already sorted newest first).
const profile = {
  id: 42,
  name: 'EPG engines',
  slug: 'epg',
  isActive: true,
  generatedAt: '2026-09-30T00:00:00.000Z',
  groupsReturned: ['timeline', 'notes', 'tracking', 'identity'],
  identity: {
    websiteUrl: 'https://epgengines.com.au',
    websiteType: 'wordpress',
    services: ['google_ads', 'seo'],
    clientType: 'recurring',
    isAgency: false,
  },
  tracking: {
    googleAdsCustomerId: '123-456-7890',
    metaAdAccountId: null,
    ga4PropertyId: null,
    ga4MeasurementId: null,
    ga4Connected: false,
    gscConnected: false,
    gscPropertyUrl: null,
    gtmContainerId: null,
    expectedEvents: null,
    dashboardConversionActions: null,
    phoneCallConversionActions: null,
    formSubmitConversionActions: null,
    conversionActionCategories: [],
  },
  timeline: {
    totalCount: 3,
    returned: 3,
    entries: [
      {
        date: '2026-07-10T12:00:00.000Z',
        serviceArea: 'google_ads',
        actionType: 'other',
        description: 'Google ads campaign went live',
      },
      {
        date: '2026-06-20T12:00:00.000Z',
        serviceArea: 'analytics',
        actionType: 'ga4_setup',
        description: 'Property created',
      },
      {
        date: '2026-06-02T12:00:00.000Z',
        serviceArea: 'contracts',
        actionType: 'scope_changed',
        description: 'Added SEO',
      },
    ],
  },
  notes: {
    totalCount: 2,
    returned: 2,
    items: [
      {
        date: '2026-06-06T00:00:00.000Z',
        author: 'Pete',
        category: 'strategy',
        content: 'Focus on diesel engine rebuilds',
      },
      {
        date: '2026-06-05T00:00:00.000Z',
        author: 'Pete',
        category: 'general',
        content: 'Owner prefers phone calls over email',
      },
    ],
  },
} as unknown as OptimateClientProfile

const extras: ClientDetailsExtras = {
  clientOverview: {
    root: {
      type: 'root',
      children: [
        {
          type: 'paragraph',
          children: [
            { type: 'text', text: 'Family-run ' },
            { type: 'text', text: 'engine specialist.' },
          ],
        },
        {
          type: 'list',
          children: [{ type: 'listitem', children: [{ type: 'text', text: 'Two workshops' }] }],
        },
      ],
    },
  },
  clientPulseNotes: 'Watch spend in winter',
  legacyNotes: null,
  clientPin: '3355',
}

const briefing: DiscoveryBriefingRecord = {
  id: '5',
  title: 'EPG engines',
  updatedAt: '2026-06-03T00:00:00.000Z',
  markdown:
    '# Client Discovery Briefing\n\n## Business Overview\n\nEngine rebuild workshop.\n\n## Google Ads\n\nBudget around $2,000/month, prior agency wasted spend.',
}

// EPG's Budget Management records as stored on live (30 Sep 2026).
const campaign = (
  campaignName: string,
  enabled: boolean,
  budgetPercentage: number,
  actualDailyBudget: number,
  lastPushedAt: string | null,
) => ({
  campaignName,
  adGroupName: null,
  enabled,
  budgetPercentage,
  calculatedDailyBudget: enabled ? 50 : 0,
  actualDailyBudget,
  lastPushedAt,
  standalone: false,
  standaloneBudget: 0,
  standaloneStartDate: null,
  standaloneEndDate: null,
})
const pushed = '2026-07-10T04:41:08.049Z'
const epgBudget: ClientBudgetRecord = {
  auditId: '7',
  monthlyBudget: 3500,
  spendPolicyMonthlyTarget: 3500,
  annualPlaceholders: {
    thisYear: {
      rows: [
        {
          id: 'row-1',
          label: 'Budget',
          values: { jul: 3500, aug: 3500, sep: 3500, oct: 3500, nov: 3500, dec: '' },
        },
      ],
      actualTotals: { jul: 2156, aug: 3470, sep: 2859 },
    },
    lastYear: { rows: [{ id: 'row-2', label: 'Budget', values: {} }], actualTotals: {} },
  },
  legacyAnnualPlaceholders: null,
  campaigns: [
    campaign('Generic_Products', false, 0, 20, null),
    campaign('Brand_Products_Kohler', true, 40, 76.19, pushed),
    campaign('Brand', true, 30, 57.14, pushed),
    campaign('Brand_Products_Lombardini', false, 0, 20, null),
    campaign('Brand_Products_Rehlko', true, 30, 57.14, pushed),
  ],
}
const NOW = new Date('2026-09-30T01:00:00.000Z')

const lexical = (text: string) => ({
  root: { type: 'root', children: [{ type: 'paragraph', children: [{ type: 'text', text }] }] },
})

const epgContract: ClientContractRecord = {
  id: '12',
  title: 'Website Build & Hosting - EPG engines',
  status: 'completed',
  linkedToClient: true,
  clientName: 'EPG engines',
  contractDate: '2026-06-01T00:00:00.000Z',
  contractStartDate: '2026-06-15T00:00:00.000Z',
  contractEndDate: null,
  sentAt: '2026-06-01T03:00:00.000Z',
  agencySignedAt: '2026-06-01T02:00:00.000Z',
  clientSignedAt: '2026-06-02T05:00:00.000Z',
  clientSignerName: 'Eddie Grant',
  currency: 'AUD',
  monthlyRetainer: 1500,
  setupFee: 0,
  hideSetupFee: true,
  monthlyHosting: null,
  annualHosting: 480,
  additionalWork: [{ projectName: 'Website build', amount: 6500, countTowardsRetainer: false }],
  pricingNotes: lexical('Hosting renews each June.'),
  contractTerm: '12 months',
  paymentTerms: 'Net 14',
  scopeOfWork: lexical('Build and host a WordPress site.'),
  paymentTermsOverride: null,
  terminationOverride: null,
  annualReviewEnabled: false,
  annualReviewTierTableText: null,
  hasSignedPdf: true,
  updatedAt: '2026-06-02T05:00:00.000Z',
}

function reader(): ClientDetailsReader & {
  getProfile: ReturnType<typeof vi.fn>
  getExtras: ReturnType<typeof vi.fn>
  getDiscoveryBriefings: ReturnType<typeof vi.fn>
  getBudget: ReturnType<typeof vi.fn>
  getContracts: ReturnType<typeof vi.fn>
} {
  return {
    getProfile: vi.fn(async () => profile),
    // Mirrors the Payload reader: the PIN is only read when asked for.
    getExtras: vi.fn(async (_id: string, { includePin }: { includePin: boolean }) => ({
      ...extras,
      clientPin: includePin ? extras.clientPin : null,
    })),
    getDiscoveryBriefings: vi.fn(async () => [briefing]),
    getBudget: vi.fn(async () => epgBudget),
    getContracts: vi.fn(async () => [epgContract]),
  }
}

const ctx: ToolContext = { agentName: 'AdminMate', agentRunId: 'run-1', context: {}, log: () => {} }

async function run(tool: ReturnType<typeof createClientDetailsTool>, raw: unknown) {
  const args = tool.validate ? tool.validate(raw) : raw
  return tool.execute(args, ctx)
}

describe('get_client_details', () => {
  it('finds when the Google Ads campaign went live from the account timeline, reading only the timeline', async () => {
    const data = reader()
    const tool = createClientDetailsTool(existing, data)

    const result = await run(tool, {
      client: 'EPG',
      sections: ['timeline'],
      search: 'Google Ads campaigns go live',
    })

    expect(result.ok).toBe(true)
    const timeline = (
      result.data as {
        accountTimeline: { searchMatched: boolean; entries: Array<Record<string, unknown>> }
      }
    ).accountTimeline
    expect(timeline.searchMatched).toBe(true)
    expect(timeline.entries[0]).toEqual({
      date: '2026-07-10',
      service: 'Google Ads',
      action: 'Other',
      description: 'Google ads campaign went live',
    })
    expect(data.getProfile).toHaveBeenCalledWith('42', ['timeline'])
    expect(data.getExtras).not.toHaveBeenCalled()
    expect(data.getDiscoveryBriefings).not.toHaveBeenCalled()
    expect(data.getBudget).not.toHaveBeenCalled()
  })

  it("answers EPG's Google Ads budget from the budget section, reading nothing else", async () => {
    const data = reader()
    const tool = createClientDetailsTool(existing, data)

    const result = await run(tool, { client: 'EPG', sections: ['budget'] })

    expect(result.ok).toBe(true)
    expect(result.data).toMatchObject({
      budget: {
        found: true,
        monthlyBudget: 3500,
        enabledCampaignsGoogleAdsDailyTotal: 190.47,
      },
    })
    expect(data.getBudget).toHaveBeenCalledWith('42')
    expect(data.getProfile).not.toHaveBeenCalled()
    expect(data.getExtras).not.toHaveBeenCalled()
    expect(data.getDiscoveryBriefings).not.toHaveBeenCalled()
  })

  it('answers how much hosting was agreed from the contracts section, reading nothing else', async () => {
    const data = reader()
    const tool = createClientDetailsTool(existing, data)

    const result = await run(tool, { client: 'EPG', sections: ['contracts'] })

    expect(result.ok).toBe(true)
    expect(result.data).toMatchObject({
      contracts: {
        found: true,
        count: 1,
        contracts: [
          {
            title: 'Website Build & Hosting - EPG engines',
            status: 'Completed (signed)',
            clientSignedAt: '2026-06-02',
            startDate: '2026-06-15',
            pricing: {
              currency: 'AUD',
              monthlyRetainer: 1500,
              monthlyHosting: null,
              annualHosting: 480,
              setupFeeHiddenOnContract: true,
              additionalWork: [{ project: 'Website build', amount: 6500 }],
              pricingNotes: 'Hosting renews each June.',
            },
            contractTerm: '12 months',
            scopeOfWork: 'Build and host a WordPress site.',
          },
        ],
      },
    })
    expect(data.getContracts).toHaveBeenCalledWith('42', ['EPG engines'])
    expect(data.getProfile).not.toHaveBeenCalled()
    expect(data.getExtras).not.toHaveBeenCalled()
    expect(data.getBudget).not.toHaveBeenCalled()
  })

  it('does not load contracts for a general lookup', async () => {
    const data = reader()
    const tool = createClientDetailsTool(existing, data)

    const all = (await run(tool, { client: 'epg', sections: ['all'] })).data as Record<
      string,
      unknown
    >

    expect(all).not.toHaveProperty('contracts')
    expect(data.getContracts).not.toHaveBeenCalled()
  })

  it('returns only the requested sections and never the PIN unless asked', async () => {
    const data = reader()
    const tool = createClientDetailsTool(existing, data)

    const all = (await run(tool, { client: 'epg', sections: ['all'] })).data as Record<
      string,
      unknown
    >
    expect(all).not.toHaveProperty('access')
    expect(all).toHaveProperty('budget')
    expect(JSON.stringify(all)).not.toContain('3355')
    expect(data.getExtras).toHaveBeenLastCalledWith('42', { includePin: false })

    const onlyTracking = (await run(tool, { client: '42', sections: ['tracking'] })).data as Record<
      string,
      unknown
    >
    expect(Object.keys(onlyTracking).sort()).toEqual(['client', 'sectionsReturned', 'tracking'])
    expect(onlyTracking.tracking).toMatchObject({
      googleAdsCustomerIdSet: true,
      googleAdsCustomerId: '123-456-7890',
    })

    data.getProfile.mockClear()
    const access = (await run(tool, { client: '42', sections: ['access'] })).data as {
      access: unknown
    }
    expect(access.access).toEqual({ clientHubPin: '3355' })
    expect(data.getExtras).toHaveBeenLastCalledWith('42', { includePin: true })
    expect(data.getProfile).not.toHaveBeenCalled()
  })

  it('returns discovery briefing sections that match the search', async () => {
    const data = reader()
    const tool = createClientDetailsTool(existing, data)

    const result = await run(tool, {
      client: 'EPG engines',
      sections: ['discovery_briefing'],
      search: 'budget',
    })

    const discovery = (
      result.data as {
        discoveryBriefing: { found: boolean; briefings: Array<Record<string, unknown>> }
      }
    ).discoveryBriefing
    expect(discovery.found).toBe(true)
    expect(discovery.briefings[0]?.matchingSections).toContain('Budget around $2,000/month')
    expect(discovery.briefings[0]?.matchingSections).not.toContain('Engine rebuild workshop')
    expect(data.getDiscoveryBriefings).toHaveBeenCalledWith('42')
    expect(data.getProfile).not.toHaveBeenCalled()
  })

  it('asks for a choice when several clients match and errors when none do or the record is gone', async () => {
    const data = reader()
    const tool = createClientDetailsTool(existing, data)

    const ambiguous = await run(tool, { client: 'acme', sections: ['notes'] })
    expect(ambiguous.data).toMatchObject({ needsClientChoice: true })
    expect((ambiguous.data as { candidates: unknown[] }).candidates).toHaveLength(2)

    expect((await run(tool, { client: 'Nobody Pty', sections: ['notes'] })).ok).toBe(false)

    data.getProfile.mockResolvedValueOnce(null)
    expect((await run(tool, { client: 'epg', sections: ['timeline'] })).ok).toBe(false)
  })

  it('rejects unknown sections and missing clients', () => {
    expect(() => validateClientDetailsArgs({ client: 'epg', sections: ['passwords'] })).toThrow(
      /unknown section/,
    )
    expect(() => validateClientDetailsArgs({ client: '', sections: ['notes'] })).toThrow(/client/)
    expect(() => validateClientDetailsArgs({ client: 'epg', sections: [] })).toThrow(/sections/)
  })
})

describe('buildClientDetails', () => {
  const source = { client: epgClient, profile, extras, briefings: [] }

  it('uses the CMS labels the admin sees in the Account Timeline', () => {
    const out = buildClientDetails(source, ['timeline']) as {
      accountTimeline: { entries: Array<{ service: string; action: string }> }
    }
    expect(out.accountTimeline.entries.map((entry) => [entry.service, entry.action])).toEqual([
      ['Google Ads', 'Other'],
      ['Analytics / Tracking', 'GA4 Setup / Migration'],
      ['Contracts / Legal', 'Scope of Work Changed'],
    ])
  })

  it('falls back to every entry when the search matches nothing', () => {
    const out = buildClientDetails(source, ['timeline'], 'hosting renewal') as {
      accountTimeline: { searchMatched: boolean; entries: unknown[] }
    }
    expect(out.accountTimeline.searchMatched).toBe(false)
    expect(out.accountTimeline.entries).toHaveLength(3)
  })

  it('flags timeline rows beyond the loaded window', () => {
    const busy = {
      ...profile,
      timeline: { ...profile.timeline, totalCount: 60 },
    } as OptimateClientProfile
    const out = buildClientDetails({ ...source, profile: busy }, ['timeline']) as {
      accountTimeline: Record<string, unknown>
    }
    expect(out.accountTimeline.olderEntriesNotLoaded).toBe(57)
  })

  it("includes client notes, pulse notes and the 'Who is this client?' overview", () => {
    const out = buildClientDetails(source, ['notes', 'business']) as {
      notes: { clientNotes: Array<{ content: string }>; clientPulseLeadershipNotes: string }
      business: { whoIsThisClient: string; identity: { services: string[] } }
    }
    expect(out.notes.clientNotes.map((note) => note.content)).toEqual([
      'Focus on diesel engine rebuilds',
      'Owner prefers phone calls over email',
    ])
    expect(out.notes.clientPulseLeadershipNotes).toBe('Watch spend in winter')
    expect(out.business.whoIsThisClient).toBe('Family-run engine specialist.\n- Two workshops')
    expect(out.business.identity.services).toEqual(['Google Ads', 'SEO'])
  })
})

describe('projectBudget', () => {
  it('lists campaigns enabled-first with their share and Google Ads daily budget', () => {
    const out = projectBudget(epgBudget, NOW) as { campaigns: Array<Record<string, unknown>> }
    expect(out.campaigns.map((c) => [c.campaign, c.enabled, c.googleAdsDailyBudget])).toEqual([
      ['Brand', true, 57.14],
      ['Brand_Products_Kohler', true, 76.19],
      ['Brand_Products_Rehlko', true, 57.14],
      ['Brand_Products_Lombardini', false, 20],
      ['Generic_Products', false, 20],
    ])
    expect(out.campaigns[1]).toEqual({
      campaign: 'Brand_Products_Kohler',
      enabled: true,
      shareOfMonthlyBudgetPercent: 40,
      plannedDailyBudget: 50,
      googleAdsDailyBudget: 76.19,
      lastPushedToGoogleAds: '2026-07-10',
    })
  })

  it('shows budget vs actual by month for this financial year, skipping empty months and years', () => {
    const out = projectBudget(epgBudget, NOW) as { budgetVsActualByMonth: unknown }
    expect(out.budgetVsActualByMonth).toEqual([
      {
        financialYear: 'This FY (2026/27)',
        months: [
          { month: 'Jul 2026', budget: 3500, actualSpend: 2156 },
          { month: 'Aug 2026', budget: 3500, actualSpend: 3470 },
          { month: 'Sep 2026', budget: 3500, actualSpend: 2859 },
          { month: 'Oct 2026', budget: 3500, actualSpend: null },
          { month: 'Nov 2026', budget: 3500, actualSpend: null },
        ],
      },
    ])
  })

  it('uses the Sydney date for the financial year and labels January with the next calendar year', () => {
    // 30 Jun 2027 15:00 UTC is 1 Jul 2027 in Sydney: the new financial year.
    const record: ClientBudgetRecord = {
      ...epgBudget,
      annualPlaceholders: {
        thisYear: { rows: [{ id: 'r', label: 'Budget', values: { jan: 4000 } }], actualTotals: {} },
        lastYear: { rows: [], actualTotals: {} },
      },
    }
    const out = projectBudget(record, new Date('2027-06-30T15:00:00.000Z')) as {
      budgetVsActualByMonth: Array<{ financialYear: string; months: Array<{ month: string }> }>
    }
    expect(out.budgetVsActualByMonth[0]?.financialYear).toBe('This FY (2027/28)')
    expect(out.budgetVsActualByMonth[0]?.months[0]?.month).toBe('Jan 2028')
  })

  it('says so when no budget is set up or it could not be loaded', () => {
    const empty: ClientBudgetRecord = {
      auditId: null,
      monthlyBudget: null,
      spendPolicyMonthlyTarget: null,
      annualPlaceholders: null,
      legacyAnnualPlaceholders: null,
      campaigns: [],
    }
    expect(projectBudget(empty, NOW)).toEqual({
      found: false,
      note: 'No Google Ads budget is set up in Budget Management for this client.',
    })
    expect(projectBudget(null, NOW)).toEqual({
      found: false,
      note: 'Budget data could not be loaded.',
    })
  })
})

describe('createPayloadClientDetailsReader', () => {
  const payloadWith = (doc: Record<string, unknown>) => ({
    findByID: vi.fn(async () => doc),
    find: vi.fn(async () => ({ docs: [] })),
  })

  it('only returns the stored PIN when it is asked for', async () => {
    const payload = payloadWith({
      id: 42,
      clientPin: ' 3355 ',
      legacyNotes: '',
      clientPulse: { notes: ' Watch spend ' },
    })
    const data = createPayloadClientDetailsReader(payload as unknown as Payload)

    expect(await data.getExtras('42', { includePin: false })).toMatchObject({
      clientPin: null,
      clientPulseNotes: 'Watch spend',
      legacyNotes: null,
    })
    expect(await data.getExtras('42', { includePin: true })).toMatchObject({ clientPin: '3355' })
    expect(payload.findByID).toHaveBeenCalledWith(
      expect.objectContaining({ collection: 'clients', id: 42, overrideAccess: true }),
    )
  })

  it('rejects non-numeric ids without querying', async () => {
    const payload = payloadWith({})
    const data = createPayloadClientDetailsReader(payload as unknown as Payload)

    expect(await data.getExtras('42 OR 1=1', { includePin: true })).toBeNull()
    expect(await data.getDiscoveryBriefings('abc')).toEqual([])
    expect(await data.getBudget('abc')).toBeNull()
    expect(payload.findByID).not.toHaveBeenCalled()
    expect(payload.find).not.toHaveBeenCalled()
  })
})

describe('createPayloadClientDetailsReader getBudget', () => {
  it("reads the client's newest audit and that audit's campaign budgets", async () => {
    const find = vi.fn(async ({ collection }: { collection: string }) =>
      collection === 'google-ads-audits'
        ? { docs: [{ id: 7, monthlyBudget: 3500, annualBudgetPlaceholders: null }] }
        : {
            docs: [
              {
                campaignName: 'Brand',
                adGroupName: '',
                enabled: true,
                budgetPercentage: 30,
                calculatedDailyBudget: 50,
                actualDailyBudget: 57.14,
                lastPushedAt: pushed,
                standalone: false,
                standaloneBudget: 0,
              },
            ],
          },
    )
    const findByID = vi.fn(async () => ({
      spendPolicy: { monthlyBudgetTarget: 3500 },
      annualClientBudgetPlaceholders: { thisYear: {} },
    }))
    const data = createPayloadClientDetailsReader({ find, findByID } as unknown as Payload)

    const budget = await data.getBudget('42')

    expect(budget).toMatchObject({
      auditId: '7',
      monthlyBudget: 3500,
      spendPolicyMonthlyTarget: 3500,
      campaigns: [{ campaignName: 'Brand', adGroupName: null, actualDailyBudget: 57.14 }],
    })
    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'google-ads-audits',
        where: { client: { equals: 42 } },
        sort: '-createdAt',
        limit: 1,
      }),
    )
    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'google-ads-campaign-budgets',
        where: { audit: { equals: 7 } },
      }),
    )
  })

  it('returns an empty record when the client has no audit, and null when loading fails', async () => {
    const find = vi.fn(async () => ({ docs: [] }))
    const findByID = vi.fn(async () => ({ spendPolicy: {}, annualClientBudgetPlaceholders: null }))
    const data = createPayloadClientDetailsReader({ find, findByID } as unknown as Payload)
    expect(await data.getBudget('42')).toEqual({
      auditId: null,
      monthlyBudget: null,
      spendPolicyMonthlyTarget: null,
      annualPlaceholders: null,
      legacyAnnualPlaceholders: null,
      campaigns: [],
    })
    expect(find).toHaveBeenCalledTimes(1)

    findByID.mockRejectedValueOnce(new Error('database is locked'))
    expect(await data.getBudget('42')).toBeNull()
  })
})

describe('createPayloadClientDetailsReader getContracts', () => {
  const doc = (overrides: Record<string, unknown>) => ({
    id: 1,
    contractTitle: 'Agreement',
    status: 'completed',
    isTemplate: false,
    client: null,
    clientName: 'Someone Else',
    monthlyHosting: 40,
    additionalWork: [],
    signingToken: 'secret-token',
    clientSignedIp: '10.0.0.1',
    ...overrides,
  })

  it('returns linked contracts and exact-name unlinked ones, skipping templates and loose matches', async () => {
    const find = vi.fn(async () => ({
      docs: [
        doc({ id: 1, client: 42 }),
        doc({ id: 2, clientName: 'EPG Engines' }),
        doc({ id: 3, clientName: 'EPG engines spare parts' }),
        doc({ id: 4, client: 42, isTemplate: true }),
        doc({ id: 5, client: 99, clientName: 'EPG engines' }),
      ],
    }))
    const data = createPayloadClientDetailsReader({ find } as unknown as Payload)

    const contracts = await data.getContracts('42', ['EPG engines'])

    expect(contracts?.map((c) => [c.id, c.linkedToClient])).toEqual([
      ['1', true],
      ['2', false],
    ])
    expect(contracts?.[0]?.monthlyHosting).toBe(40)
    expect(contracts?.[0]?.hasSignedPdf).toBe(false)
    expect(JSON.stringify(contracts)).not.toContain('secret-token')
    expect(JSON.stringify(contracts)).not.toContain('10.0.0.1')
    const query = (find.mock.calls[0] as unknown as [{ collection: string; select: Record<string, unknown> }])[0]
    expect(query.collection).toBe('contracts')
    expect(query.select).not.toHaveProperty('signingToken')
    expect(query.select).not.toHaveProperty('clientSignature')
  })

  it('returns null when loading fails or the id is not numeric', async () => {
    const find = vi.fn(async () => {
      throw new Error('database is locked')
    })
    const data = createPayloadClientDetailsReader({ find } as unknown as Payload)
    expect(await data.getContracts('42', ['EPG'])).toBeNull()
    expect(await data.getContracts('abc', ['EPG'])).toBeNull()
    expect(find).toHaveBeenCalledTimes(1)
  })
})

describe('resolveClient', () => {
  it('prefers exact id, slug and name matches', () => {
    expect(resolveClient('7', existing)).toMatchObject({ kind: 'found', client: { id: '7' } })
    expect(resolveClient('EPG', existing)).toMatchObject({ kind: 'found', client: { id: '42' } })
    expect(resolveClient('acme corp', existing)).toMatchObject({
      kind: 'found',
      client: { id: '7' },
    })
  })

  it('returns empty text for empty rich text', () => {
    expect(lexicalToPlainText(null)).toBe('')
  })
})
