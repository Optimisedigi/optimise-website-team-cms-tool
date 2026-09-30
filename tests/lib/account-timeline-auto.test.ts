import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createClient, type Client as LibsqlClient } from '@libsql/client'
import type { Payload } from 'payload'
import {
  addClientTimelineEntries,
  adCopyTimelineEntry,
  appendTimelineEntries,
  campaignProposalTimelineEntries,
  clientTimelineEntries,
  contractTimelineEntries,
  deferTimelineEntries,
  resolveTimelineOwner,
  seoMigrationTimelineEntries,
  timelineDate,
  timelineDay,
  withTimelineEntries,
} from '@/lib/account-timeline-auto'
import {
  ACCOUNT_TIMELINE_ACTION_TYPE_OPTIONS,
  ACCOUNT_TIMELINE_SERVICE_AREA_OPTIONS,
} from '@/lib/client-field-options'
import { Contracts } from '@/collections/Contracts'
import { GoogleAdsAudits } from '@/collections/GoogleAdsAudits'
import { SeoMigrationChecks } from '@/collections/SeoMigrationChecks'

// 30 Sep 2026, 9pm UTC = 1 Oct 2026, 7am in Sydney (AEST, UTC+10).
const NOW = new Date('2026-09-30T21:00:00.000Z')

const actionValues = new Set<string>(ACCOUNT_TIMELINE_ACTION_TYPE_OPTIONS.map((o) => o.value))
const serviceValues = new Set<string>(ACCOUNT_TIMELINE_SERVICE_AREA_OPTIONS.map((o) => o.value))

describe('timeline dates', () => {
  it('uses the Sydney calendar day and stores midday Sydney', () => {
    expect(timelineDay(NOW)).toBe('2026-10-01')
    expect(timelineDay('2026-07-10')).toBe('2026-07-10')
    expect(timelineDay('not a date')).toBeNull()
    expect(timelineDate('2026-07-10', NOW)).toBe('2026-07-10T02:00:00.000Z')
    expect(timelineDate(null, NOW)).toBe('2026-10-01T02:00:00.000Z')
  })
})

describe('resolveTimelineOwner', () => {
  it('prefers the client, falls back to the proposal, ignores junk', () => {
    expect(resolveTimelineOwner({ client: { id: 42 }, proposal: 9 })).toEqual({
      collection: 'clients',
      id: 42,
    })
    expect(resolveTimelineOwner({ client: null, proposal: '9' })).toEqual({
      collection: 'client-proposals',
      id: 9,
    })
    expect(resolveTimelineOwner({ client: 'abc' })).toBeNull()
    expect(resolveTimelineOwner(undefined)).toBeNull()
  })
})

describe('contractTimelineEntries', () => {
  const base = { contractTitle: 'Google Ads Retainer', client: 42 }

  it('records the contract being sent', () => {
    const entries = contractTimelineEntries(
      { ...base, status: 'sent', sentAt: '2026-09-29T23:30:00.000Z' },
      { ...base, status: 'draft' },
      NOW,
    )
    expect(entries).toEqual([
      {
        date: '2026-09-30T02:00:00.000Z',
        serviceArea: 'contracts',
        actionType: 'contract_sent',
        description: 'Contract sent to client: Google Ads Retainer',
      },
    ])
  })

  it('records the contract being signed, with the signer', () => {
    const entries = contractTimelineEntries(
      {
        ...base,
        status: 'completed',
        sentAt: '2026-09-20T00:00:00.000Z',
        clientSignedAt: '2026-09-30T01:00:00.000Z',
        clientSignerName: 'Jo Smith',
      },
      { ...base, status: 'sent', sentAt: '2026-09-20T00:00:00.000Z' },
      NOW,
    )
    expect(entries).toEqual([
      expect.objectContaining({
        actionType: 'contract_signed',
        date: '2026-09-30T02:00:00.000Z',
        description: 'Contract signed by Jo Smith: Google Ads Retainer',
      }),
    ])
  })

  it('records sent and signed history when a signed contract is first linked', () => {
    const signed = {
      ...base,
      status: 'completed',
      sentAt: '2026-09-20T00:00:00.000Z',
      clientSignedAt: '2026-09-22T00:00:00.000Z',
    }
    const entries = contractTimelineEntries(signed, { ...signed, client: null }, NOW)
    expect(entries.map((e) => e.actionType)).toEqual(['contract_sent', 'contract_signed'])
  })

  it('ignores unrelated saves, drafts, templates and trashed contracts', () => {
    const sent = { ...base, status: 'sent', sentAt: '2026-09-20T00:00:00.000Z' }
    expect(contractTimelineEntries(sent, sent, NOW)).toEqual([])
    expect(contractTimelineEntries({ ...base, status: 'draft' }, undefined, NOW)).toEqual([])
    expect(
      contractTimelineEntries({ ...sent, isTemplate: true }, { ...base, status: 'draft' }, NOW),
    ).toEqual([])
    expect(
      contractTimelineEntries(
        { ...sent, deletedAt: '2026-09-21' },
        { ...base, status: 'draft' },
        NOW,
      ),
    ).toEqual([])
  })
})

