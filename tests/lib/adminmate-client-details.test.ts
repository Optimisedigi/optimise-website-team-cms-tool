import { describe, expect, it, vi } from 'vitest'
import type { Payload } from 'payload'
import {
  buildClientDetails,
  createClientDetailsTool,
  createPayloadClientDetailsReader,
  lexicalToPlainText,
  resolveClient,
  validateClientDetailsArgs,
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

function reader(): ClientDetailsReader & {
  getProfile: ReturnType<typeof vi.fn>
  getExtras: ReturnType<typeof vi.fn>
  getDiscoveryBriefings: ReturnType<typeof vi.fn>
} {
  return {
    getProfile: vi.fn(async () => profile),
    // Mirrors the Payload reader: the PIN is only read when asked for.
    getExtras: vi.fn(async (_id: string, { includePin }: { includePin: boolean }) => ({
      ...extras,
      clientPin: includePin ? extras.clientPin : null,
    })),
    getDiscoveryBriefings: vi.fn(async () => [briefing]),
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
  })

  it('returns only the requested sections and never the PIN unless asked', async () => {
    const data = reader()
    const tool = createClientDetailsTool(existing, data)

    const all = (await run(tool, { client: 'epg', sections: ['all'] })).data as Record<
      string,
      unknown
    >
    expect(all).not.toHaveProperty('access')
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
    expect(payload.findByID).not.toHaveBeenCalled()
    expect(payload.find).not.toHaveBeenCalled()
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
