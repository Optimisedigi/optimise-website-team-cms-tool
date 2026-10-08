import type { Payload } from 'payload'
import {
  adCopyTimelineEntry,
  appendTimelineEntries,
  campaignProposalTimelineEntries,
  clientStartDateEntries,
  contractHistoryEntries,
  parseJson,
  positiveRelationId,
  seoMigrationTimelineEntries,
  timelineDate,
  TIMELINE_TABLE,
  type AutoTimelineEntry,
  type TimelineOwner,
} from './account-timeline-auto'

/**
 * One-off backfill of automatic Account Timeline entries for events that
 * happened before automatic entries existed: contracts sent/signed, client
 * records created, contract/retainer/campaign start dates, campaign structures
 * proposed (including later approved), ad copy generated (including later
 * published or approved), and SEO migration dates. "Google Ads account linked" is not backfilled — the date an
 * ID was added is not stored anywhere.
 *
 * Safety:
 * - Append-only. Existing rows are never changed or removed.
 * - An event is skipped when its owner already has a row of the same action on
 *   the same day (hand-entered rows included, whatever their wording), so
 *   re-running is a no-op. Two different events of the same kind on the same
 *   day (e.g. two contracts sent) are both kept.
 * - Only real event dates are used (sent/signed dates, proposal and ad copy
 *   generation times, cutover date, client creation). An event whose date was
 *   never recorded is not added; it is listed in `skippedNoDate` instead.
 * - Every row is written with `added_by = BACKFILL_ADDED_BY`; undo with
 *   DELETE FROM client_account_timeline WHERE added_by = 'Automatic (backfill)'
 *   (and the same on client_proposals_account_timeline).
 */

export const BACKFILL_ADDED_BY = 'Automatic (backfill)'

export type BackfillSource = Readonly<{
  clients: ReadonlyArray<{
    id: number
    name?: string | null
    createdAt?: string | null
    clientStartDate?: string | null
    retainerStartDate?: string | null
    campaignStartDate?: string | null
  }>
  /** Proposals, with the client they converted into (if any). */
  proposals: ReadonlyArray<{ id: number; businessName?: string | null; client?: unknown }>
  contracts: ReadonlyArray<{
    id: number
    status?: string | null
    contractTitle?: string | null
    sentAt?: string | null
    clientSignedAt?: string | null
    clientSignerName?: string | null
    isTemplate?: boolean | null
    deletedAt?: string | null
    client?: unknown
    proposal?: unknown
  }>
  audits: ReadonlyArray<{
    id: number
    campaignProposalStatus?: string | null
    campaignProposal?: unknown
    campaignProposalGeneratedAt?: string | null
    adCopyStatus?: string | null
    generatedAdCopy?: unknown
    adCopyGeneratedAt?: string | null
    client?: unknown
    proposal?: unknown
  }>
  migrations: ReadonlyArray<{
    id: number
    cutoverDate?: string | null
    siteUrl?: string | null
    client?: unknown
  }>
  /** Rows already on the timelines: owner + action + calendar day. */
  existing: ReadonlyArray<{
    collection: TimelineOwner['collection']
    ownerId: number
    actionType: string
    day: string
  }>
}>

export type BackfillPlanOwner = {
  collection: TimelineOwner['collection']
  id: number
  name: string
  entries: AutoTimelineEntry[]
}

/** A past event left out because its record has no date for it. */
export type BackfillSkippedNoDate = { record: string; id: number; event: string; timeline: string }

export type BackfillPlan = {
  owners: BackfillPlanOwner[]
  planned: number
  skippedAlreadyOnTimeline: number
  skippedNoDate: BackfillSkippedNoDate[]
  byAction: Record<string, number>
}

function asDate(value: string | null | undefined): Date | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

/**
 * Statuses meaning the work was generated. Approval (and publishing, for ad
 * copy) happen after generation, so those records count too.
 */
const PROPOSAL_DONE_STATUSES: ReadonlySet<string> = new Set(['completed', 'approved'])
const AD_COPY_DONE_STATUSES: ReadonlySet<string> = new Set(['generated', 'published', 'approved'])

export type BackfillOptions = Readonly<{
  /** Entry types (action values) to leave out entirely, e.g. ["client_created"]. */
  exclude?: readonly string[]
}>