describe('clientTimelineEntries', () => {
  it('records client creation and the first Google Ads account link', () => {
    expect(clientTimelineEntries('create', {}, undefined, NOW).map((e) => e.actionType)).toEqual([
      'client_created',
    ])
    expect(
      clientTimelineEntries('create', { googleAdsCustomerId: '123-456-7890' }, undefined, NOW).map(
        (e) => e.actionType,
      ),
    ).toEqual(['client_created', 'google_ads_account_linked'])

    const linked = clientTimelineEntries(
      'update',
      { googleAdsCustomerId: ' 123-456-7890 ' },
      { googleAdsCustomerId: '' },
      NOW,
    )
    expect(linked).toEqual([
      {
        date: '2026-10-01T02:00:00.000Z',
        serviceArea: 'google_ads',
        actionType: 'google_ads_account_linked',
        description: 'Google Ads account linked (customer ID 123-456-7890)',
      },
    ])
  })

  it('does not record ID changes, unrelated updates or removals', () => {
    expect(
      clientTimelineEntries(
        'update',
        { googleAdsCustomerId: '999' },
        { googleAdsCustomerId: '123' },
        NOW,
      ),
    ).toEqual([])
    expect(
      clientTimelineEntries('update', { name: 'x' } as never, { googleAdsCustomerId: '123' }, NOW),
    ).toEqual([])
    expect(
      clientTimelineEntries(
        'update',
        { googleAdsCustomerId: '' },
        { googleAdsCustomerId: '123' },
        NOW,
      ),
    ).toEqual([])
  })
})

describe('addClientTimelineEntries (Clients beforeChange)', () => {
  const run = (args: Record<string, unknown>) =>
    addClientTimelineEntries({
      collection: {} as never,
      context: {},
      req: {} as never,
      ...args,
    } as never) as Record<string, unknown>

  it('adds the created entry to a new client', () => {
    const data = run({ operation: 'create', data: { name: 'EPG engines' } })
    expect(data.accountTimeline).toEqual([
      expect.objectContaining({ actionType: 'client_created', addedBy: 'Automatic' }),
    ])
  })

  it('keeps existing rows (with their ids) when the ID is linked by a partial update', () => {
    const existing = {
      id: 'row-1',
      date: '2026-07-10T02:00:00.000Z',
      serviceArea: 'google_ads',
      actionType: 'other',
      description: 'Google ads campaign went live',
    }
    const data = run({
      operation: 'update',
      data: { googleAdsCustomerId: '123-456-7890' },
      originalDoc: { googleAdsCustomerId: null, accountTimeline: [existing] },
    })
    expect(data.accountTimeline).toEqual([
      existing,
      expect.objectContaining({ actionType: 'google_ads_account_linked' }),
    ])
  })

  it('appends to the rows submitted by the admin form', () => {
    const submitted = [
      {
        date: '2026-09-01T02:00:00.000Z',
        serviceArea: 'seo',
        actionType: 'other',
        description: 'New row',
      },
    ]
    const data = run({
      operation: 'update',
      data: { googleAdsCustomerId: '123', accountTimeline: submitted },
      originalDoc: { googleAdsCustomerId: '', accountTimeline: [] },
    })
    expect(data.accountTimeline).toHaveLength(2)
  })

  it('leaves unrelated updates alone', () => {
    const data = run({
      operation: 'update',
      data: { name: 'x' },
      originalDoc: { googleAdsCustomerId: '123' },
    })
    expect(data).not.toHaveProperty('accountTimeline')
  })
})

