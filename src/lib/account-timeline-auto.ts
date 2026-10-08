import crypto from 'node:crypto'
import type { CollectionBeforeChangeHook, Payload } from 'payload'
import type {
  ACCOUNT_TIMELINE_ACTION_TYPE_OPTIONS,
  ACCOUNT_TIMELINE_SERVICE_AREA_OPTIONS,
} from './client-field-options'
import { deferPostCommit } from './google-ads-audit-bootstrap'
import { relationshipKey } from './relationship-id'

/**
 * Automatic Account Timeline entries.
 *
 * Key account events (client created, Google Ads account linked, contract
 * sent/signed, campaign structure proposed, ad copy generated, SEO migration
 * date set) append a row to the client's Account Timeline — or to the
 * proposal's Prospect Timeline when the record is linked only to a proposal,
 * which is copied onto the client when the proposal converts.
 *
 * Rows written for another collection's save are appended with a single
 * INSERT into the array table rather than a Payload update of the whole
 * client: that never rewrites existing rows, never runs the client's hooks,
 * and cannot fail on unrelated legacy field values (Payload validates every
 * field on update). The INSERT skips an entry that already exists for the same
 * day, action and description, so retries and re-saves do not duplicate rows.
 */

type ServiceArea = (typeof ACCOUNT_TIMELINE_SERVICE_AREA_OPTIONS)[number]['value']
type ActionType = (typeof ACCOUNT_TIMELINE_ACTION_TYPE_OPTIONS)[number]['value']

export type AutoTimelineEntry = Readonly<{
  date: string
  serviceArea: ServiceArea
  actionType: ActionType
  description: string
  /** "Added by" column; defaults to AUTO_ADDED_BY. */
  addedBy?: string
}>

export type TimelineOwner = Readonly<{ collection: 'clients' | 'client-proposals'; id: number }>

/** "Added by" value on automatic rows, so they are distinguishable from hand-entered ones. */
export const AUTO_ADDED_BY = 'Automatic'

export const TIMELINE_TABLE: Record<TimelineOwner['collection'], string> = {
  clients: 'client_account_timeline',
  'client-proposals': 'client_proposals_account_timeline',
}

/** The agency works in Sydney time; timeline rows are calendar days. */
const TIMELINE_TIME_ZONE = 'Australia/Sydney'

/**
 * Calendar day (YYYY-MM-DD, Sydney time) for a timestamp or date string.
 * Bare YYYY-MM-DD values are already calendar days and pass through.
 */
