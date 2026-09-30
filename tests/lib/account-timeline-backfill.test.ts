import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createClient, type Client as LibsqlClient } from '@libsql/client'
import type { Payload } from 'payload'
import {
  applyTimelineBackfill,
  BACKFILL_ADDED_BY,
  planTimelineBackfill,
  type BackfillSource,
} from '@/lib/account-timeline-backfill'

function source(overrides: Partial<BackfillSource> = {}): BackfillSource {
  return {
    clients: [
      { id: 42, name: 'EPG engines', createdAt: '2026-06-01T03:00:00.000Z' },
      { id: 43, name: 'Acme', createdAt: '2026-05-01T03:00:00.000Z' },
    ],
    proposals: [
      { id: 9, businessName: 'Converted Co', client: 43 },
      { id: 10, businessName: 'Prospect Pty', client: null },
    ],
    contracts: [],
    audits: [],
    migrations: [],
    existing: [],
    ...overrides,
  }
}

const actions = (plan: ReturnType<typeof planTimelineBackfill>, id: number) =>
  plan.owners
    .find((owner) => owner.id === id)
    ?.entries.map((entry) => `${entry.date.slice(0, 10)} ${entry.actionType}`)

describe('planTimelineBackfill', () => {
  it('adds client-created entries on the Sydney day the client was created, marked as backfill', () => {
    const plan = planTimelineBackfill(source())
    expect(actions(plan, 42)).toEqual(['2026-06-01 client_created'])
    expect(
      plan.owners.every((owner) =>
        owner.entries.every((entry) => entry.addedBy === BACKFILL_ADDED_BY),
      ),
    ).toBe(true)
  })

  it('adds sent and signed history for contracts (templates that were really sent included), skipping drafts and trashed ones', () => {
    const plan = planTimelineBackfill(
      source({
        contracts: [
          {
            id: 1,
            status: 'completed',
            contractTitle: 'Retainer',
            sentAt: '2026-06-10T01:00:00.000Z',
            clientSignedAt: '2026-06-12T01:00:00.000Z',
            clientSignerName: 'Jo',
            client: 42,
          },
          {
            // Sent to the client, then ticked "template" for reuse (EPG's case).
            id: 2,
            status: 'sent',
            contractTitle: 'Agreement also used as template',
            sentAt: '2026-06-17T01:14:49.859Z',
            isTemplate: true,
            client: 42,
          },
          {
            id: 3,
            status: 'sent',
            contractTitle: 'Trashed',
            sentAt: '2026-06-10T01:00:00.000Z',
            deletedAt: '2026-06-11',
            client: 42,
          },
          { id: 4, status: 'draft', contractTitle: 'Draft', client: 42 },
        ],
      }),
    )
    expect(actions(plan, 42)).toEqual([
      '2026-06-01 client_created',
      '2026-06-10 contract_sent',
      '2026-06-12 contract_signed',
      '2026-06-17 contract_sent',
    ])
    const signed = plan.owners
      .find((owner) => owner.id === 42)
      ?.entries.find((entry) => entry.actionType === 'contract_signed')
    expect(signed?.description).toBe('Contract signed by Jo: Retainer')
  })

  it("sends a converted proposal's events to its client and an open prospect's to the prospect timeline", () => {
    const plan = planTimelineBackfill(
      source({
        contracts: [
          {
            id: 5,
            status: 'sent',
            contractTitle: 'Converted deal',
            sentAt: '2026-04-20T01:00:00.000Z',
            proposal: 9,
          },
          {
            id: 6,
            status: 'sent',
            contractTitle: 'Open deal',
            sentAt: '2026-09-01T01:00:00.000Z',
            proposal: { id: 10 },
          },
        ],
      }),
    )
    expect(actions(plan, 43)).toEqual(['2026-04-20 contract_sent', '2026-05-01 client_created'])
    const prospect = plan.owners.find((owner) => owner.collection === 'client-proposals')
    expect(prospect).toMatchObject({ id: 10, name: 'Prospect Pty (prospect)' })
    expect(prospect?.entries.map((entry) => entry.actionType)).toEqual(['contract_sent'])
  })

  it('adds campaign proposal, ad copy and SEO migration entries from their stored dates', () => {
    const plan = planTimelineBackfill(
      source({
        audits: [
          {
            id: 7,
            client: 42,
            campaignProposalStatus: 'completed',
            campaignProposalGeneratedAt: '2026-07-01T01:00:00.000Z',
            campaignProposal: JSON.stringify({ proposedCampaigns: [{ adGroups: [{}] }] }),
            adCopyStatus: 'generated',
            adCopyGeneratedAt: '2026-07-03T01:00:00.000Z',
            generatedAdCopy: JSON.stringify({ Brand: { Core: {} } }),
          },
        ],
        migrations: [
          {
            id: 1,
            client: 42,
            cutoverDate: '2026-08-15T00:00:00.000Z',
            siteUrl: 'https://epgengines.com.au',
          },
        ],
      }),
    )
    expect(actions(plan, 42)).toEqual([
      '2026-06-01 client_created',
      '2026-07-01 campaign_structure_proposed',
      '2026-07-03 ad_copy_generated',
      '2026-08-15 site_migration',
    ])
  })

  it('skips events already on the timeline for the same action and day, including hand-entered rows', () => {
    const plan = planTimelineBackfill(
      source({
        contracts: [
          {
            id: 1,
            status: 'completed',
            contractTitle: 'Retainer',
            sentAt: '2026-06-10T01:00:00.000Z',
            clientSignedAt: '2026-06-12T01:00:00.000Z',
            client: 42,
          },
        ],
        existing: [
          { collection: 'clients', ownerId: 42, actionType: 'contract_signed', day: '2026-06-12' },
          { collection: 'clients', ownerId: 42, actionType: 'client_created', day: '2026-06-01' },
        ],
      }),
    )
    expect(actions(plan, 42)).toEqual(['2026-06-10 contract_sent'])
    expect(plan.skippedAlreadyOnTimeline).toBe(2)
  })

  it('keeps two different contracts sent on the same day, but not the same contract twice', () => {
    const sent = (id: number, title: string) => ({
      id,
      status: 'sent',
      contractTitle: title,
      sentAt: '2026-03-05T01:00:00.000Z',
      proposal: 10,
    })
    const plan = planTimelineBackfill(
      source({ contracts: [sent(1, 'Test'), sent(2, 'Copy'), sent(3, 'Copy')] }),
    )
    const prospect = plan.owners.find((owner) => owner.collection === 'client-proposals')
    expect(prospect?.entries.map((entry) => entry.description)).toEqual([
      'Contract sent to client: Test',
      'Contract sent to client: Copy',
    ])
    expect(plan.skippedAlreadyOnTimeline).toBe(0)
  })

  it('ignores records pointing at clients or proposals that no longer exist', () => {
    const plan = planTimelineBackfill(
      source({
        clients: [],
        proposals: [],
        contracts: [{ id: 1, status: 'sent', sentAt: '2026-06-10T01:00:00.000Z', client: 999 }],
      }),
    )
    expect(plan).toEqual({
      owners: [],
      planned: 0,
      skippedAlreadyOnTimeline: 0,
      skippedNoDate: [],
      byAction: {},
    })
  })

  it('never guesses a date: events with no recorded date are left out and listed', () => {
    const plan = planTimelineBackfill(
      source({
        contracts: [
          // Signed but the sent date was never recorded → only the signed entry.
          {
            id: 1,
            status: 'completed',
            contractTitle: 'Old retainer',
            clientSignedAt: '2026-06-12T01:00:00.000Z',
            client: 42,
          },
          // Sent with no sent date → nothing.
          { id: 2, status: 'sent', contractTitle: 'Undated', client: 42 },
        ],
        audits: [
          {
            id: 7,
            client: 42,
            campaignProposalStatus: 'completed',
            campaignProposal: JSON.stringify({ proposedCampaigns: [] }),
            adCopyStatus: 'generated',
            generatedAdCopy: JSON.stringify({ Brand: { Core: {} } }),
          },
        ],
      }),
    )

    expect(actions(plan, 42)).toEqual(['2026-06-01 client_created', '2026-06-12 contract_signed'])
    expect(plan.skippedNoDate).toEqual([
      { record: 'contract', id: 2, event: 'contract_sent', timeline: 'clients:42' },
      { record: 'google ads audit', id: 7, event: 'ad_copy_generated', timeline: 'clients:42' },
      {
        record: 'google ads audit',
        id: 7,
        event: 'campaign_structure_proposed',
        timeline: 'clients:42',
      },
    ])
  })

  it("covers EPG's records: start dates, and a proposal and ad copy that were later approved", () => {
    const plan = planTimelineBackfill(
      source({
        clients: [
          {
            id: 42,
            name: 'EPG engines',
            createdAt: '2026-05-20T05:18:10.617Z',
            clientStartDate: '2026-06-29T12:00:00.000Z',
            retainerStartDate: '2026-06-29T12:00:00.000Z',
            campaignStartDate: null,
          },
        ],
        proposals: [],
        audits: [
          {
            id: 7,
            client: 42,
            campaignProposalStatus: 'approved',
            campaignProposalGeneratedAt: '2026-07-03T01:19:39.634Z',
            campaignProposal: JSON.stringify({ proposedCampaigns: [{ adGroups: [{}] }] }),
            adCopyStatus: 'approved',
            adCopyGeneratedAt: '2026-07-08T04:09:57.782Z',
            generatedAdCopy: JSON.stringify({ Brand: { Core: {} } }),
          },
          // Still running / only a draft: not recorded.
          { id: 8, client: 42, campaignProposalStatus: 'running', adCopyStatus: 'draft' },
        ],
      }),
      { exclude: ['client_created'] },
    )

    expect(actions(plan, 42)).toEqual([
      '2026-06-29 contract_start',
      '2026-06-29 retainer_start',
      '2026-07-03 campaign_structure_proposed',
      '2026-07-08 ad_copy_generated',
    ])
  })

  it('leaves out excluded entry types, including from the no-date list', () => {
    const plan = planTimelineBackfill(
      source({
        contracts: [
          {
            id: 1,
            status: 'sent',
            contractTitle: 'Retainer',
            sentAt: '2026-06-10T01:00:00.000Z',
            client: 42,
          },
        ],
        audits: [
          {
            id: 7,
            client: 42,
            adCopyStatus: 'generated',
            generatedAdCopy: JSON.stringify({ Brand: { Core: {} } }),
          },
        ],
      }),
      { exclude: ['client_created', 'ad_copy_generated'] },
    )

    expect(actions(plan, 42)).toEqual(['2026-06-10 contract_sent'])
    expect(actions(plan, 43)).toBeUndefined()
    expect(plan.byAction).toEqual({ contract_sent: 1 })
    expect(plan.skippedNoDate).toEqual([])
  })
})