describe('campaign proposal, ad copy and SEO migration entries', () => {
  it('records a campaign structure proposal when it completes', () => {
    const doc = {
      campaignProposalStatus: 'completed',
      campaignProposalGeneratedAt: '2026-09-30T05:00:00.000Z',
      campaignProposal: JSON.stringify({
        proposedCampaigns: [{ adGroups: [{}, {}] }, { adGroups: [{}] }],
      }),
    }
    expect(
      campaignProposalTimelineEntries(doc, { campaignProposalStatus: 'running' }, NOW),
    ).toEqual([
      {
        date: '2026-09-30T02:00:00.000Z',
        serviceArea: 'google_ads',
        actionType: 'campaign_structure_proposed',
        description: 'Google Ads campaign structure proposed: 2 campaigns, 3 ad groups',
      },
    ])
    expect(
      campaignProposalTimelineEntries(doc, { campaignProposalStatus: 'completed' }, NOW),
    ).toEqual([])
    expect(
      campaignProposalTimelineEntries(
        { campaignProposalStatus: 'failed' },
        { campaignProposalStatus: 'running' },
        NOW,
      ),
    ).toEqual([])
  })

  it('describes generated ad copy', () => {
    const entry = adCopyTimelineEntry(
      { Search: { Parts: {}, Engines: {} }, Brand: { Brand: {} } },
      NOW,
    )
    expect(entry).toEqual({
      date: '2026-10-01T02:00:00.000Z',
      serviceArea: 'google_ads',
      actionType: 'ad_copy_generated',
      description: 'Google Ads ad copy generated for 3 ad groups across 2 campaigns',
    })
  })

  it('records an SEO migration date on the cutover day, once per date', () => {
    const doc = { cutoverDate: '2026-10-15T00:00:00.000Z', siteUrl: 'sc-domain:epgengines.com.au' }
    expect(seoMigrationTimelineEntries(doc, undefined, NOW)).toEqual([
      {
        date: '2026-10-15T02:00:00.000Z',
        serviceArea: 'seo',
        actionType: 'site_migration',
        description: 'SEO migration date set for epgengines.com.au: website cutover on 2026-10-15',
      },
    ])
    expect(seoMigrationTimelineEntries(doc, doc, NOW)).toEqual([])
    expect(
      seoMigrationTimelineEntries({ ...doc, cutoverDate: '2026-10-20T00:00:00.000Z' }, doc, NOW),
    ).toHaveLength(1)
  })

  it('only produces values the CMS timeline selects accept', () => {
    const entries = [
      ...clientTimelineEntries('create', { googleAdsCustomerId: '1' }, undefined, NOW),
      ...contractTimelineEntries(
        { status: 'completed', sentAt: '2026-09-01', client: 1 },
        { status: 'completed' },
        NOW,
      ),
      ...campaignProposalTimelineEntries({ campaignProposalStatus: 'completed' }, {}, NOW),
      adCopyTimelineEntry({}, NOW),
      ...seoMigrationTimelineEntries({ cutoverDate: '2026-10-15' }, undefined, NOW),
    ]
    expect(entries.length).toBeGreaterThanOrEqual(7)
    for (const entry of entries) {
      expect(actionValues.has(entry.actionType)).toBe(true)
      expect(serviceValues.has(entry.serviceArea)).toBe(true)
    }
  })
})

describe('withTimelineEntries', () => {
  it('skips entries already on the timeline for the same day', () => {
    const entry = adCopyTimelineEntry({ A: { B: {} } }, NOW)
    expect(withTimelineEntries([{ ...entry, id: 'x' }], [entry])).toHaveLength(1)
    expect(withTimelineEntries([], [entry, entry])).toHaveLength(1)
  })
})

describe('appendTimelineEntries (real SQLite)', () => {
  let db: LibsqlClient
  let payload: Payload

  beforeEach(async () => {
    db = createClient({ url: ':memory:' })
    await db.execute('CREATE TABLE clients (id integer PRIMARY KEY)')
    await db.execute('INSERT INTO clients (id) VALUES (42)')
    await db.execute(`CREATE TABLE client_account_timeline (
      _order integer NOT NULL, _parent_id integer NOT NULL, id text PRIMARY KEY NOT NULL,
      date text NOT NULL, service_area text DEFAULT 'google_ads', action_type text NOT NULL,
      description text NOT NULL, added_by text)`)
    await db.execute(`INSERT INTO client_account_timeline VALUES
      (1, 42, 'existing-row', '2026-07-10T02:00:00.000Z', 'google_ads', 'other', 'Google ads campaign went live', NULL)`)
    payload = { db: { client: db } } as unknown as Payload
  })

  afterEach(() => db.close())

  it('appends after existing rows without touching them, and skips duplicates', async () => {
    const owner = { collection: 'clients', id: 42 } as const
    const entry = contractTimelineEntries(
      {
        status: 'sent',
        contractTitle: 'SEO Retainer',
        sentAt: '2026-09-30T01:00:00.000Z',
        client: 42,
      },
      { status: 'draft', client: 42 },
      NOW,
    )

    expect(await appendTimelineEntries(payload, owner, entry)).toBe(1)
    expect(await appendTimelineEntries(payload, owner, entry)).toBe(0)

    const rows = await db.execute(
      'SELECT _order, id, date, service_area, action_type, description, added_by FROM client_account_timeline ORDER BY _order',
    )
    expect(rows.rows.map((row) => ({ ...row }))).toEqual([
      expect.objectContaining({
        _order: 1,
        id: 'existing-row',
        description: 'Google ads campaign went live',
      }),
      expect.objectContaining({
        _order: 2,
        id: expect.stringMatching(/^[0-9a-f]{24}$/),
        date: '2026-09-30T02:00:00.000Z',
        service_area: 'contracts',
        action_type: 'contract_sent',
        description: 'Contract sent to client: SEO Retainer',
        added_by: 'Automatic',
      }),
    ])
  })

  it('fails loudly for a client that does not exist', async () => {
    await db.execute('PRAGMA foreign_keys = ON')
    await db.execute('DROP TABLE client_account_timeline')
    await db.execute(`CREATE TABLE client_account_timeline (
      _order integer NOT NULL, _parent_id integer NOT NULL REFERENCES clients(id), id text PRIMARY KEY NOT NULL,
      date text NOT NULL, service_area text, action_type text NOT NULL, description text NOT NULL, added_by text)`)
    await expect(
      appendTimelineEntries(payload, { collection: 'clients', id: 999 }, [
        adCopyTimelineEntry({}, NOW),
      ]),
    ).rejects.toThrow()
  })
})