/** Pure: decide which entries to add, per owner, from the loaded records. */
export function planTimelineBackfill(
  source: BackfillSource,
  options: BackfillOptions = {},
): BackfillPlan {
  const excluded = new Set(options.exclude ?? [])
  const clientIds = new Set(source.clients.map((client) => client.id))
  const convertedTo = new Map<number, number>()
  const proposalIds = new Set<number>()
  for (const proposal of source.proposals) {
    proposalIds.add(proposal.id)
    const clientId = positiveRelationId(proposal.client)
    if (clientId !== null && clientIds.has(clientId)) convertedTo.set(proposal.id, clientId)
  }

  // Client wins; a proposal that converted hands its events to its client
  // (the proposal timeline was copied at conversion and is no longer shown).
  const ownerOf = (doc: { client?: unknown; proposal?: unknown }): TimelineOwner | null => {
    const clientId = positiveRelationId(doc.client)
    if (clientId !== null)
      return clientIds.has(clientId) ? { collection: 'clients', id: clientId } : null
    const proposalId = positiveRelationId(doc.proposal)
    if (proposalId === null || !proposalIds.has(proposalId)) return null
    const converted = convertedTo.get(proposalId)
    return converted !== undefined
      ? { collection: 'clients', id: converted }
      : { collection: 'client-proposals', id: proposalId }
  }

  // Existing rows match on owner + action + day (wording may differ from ours);
  // planned rows additionally on description, so distinct same-day events stay.
  const onTimeline = new Set(
    source.existing.map((row) => `${row.collection}:${row.ownerId}|${row.actionType}|${row.day}`),
  )
  const planned = new Set<string>()
  const byOwner = new Map<string, AutoTimelineEntry[]>()
  let skipped = 0

  const add = (owner: TimelineOwner | null, entries: readonly AutoTimelineEntry[]): void => {
    if (!owner) return
    const ownerKey = `${owner.collection}:${owner.id}`
    for (const entry of entries) {
      if (excluded.has(entry.actionType)) continue
      const dayKey = `${ownerKey}|${entry.actionType}|${entry.date.slice(0, 10)}`
      const entryKey = `${dayKey}|${entry.description}`
      if (onTimeline.has(dayKey)) {
        skipped += 1
        continue
      }
      if (planned.has(entryKey)) continue
      planned.add(entryKey)
      const list = byOwner.get(ownerKey) ?? []
      list.push({ ...entry, addedBy: BACKFILL_ADDED_BY })
      byOwner.set(ownerKey, list)
    }
  }

  for (const client of source.clients) {
    const owner: TimelineOwner = { collection: 'clients', id: client.id }
    const created = asDate(client.createdAt)
    if (created) {
      add(owner, [
        {
          date: timelineDate(created, created),
          serviceArea: 'onboarding',
          actionType: 'client_created',
          description: 'Client account created in the CMS',
        },
      ])
    }
    add(owner, clientStartDateEntries(client))
  }

  // Only real event dates are used. An event whose date was never recorded is
  // left out and listed in skippedNoDate rather than given a guessed date.
  const skippedNoDate: BackfillSkippedNoDate[] = []
  const noDate = (record: string, id: number, event: string, owner: TimelineOwner | null): void => {
    if (!owner || excluded.has(event)) return
    skippedNoDate.push({ record, id, event, timeline: `${owner.collection}:${owner.id}` })
  }

  for (const contract of source.contracts) {
    const owner = ownerOf(contract)
    const entries = contractHistoryEntries(contract, new Date(0)).filter((entry) => {
      const dated =
        entry.actionType === 'contract_sent'
          ? asDate(contract.sentAt)
          : asDate(contract.clientSignedAt)
      if (!dated) noDate('contract', contract.id, entry.actionType, owner)
      return dated !== null
    })
    add(owner, entries)
  }

  for (const audit of source.audits) {
    const owner = ownerOf(audit)
    // An approved proposal was generated first, so it counts as proposed.
    const proposalEntries = PROPOSAL_DONE_STATUSES.has(audit.campaignProposalStatus ?? '')
      ? campaignProposalTimelineEntries(
          { ...audit, campaignProposalStatus: 'completed' },
          null,
          new Date(0),
        )
      : []
    if (proposalEntries.length > 0 && !asDate(audit.campaignProposalGeneratedAt)) {
      noDate('google ads audit', audit.id, 'campaign_structure_proposed', owner)
    } else {
      add(owner, proposalEntries)
    }
    const adCopyAt = asDate(audit.adCopyGeneratedAt)
    const adCopy = parseJson(audit.generatedAdCopy)
    if (
      AD_COPY_DONE_STATUSES.has(audit.adCopyStatus ?? '') &&
      adCopy &&
      typeof adCopy === 'object'
    ) {
      if (adCopyAt)
        add(owner, [
          adCopyTimelineEntry(adCopy as Record<string, Record<string, unknown>>, adCopyAt),
        ])
      else noDate('google ads audit', audit.id, 'ad_copy_generated', owner)
    }
  }

  for (const migration of source.migrations) {
    // The entry is dated by the cutover date itself; no fallback is used.
    add(
      ownerOf({ client: migration.client }),
      seoMigrationTimelineEntries(migration, null, new Date(0)),
    )
  }

  const names = new Map<string, string>([
    ...source.clients.map((c) => [`clients:${c.id}`, c.name?.trim() || `Client ${c.id}`] as const),
    ...source.proposals.map(
      (p) =>
        [
          `client-proposals:${p.id}`,
          `${p.businessName?.trim() || `Proposal ${p.id}`} (prospect)`,
        ] as const,
    ),
  ])

  const owners: BackfillPlanOwner[] = [...byOwner.entries()]
    .map(([key, entries]) => {
      const [collection, id] = key.split(':') as [TimelineOwner['collection'], string]
      return {
        collection,
        id: Number(id),
        name: names.get(key) ?? key,
        entries: [...entries].sort(
          (a, b) => a.date.localeCompare(b.date) || a.actionType.localeCompare(b.actionType),
        ),
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name) || a.id - b.id)

  const byAction: Record<string, number> = {}
  for (const owner of owners) {
    for (const entry of owner.entries)
      byAction[entry.actionType] = (byAction[entry.actionType] ?? 0) + 1
  }
  const sortedByAction = Object.fromEntries(
    Object.entries(byAction).sort(([a], [b]) => a.localeCompare(b)),
  )

  return {
    owners,
    planned: owners.reduce((total, owner) => total + owner.entries.length, 0),
    skippedAlreadyOnTimeline: skipped,
    skippedNoDate: skippedNoDate.sort(
      (a, b) => a.record.localeCompare(b.record) || a.id - b.id || a.event.localeCompare(b.event),
    ),
    byAction: sortedByAction,
  }
}

type SqlRow = Record<string, unknown>
type SqlClient = {
  execute(
    query: string | { sql: string; args: Array<string | number> },
  ): Promise<{ rows: SqlRow[] }>
}

/** Load everything the planner needs, read-only. */
export async function loadBackfillSource(payload: Payload): Promise<BackfillSource> {
  const common = { depth: 0, pagination: false, overrideAccess: true } as const
  const [clients, proposals, contracts, audits, migrations] = await Promise.all([
    payload.find({
      collection: 'clients',
      ...common,
      select: {
        name: true,
        createdAt: true,
        clientStartDate: true,
        retainerStartDate: true,
        campaignStartDate: true,
      },
    }),
    payload.find({
      collection: 'client-proposals',
      ...common,
      select: { businessName: true, client: true },
    }),
    payload.find({
      collection: 'contracts',
      ...common,
      where: { status: { in: ['sent', 'completed'] } },
      select: {
        status: true,
        contractTitle: true,
        sentAt: true,
        clientSignedAt: true,
        clientSignerName: true,
        isTemplate: true,
        deletedAt: true,
        client: true,
        proposal: true,
      },
    }),
    payload.find({
      collection: 'google-ads-audits',
      ...common,
      where: {
        or: [
          { campaignProposalStatus: { in: [...PROPOSAL_DONE_STATUSES] } },
          { adCopyStatus: { in: [...AD_COPY_DONE_STATUSES] } },
        ],
      },
      select: {
        campaignProposalStatus: true,
        campaignProposal: true,
        campaignProposalGeneratedAt: true,
        adCopyStatus: true,
        generatedAdCopy: true,
        adCopyGeneratedAt: true,
        client: true,
        proposal: true,
      },
    }),
    payload.find({
      collection: 'seo-migration-checks',
      ...common,
      where: { cutoverDate: { exists: true } },
      select: { cutoverDate: true, siteUrl: true, client: true },
    }),
  ])

  const db = (payload.db as unknown as { client?: SqlClient }).client
  if (!db) throw new Error('Account timeline backfill: database client is unavailable')
  const existing: Array<BackfillSource['existing'][number]> = []
  for (const collection of Object.keys(TIMELINE_TABLE) as Array<TimelineOwner['collection']>) {
    const result = await db.execute(
      `SELECT \`_parent_id\` AS owner_id, \`action_type\` AS action_type, substr(\`date\`, 1, 10) AS day FROM \`${TIMELINE_TABLE[collection]}\``,
    )
    for (const row of result.rows) {
      existing.push({
        collection,
        ownerId: Number(row.owner_id),
        actionType: String(row.action_type),
        day: String(row.day),
      })
    }
  }

  return {
    clients: clients.docs as unknown as BackfillSource['clients'],
    proposals: proposals.docs as unknown as BackfillSource['proposals'],
    contracts: contracts.docs as unknown as BackfillSource['contracts'],
    audits: audits.docs as unknown as BackfillSource['audits'],
    migrations: migrations.docs as unknown as BackfillSource['migrations'],
    existing,
  }
}

/** Write a plan. Idempotent: rows already present are skipped by the insert itself. */
export async function applyTimelineBackfill(
  payload: Payload,
  plan: BackfillPlan,
): Promise<{
  added: number
  failedOwners: Array<{ collection: string; id: number; error: string }>
}> {
  let added = 0
  const failedOwners: Array<{ collection: string; id: number; error: string }> = []
  for (const owner of plan.owners) {
    try {
      added += await appendTimelineEntries(
        payload,
        { collection: owner.collection, id: owner.id },
        owner.entries,
      )
    } catch (error) {
      failedOwners.push({
        collection: owner.collection,
        id: owner.id,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
  return { added, failedOwners }
}