export function timelineDay(value: string | Date | null | undefined): string | null {
  if (!value) return null
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMELINE_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

/**
 * Stored timeline date: midday in Sydney on the event's calendar day, the same
 * shape the Account Timeline editor saves, so its date picker (which reads the
 * UTC day) shows the right day.
 */
export function timelineDate(value: string | Date | null | undefined, now: Date): string {
  const day = timelineDay(value) ?? timelineDay(now) ?? now.toISOString().slice(0, 10)
  return `${day}T02:00:00.000Z`
}

/** Timeline owners must be positive integer ids; anything else is treated as unlinked. */
export function positiveRelationId(rel: unknown): number | null {
  const id = relationshipKey(rel)
  return typeof id === 'number' && Number.isSafeInteger(id) && id > 0 ? id : null
}

/** Timeline owner for a record linked to a client and/or a proposal; the client wins. */
export function resolveTimelineOwner(
  doc: { client?: unknown; proposal?: unknown } | null | undefined,
): TimelineOwner | null {
  const clientId = positiveRelationId(doc?.client)
  if (clientId !== null) return { collection: 'clients', id: clientId }
  const proposalId = positiveRelationId(doc?.proposal)
  if (proposalId !== null) return { collection: 'client-proposals', id: proposalId }
  return null
}

function sameOwner(a: TimelineOwner | null, b: TimelineOwner | null): boolean {
  return a?.collection === b?.collection && a?.id === b?.id
}

function entryKey(entry: { date?: unknown; actionType?: unknown; description?: unknown }): string {
  const day = typeof entry.date === 'string' ? entry.date.slice(0, 10) : ''
  return `${day}|${String(entry.actionType ?? '')}|${String(entry.description ?? '')}`
}

/** Existing rows plus any entries not already present (same day, action and description). */
export function withTimelineEntries<T extends Record<string, unknown>>(
  rows: readonly T[],
  entries: readonly AutoTimelineEntry[],
): Array<T | AutoTimelineEntry> {
  const seen = new Set(rows.map(entryKey))
  const added = entries.filter((entry) => {
    const key = entryKey(entry)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  return [...rows, ...added]
}

type SqlClient = {
  execute(query: { sql: string; args: Array<string | number> }): Promise<{ rowsAffected?: number }>
}

function sqlClient(payload: Payload): SqlClient {
  const client = (payload.db as unknown as { client?: SqlClient }).client
  if (!client || typeof client.execute !== 'function') {
    throw new Error('Account timeline: database client is unavailable')
  }
  return client
}

/**
 * Append entries to an owner's timeline. Returns how many rows were added
 * (entries already on the timeline are skipped).
 */
export async function appendTimelineEntries(
  payload: Payload,
  owner: TimelineOwner,
  entries: readonly AutoTimelineEntry[],
): Promise<number> {
  const table = TIMELINE_TABLE[owner.collection]
  const client = sqlClient(payload)
  let added = 0
  for (const entry of entries) {
    const result = await client.execute({
      sql:
        `INSERT INTO \`${table}\` (\`_order\`, \`_parent_id\`, \`id\`, \`date\`, \`service_area\`, \`action_type\`, \`description\`, \`added_by\`) ` +
        `SELECT COALESCE((SELECT MAX(\`_order\`) FROM \`${table}\` WHERE \`_parent_id\` = ?), 0) + 1, ?, ?, ?, ?, ?, ?, ? ` +
        `WHERE NOT EXISTS (SELECT 1 FROM \`${table}\` WHERE \`_parent_id\` = ? AND \`action_type\` = ? AND \`description\` = ? AND substr(\`date\`, 1, 10) = ?)`,
      args: [
        owner.id,
        owner.id,
        crypto.randomBytes(12).toString('hex'),
        entry.date,
        entry.serviceArea,
        entry.actionType,
        entry.description,
        entry.addedBy ?? AUTO_ADDED_BY,
        owner.id,
        entry.actionType,
        entry.description,
        entry.date.slice(0, 10),
      ],
    })
    added += result.rowsAffected ?? 0
  }
  return added
}

/**
 * Append after the current save commits. Used from collection afterChange
 * hooks: a write from inside the save's transaction would contend with its
 * SQLite write lock (see deferPostCommit), and a timeline failure must never
 * cost the user their save.
 */
export function deferTimelineEntries(
  payload: Payload,
  owner: TimelineOwner | null,
  entries: readonly AutoTimelineEntry[],
  label: string,
): void {
  if (!owner || entries.length === 0) return
  deferPostCommit(payload, `account timeline (${label})`, async () => {
    const added = await appendTimelineEntries(payload, owner, entries)
    payload.logger?.info?.({ msg: 'account timeline entries appended', label, owner, added })
  })
}

// ─── Event → entry builders (pure) ──────────────────────────────────────────

type ContractLike = {
  status?: string | null
  contractTitle?: string | null
  sentAt?: string | null
  clientSignedAt?: string | null
  clientSignerName?: string | null
  isTemplate?: boolean | null
  deletedAt?: string | null
  client?: unknown
  proposal?: unknown
}

/**
 * Entries for a contract save: when it is sent or signed, or when an already
 * sent/signed contract is first linked to a client or proposal.
 */
export function contractTimelineEntries(
  doc: ContractLike,
  previousDoc: ContractLike | null | undefined,
  now: Date,
): AutoTimelineEntry[] {
  if (doc.deletedAt) return []
  const statusChanged = doc.status !== previousDoc?.status
  const newlyLinked = !sameOwner(resolveTimelineOwner(doc), resolveTimelineOwner(previousDoc))
  if (!statusChanged && !newlyLinked) return []

  const history = contractHistoryEntries(doc, now)
  // A status change records just the new step; linking a sent or signed
  // contract after the fact records its whole history.
  return statusChanged ? history.slice(-1) : history
}

/**
 * Every sent/signed entry a contract's current state implies: [sent] for a
 * sent contract, [sent, signed] for a signed one ([signed] if it has no sent
 * date). Trashed contracts have none. A contract marked "template" still
 * counts once it has really been sent: copies always start as blank drafts
 * (see contract-from-template.ts), so a sent/signed status only ever comes
 * from an actual send to a client.
 */
export function contractHistoryEntries(doc: ContractLike, now: Date): AutoTimelineEntry[] {
  if (doc.deletedAt) return []
  const title = doc.contractTitle?.trim() || 'Untitled contract'
  const sent: AutoTimelineEntry = {
    date: timelineDate(doc.sentAt, now),
    serviceArea: 'contracts',
    actionType: 'contract_sent',
    description: `Contract sent to client: ${title}`,
  }
  if (doc.status === 'sent') return [sent]
  if (doc.status !== 'completed') return []

  const signer = doc.clientSignerName?.trim()
  const signed: AutoTimelineEntry = {
    date: timelineDate(doc.clientSignedAt, now),
    serviceArea: 'contracts',
    actionType: 'contract_signed',
    description: `Contract signed${signer ? ` by ${signer}` : ''}: ${title}`,
  }
  return doc.sentAt ? [sent, signed] : [signed]
}

type ClientLike = {
  googleAdsCustomerId?: string | null
  clientStartDate?: string | null
  campaignStartDate?: string | null
  retainerStartDate?: string | null
}

const START_DATE_FIELDS = [
  {
    field: 'clientStartDate',
    serviceArea: 'contracts',
    actionType: 'contract_start',
    description: 'Contract start date',
  },
  {
    field: 'retainerStartDate',
    serviceArea: 'contracts',
    actionType: 'retainer_start',
    description: 'Retainer start date',
  },
  {
    field: 'campaignStartDate',
    serviceArea: 'general',
    actionType: 'campaign_start',
    description: 'Campaign start date',
  },
] as const

type StartDateField = (typeof START_DATE_FIELDS)[number]['field']

/**
 * Calendar day of a date-only field (Payload stores these as midday UTC), taken
 * as stored rather than time-zone converted, so it matches the date picker.
 */
function dateOnlyDay(value: string | null | undefined): string | null {
  if (!value) return null
  const day = value.slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(day) && !Number.isNaN(Date.parse(day)) ? day : null
}

/**
 * One entry per start date on the client (contract, retainer, campaign),
 * dated on that start date. `only` limits it to the named fields.
 */
export function clientStartDateEntries(
  client: ClientLike,
  only?: ReadonlySet<StartDateField>,
): AutoTimelineEntry[] {
  const entries: AutoTimelineEntry[] = []
  for (const spec of START_DATE_FIELDS) {
    if (only && !only.has(spec.field)) continue
    const day = dateOnlyDay(client[spec.field])
    if (!day) continue
    entries.push({
      date: timelineDate(day, new Date(0)),
      serviceArea: spec.serviceArea,
      actionType: spec.actionType,
      description: spec.description,
    })
  }
  return entries
}

/**
 * Entries for a client save: record creation, the first Google Ads account
 * link, and start dates entered for the first time.
 */
export function clientTimelineEntries(
  operation: 'create' | 'update',
  data: ClientLike,
  originalDoc: ClientLike | null | undefined,
  now: Date,
): AutoTimelineEntry[] {
  const entries: AutoTimelineEntry[] = []
  if (operation === 'create') {
    entries.push({
      date: timelineDate(now, now),
      serviceArea: 'onboarding',
      actionType: 'client_created',
      description: 'Client account created in the CMS',
    })
  }
  const previousId = String(originalDoc?.googleAdsCustomerId ?? '').trim()
  const nextId = String(
    data.googleAdsCustomerId === undefined ? previousId : (data.googleAdsCustomerId ?? ''),
  ).trim()
  if (!previousId && nextId) {
    entries.push({
      date: timelineDate(now, now),
      serviceArea: 'google_ads',
      actionType: 'google_ads_account_linked',
      description: `Google Ads account linked (customer ID ${nextId})`,
    })
  }
  // Start dates entered for the first time. Later edits are not re-added, so
  // the timeline never shows two conflicting start dates for the same thing.
  // A field missing from `data` (not submitted, or hidden by field access) is
  // unchanged.
  const newlySet = new Set<StartDateField>(
    START_DATE_FIELDS.filter(
      ({ field }) =>
        data[field] !== undefined &&
        dateOnlyDay(originalDoc?.[field]) === null &&
        dateOnlyDay(data[field]) !== null,
    ).map(({ field }) => field),
  )
  if (newlySet.size > 0) entries.push(...clientStartDateEntries(data, newlySet))
  return entries
}

/**
 * Clients beforeChange hook: adds the client's own events to the timeline in
 * the same save, so they are written atomically with the change itself.
 */
export const addClientTimelineEntries: CollectionBeforeChangeHook = ({
  data,
  originalDoc,
  operation,
}) => {
  if (!data || (operation !== 'create' && operation !== 'update')) return data
  const entries = clientTimelineEntries(operation, data, originalDoc, new Date())
  if (entries.length === 0) return data
  const base = Array.isArray(data.accountTimeline)
    ? data.accountTimeline
    : Array.isArray(originalDoc?.accountTimeline)
      ? originalDoc.accountTimeline
      : []
  data.accountTimeline = withTimelineEntries(
    base as Array<Record<string, unknown>>,
    entries.map((entry) => ({ ...entry, addedBy: AUTO_ADDED_BY })),
  )
  return data
}

export function parseJson(value: unknown): unknown {
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function countLabel(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? '' : 's'}`
}

type AuditLike = {
  campaignProposalStatus?: string | null
  campaignProposal?: unknown
  campaignProposalGeneratedAt?: string | null
}

/** Entry when a Google Ads campaign structure proposal finishes generating. */
export function campaignProposalTimelineEntries(
  doc: AuditLike,
  previousDoc: AuditLike | null | undefined,
  now: Date,
): AutoTimelineEntry[] {
  if (
    doc.campaignProposalStatus !== 'completed' ||
    previousDoc?.campaignProposalStatus === 'completed'
  )
    return []
  const proposal = parseJson(doc.campaignProposal) as { proposedCampaigns?: unknown } | null
  const campaigns = Array.isArray(proposal?.proposedCampaigns)
    ? (proposal.proposedCampaigns as Array<{ adGroups?: unknown }>)
    : []
  const adGroups = campaigns.reduce(
    (total, campaign) => total + (Array.isArray(campaign?.adGroups) ? campaign.adGroups.length : 0),
    0,
  )
  const size =
    campaigns.length > 0
      ? `: ${countLabel(campaigns.length, 'campaign')}, ${countLabel(adGroups, 'ad group')}`
      : ''
  return [
    {
      date: timelineDate(doc.campaignProposalGeneratedAt, now),
      serviceArea: 'google_ads',
      actionType: 'campaign_structure_proposed',
      description: `Google Ads campaign structure proposed${size}`,
    },
  ]
}

/** Entry when Google Ads ad copy is generated. */
export function adCopyTimelineEntry(
  adCopy: Record<string, Record<string, unknown>>,
  now: Date,
): AutoTimelineEntry {
  const campaigns = Object.keys(adCopy).length
  const adGroups = Object.values(adCopy).reduce(
    (total, groups) =>
      total + (groups && typeof groups === 'object' ? Object.keys(groups).length : 0),
    0,
  )
  const size =
    campaigns > 0
      ? ` for ${countLabel(adGroups, 'ad group')} across ${countLabel(campaigns, 'campaign')}`
      : ''
  return {
    date: timelineDate(now, now),
    serviceArea: 'google_ads',
    actionType: 'ad_copy_generated',
    description: `Google Ads ad copy generated${size}`,
  }
}

type MigrationLike = { cutoverDate?: string | null; siteUrl?: string | null }

function siteLabel(siteUrl: string | null | undefined): string {
  const raw = siteUrl?.trim()
  if (!raw) return ''
  const host = raw
    .replace(/^sc-domain:/, '')
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
  return host ? ` for ${host}` : ''
}

/** Entry when an SEO migration (cutover) date is added or changed. */
export function seoMigrationTimelineEntries(
  doc: MigrationLike,
  previousDoc: MigrationLike | null | undefined,
  now: Date,
): AutoTimelineEntry[] {
  const day = timelineDay(doc.cutoverDate)
  if (!day || day === timelineDay(previousDoc?.cutoverDate)) return []
  return [
    {
      date: timelineDate(day, now),
      serviceArea: 'seo',
      actionType: 'site_migration',
      description: `SEO migration date set${siteLabel(doc.siteUrl)}: website cutover on ${day}`,
    },
  ]
}