describe('collection hooks schedule timeline entries after the save', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  function fakePayload() {
    const execute = vi.fn(async (_query: { sql: string; args: Array<string | number> }) => ({
      rowsAffected: 1,
    }))
    const payload = {
      db: { client: { execute } },
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    }
    return { payload, execute }
  }

  it('Contracts: signing adds a contract_signed row to the linked client', async () => {
    const { payload, execute } = fakePayload()
    const hooks = Contracts.hooks?.afterChange ?? []
    const doc = {
      id: 5,
      status: 'completed',
      contractTitle: 'Retainer',
      client: 42,
      clientSignedAt: '2026-09-30T01:00:00.000Z',
    }
    for (const hook of hooks) {
      await hook({
        doc,
        previousDoc: { ...doc, status: 'sent' },
        operation: 'update',
        req: { payload, context: {} },
      } as never)
    }
    expect(execute).not.toHaveBeenCalledWith(
      expect.objectContaining({ sql: expect.stringContaining('client_account_timeline') }),
    )

    await vi.runAllTimersAsync()

    const insert = execute.mock.calls.find(([q]) => q.sql.includes('client_account_timeline'))
    expect(insert?.[0].args).toEqual(
      expect.arrayContaining([42, 'contract_signed', 'Contract signed: Retainer']),
    )
  })

  it('GoogleAdsAudits: a completed campaign proposal on a prospect goes to the proposal timeline', async () => {
    const { payload, execute } = fakePayload()
    const hook = (GoogleAdsAudits.hooks?.afterChange ?? []).at(-1)
    await hook?.({
      doc: { id: 3, proposal: { id: 9 }, campaignProposalStatus: 'completed' },
      previousDoc: { campaignProposalStatus: 'running' },
      operation: 'update',
      req: { payload, context: {} },
    } as never)
    await vi.runAllTimersAsync()

    const insert = execute.mock.calls.find(([q]) =>
      q.sql.includes('client_proposals_account_timeline'),
    )
    expect(insert?.[0].args).toEqual(expect.arrayContaining([9, 'campaign_structure_proposed']))
  })

  it('SeoMigrationChecks: creating a review with a cutover date adds a site_migration row', async () => {
    const { payload, execute } = fakePayload()
    const hooks = SeoMigrationChecks.hooks?.afterChange ?? []
    expect(hooks).toHaveLength(1)
    await hooks[0]?.({
      doc: {
        id: 1,
        client: 42,
        cutoverDate: '2026-10-15T00:00:00.000Z',
        siteUrl: 'https://epgengines.com.au/',
      },
      previousDoc: undefined,
      operation: 'create',
      req: { payload, context: {} },
    } as never)
    await vi.runAllTimersAsync()

    const insert = execute.mock.calls.find(([q]) => q.sql.includes('client_account_timeline'))
    expect(insert?.[0].args).toEqual(
      expect.arrayContaining([42, 'site_migration', '2026-10-15T02:00:00.000Z']),
    )
  })

  it('a timeline failure is logged, never thrown into the save', async () => {
    const { payload, execute } = fakePayload()
    execute.mockRejectedValueOnce(new Error('database is locked'))
    deferTimelineEntries(
      payload as unknown as Payload,
      { collection: 'clients', id: 42 },
      [adCopyTimelineEntry({}, NOW)],
      'test',
    )
    await vi.runAllTimersAsync()
    expect(payload.logger.warn).toHaveBeenCalledWith(expect.stringContaining('database is locked'))
  })
})