describe('applyTimelineBackfill (real SQLite)', () => {
  let db: LibsqlClient
  let payload: Payload

  beforeEach(async () => {
    db = createClient({ url: ':memory:' })
    for (const table of ['client_account_timeline', 'client_proposals_account_timeline']) {
      await db.execute(`CREATE TABLE ${table} (
        _order integer NOT NULL, _parent_id integer NOT NULL, id text PRIMARY KEY NOT NULL,
        date text NOT NULL, service_area text, action_type text NOT NULL, description text NOT NULL, added_by text)`)
    }
    await db.execute(
      `INSERT INTO client_account_timeline VALUES (1, 42, 'hand-row', '2026-07-10T02:00:00.000Z', 'google_ads', 'other', 'Google ads campaign went live', 'Pete')`,
    )
    payload = { db: { client: db } } as unknown as Payload
  })

  afterEach(() => db.close())

  it('appends marked rows after existing ones, and a second run adds nothing', async () => {
    const plan = planTimelineBackfill(
      source({
        proposals: [{ id: 10, businessName: 'Prospect Pty', client: null }],
        contracts: [
          {
            id: 6,
            status: 'sent',
            contractTitle: 'Open deal',
            sentAt: '2026-09-01T01:00:00.000Z',
            proposal: 10,
          },
        ],
      }),
    )

    expect(await applyTimelineBackfill(payload, plan)).toEqual({ added: 3, failedOwners: [] })
    expect(await applyTimelineBackfill(payload, plan)).toEqual({ added: 0, failedOwners: [] })

    const clientRows = await db.execute(
      'SELECT _order, id, action_type, added_by FROM client_account_timeline WHERE _parent_id = 42 ORDER BY _order',
    )
    expect(clientRows.rows.map((row) => ({ ...row }))).toEqual([
      { _order: 1, id: 'hand-row', action_type: 'other', added_by: 'Pete' },
      expect.objectContaining({
        _order: 2,
        action_type: 'client_created',
        added_by: BACKFILL_ADDED_BY,
      }),
    ])
    const prospectRows = await db.execute(
      'SELECT action_type, added_by FROM client_proposals_account_timeline WHERE _parent_id = 10',
    )
    expect(prospectRows.rows.map((row) => ({ ...row }))).toEqual([
      { action_type: 'contract_sent', added_by: BACKFILL_ADDED_BY },
    ])

    // The documented undo removes only backfilled rows.
    await db.execute({
      sql: 'DELETE FROM client_account_timeline WHERE added_by = ?',
      args: [BACKFILL_ADDED_BY],
    })
    const remaining = await db.execute('SELECT id FROM client_account_timeline')
    expect(remaining.rows.map((row) => row.id)).toEqual(['hand-row'])
  })

  it('keeps going when one owner fails and reports it', async () => {
    const plan = planTimelineBackfill(source())
    const failing = {
      db: {
        client: {
          execute: vi.fn(async (q: { args: unknown[] }) => {
            if (q.args[0] === 43) throw new Error('database is locked')
            return { rowsAffected: 1 }
          }),
        },
      },
    } as unknown as Payload

    expect(await applyTimelineBackfill(failing, plan)).toEqual({
      added: 1,
      failedOwners: [{ collection: 'clients', id: 43, error: 'database is locked' }],
    })
  })
})
