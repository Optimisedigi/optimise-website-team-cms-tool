import type { CanonicalTool } from '../_shared/tool'
import { boundedText, emailPattern, type AdminMateClient } from './tools'

/** A prospect (Client Proposals record) a meeting can be linked to. */
export interface AdminMateProspect {
  id: string
  businessName: string
  contactName?: string
  contactEmail?: string
}

export const MEETING_DURATION_OPTIONS = ['15', '30', '45', '60', '90', '120'] as const
export type MeetingDuration = (typeof MEETING_DURATION_OPTIONS)[number]

export interface StagedMeetingDate {
  date: string
  start: string
  end: string
  preferred?: string
}

export interface StagedMeetingAttendee {
  name: string
  email: string
  internalConfirmed: boolean
}

/**
 * The only `meeting-schedulers` fields AdminMate may set. Tokens, slots,
 * responses and confirmation fields stay system-managed.
 */
export interface StagedMeetingScheduler {
  title: string
  /** Signed client or prospect (Client Proposal) the meeting is for. */
  link?: { kind: 'client' | 'prospect'; id: string; name: string }
  durationMinutes: MeetingDuration
  meetingTopic?: string
  timezone: string
  dates: StagedMeetingDate[]
  attendees: StagedMeetingAttendee[]
}

export const MAX_MEETING_DATES = 31
export const MAX_MEETING_ATTENDEES = 10
const datePattern = /^\d{4}-\d{2}-\d{2}$/
const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/
const durations = new Set<string>(MEETING_DURATION_OPTIONS)

function isRealDate(value: string): boolean {
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-AU', { timeZone: value })
    return true
  } catch {
    return false
  }
}

function asRecord(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`${name} must be an object`)
  return value as Record<string, unknown>
}

function validateDate(raw: unknown, index: number): StagedMeetingDate {
  const row = asRecord(raw, `dates[${index}]`)
  const date = boundedText(row.date, `dates[${index}].date`, 10) ?? ''
  if (!datePattern.test(date) || !isRealDate(date))
    throw new Error(`dates[${index}].date must be YYYY-MM-DD`)
  const start = boundedText(row.start, `dates[${index}].start`, 5) ?? ''
  const end = boundedText(row.end, `dates[${index}].end`, 5) ?? ''
  if (!timePattern.test(start) || !timePattern.test(end))
    throw new Error(`dates[${index}] start and end must be 24-hour HH:MM`)
  if (start >= end) throw new Error(`dates[${index}] must end after it starts`)
  const preferred = boundedText(row.preferred, `dates[${index}].preferred`, 5, false)
  if (preferred && (!timePattern.test(preferred) || preferred < start || preferred >= end))
    throw new Error(`dates[${index}].preferred must be an HH:MM time inside the window`)
  return { date, start, end, ...(preferred ? { preferred } : {}) }
}

function validateAttendee(raw: unknown, index: number): StagedMeetingAttendee {
  const row = asRecord(raw, `attendees[${index}]`)
  const name = boundedText(row.name, `attendees[${index}].name`, 200) ?? ''
  const email = (boundedText(row.email, `attendees[${index}].email`, 200) ?? '').toLowerCase()
  if (!emailPattern.test(email)) throw new Error(`attendees[${index}].email is not a valid email`)
  return { name, email, internalConfirmed: row.internalConfirmed === true }
}

/**
 * Re-validates a staged meeting scheduler. Runs inside the model loop and
 * again in the create route, so an edited browser payload gets the same field
 * allowlist and format checks as the model's own output.
 */
export function validateStagedMeetingScheduler(raw: unknown): StagedMeetingScheduler {
  const input = asRecord(raw, 'input')
  const title = boundedText(input.title, 'title', 200) ?? ''

  const duration = String(input.durationMinutes ?? '30')
  if (!durations.has(duration))
    throw new Error(`durationMinutes must be one of ${MEETING_DURATION_OPTIONS.join(', ')}`)

  const timezone = boundedText(input.timezone, 'timezone', 64, false) ?? 'Australia/Sydney'
  if (!isTimeZone(timezone))
    throw new Error('timezone must be an IANA timezone, e.g. Australia/Sydney')

  if (!Array.isArray(input.dates) || input.dates.length === 0)
    throw new Error('dates needs at least one available date')
  if (input.dates.length > MAX_MEETING_DATES)
    throw new Error(`dates can have at most ${MAX_MEETING_DATES} rows`)
  const dates = input.dates.map(validateDate)
  const sortedDates = dates.map((row) => row.date).sort()
  const first = sortedDates[0]
  const last = sortedDates[sortedDates.length - 1]
  if (first && last && Date.parse(last) - Date.parse(first) > (MAX_MEETING_DATES - 1) * 86_400_000)
    throw new Error(`dates must fall within ${MAX_MEETING_DATES} days of each other`)

  const rawAttendees = input.attendees ?? []
  if (!Array.isArray(rawAttendees)) throw new Error('attendees must be a list')
  if (rawAttendees.length > MAX_MEETING_ATTENDEES)
    throw new Error(`attendees can have at most ${MAX_MEETING_ATTENDEES} people`)
  const attendees = rawAttendees.map(validateAttendee)

  let link: StagedMeetingScheduler['link']
  if (input.link !== undefined && input.link !== null) {
    const raw = asRecord(input.link, 'link')
    if (raw.kind !== 'client' && raw.kind !== 'prospect')
      throw new Error("link.kind must be 'client' or 'prospect'")
    const id = boundedText(raw.id, 'link.id', 40) ?? ''
    if (!/^\d+$/.test(id)) throw new Error('link.id must be a record id')
    link = { kind: raw.kind, id, name: boundedText(raw.name, 'link.name', 200) ?? '' }
  }

  return {
    title,
    ...(link ? { link } : {}),
    durationMinutes: duration as MeetingDuration,
    meetingTopic: boundedText(input.meetingTopic, 'meetingTopic', 2000, false),
    timezone,
    dates,
    attendees,
  }
}

/** Resolves the model's clientId/prospectId against the records the server loaded. */
function resolveLink(
  input: Record<string, unknown>,
  clients: AdminMateClient[],
  prospects: AdminMateProspect[],
): StagedMeetingScheduler['link'] {
  const clientId = boundedText(input.clientId, 'clientId', 40, false)
  const prospectId = boundedText(input.prospectId, 'prospectId', 40, false)
  if (clientId && prospectId) throw new Error('Set clientId or prospectId, not both')
  if (clientId) {
    const client = clients.find(({ id }) => id === clientId)
    if (!client) throw new Error('clientId does not match an existing client; call find_clients')
    return { kind: 'client', id: client.id, name: client.name }
  }
  if (prospectId) {
    const prospect = prospects.find(({ id }) => id === prospectId)
    if (!prospect)
      throw new Error('prospectId does not match a client proposal; call find_meeting_prospects')
    return { kind: 'prospect', id: prospect.id, name: prospect.businessName }
  }
  return undefined
}

function matches(query: string, ...values: Array<string | undefined>): boolean {
  const needle = query.trim().toLowerCase()
  return values.some((value) => value?.toLowerCase().includes(needle))
}

export function createAdminMateMeetingSchedulerTools(
  clients: AdminMateClient[],
  prospects: AdminMateProspect[],
): CanonicalTool<unknown>[] {
  const findProspects: CanonicalTool<{ query: string }> = {
    name: 'find_meeting_prospects',
    description:
      'Search prospects (Client Proposals records — people who are not yet clients) by business, contact name or email, to link a meeting scheduler to them.',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string', minLength: 1, maxLength: 200 } },
      required: ['query'],
      additionalProperties: false,
    },
    validate: (raw) => ({ query: boundedText(asRecord(raw, 'input').query, 'query', 200) ?? '' }),
    execute: async ({ query }) => ({
      ok: true,
      data: {
        prospects: prospects
          .filter((p) => matches(query, p.businessName, p.contactName, p.contactEmail))
          .slice(0, 10),
      },
    }),
  }

  const stage: CanonicalTool<StagedMeetingScheduler> = {
    name: 'stage_meeting_scheduler',
    description:
      'Stage a new meeting scheduler (finds a time that suits every attendee) for human review. No CMS write happens here — the admin confirms the staged card. title and at least one available date are required. Link it to a signed client (clientId from find_clients) or a prospect (prospectId from find_meeting_prospects) when the admin names one.',
    inputSchema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          minLength: 1,
          maxLength: 200,
          description: "e.g. 'Q2 Strategy Review'.",
        },
        clientId: { type: 'string', description: 'Existing client id from find_clients.' },
        prospectId: {
          type: 'string',
          description:
            'Client Proposal id from find_meeting_prospects, for people who are not yet clients.',
        },
        durationMinutes: {
          type: 'string',
          enum: [...MEETING_DURATION_OPTIONS],
          description: 'Defaults to 30.',
        },
        meetingTopic: {
          type: 'string',
          maxLength: 2000,
          description: 'Short description shown to attendees.',
        },
        timezone: {
          type: 'string',
          maxLength: 64,
          description: 'IANA timezone. Defaults to Australia/Sydney.',
        },
        dates: {
          type: 'array',
          minItems: 1,
          maxItems: MAX_MEETING_DATES,
          description:
            "Each specific date the admin is available, with that day's window. Resolve relative dates ('next Tuesday') from today's date. Default window 09:00-17:00.",
          items: {
            type: 'object',
            properties: {
              date: { type: 'string', description: 'YYYY-MM-DD' },
              start: { type: 'string', description: '24-hour HH:MM' },
              end: { type: 'string', description: '24-hour HH:MM' },
              preferred: {
                type: 'string',
                description: 'Optional ideal start time, HH:MM, inside the window.',
              },
            },
            required: ['date', 'start', 'end'],
            additionalProperties: false,
          },
        },
        attendees: {
          type: 'array',
          maxItems: MAX_MEETING_ATTENDEES,
          description:
            "People who need to pick a time. Use the linked client's or prospect's contact when the admin says 'the client'. Set internalConfirmed for Optimise Digital team members (they get no invite).",
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', maxLength: 200 },
              email: { type: 'string', maxLength: 200 },
              internalConfirmed: { type: 'boolean' },
            },
            required: ['name', 'email'],
            additionalProperties: false,
          },
        },
      },
      required: ['title', 'dates'],
      additionalProperties: false,
    },
    validate: (raw) => {
      const input = asRecord(raw, 'input')
      const link = resolveLink(input, clients, prospects)
      const { clientId: _clientId, prospectId: _prospectId, ...rest } = input
      return validateStagedMeetingScheduler({ ...rest, ...(link ? { link } : {}) })
    },
    execute: async (staged) => ({ ok: true, data: { staged } }),
  }

  return [
    findProspects as unknown as CanonicalTool<unknown>,
    stage as unknown as CanonicalTool<unknown>,
  ]
}

/**
 * True when a dictated/typed message only confirms the staged card
 * ("yes", "create it", "go ahead and send it"). Lets the admin confirm a
 * staged meeting by voice alone.
 */
export function isVoiceConfirmation(text: string): boolean {
  const normalised = text
    .trim()
    .toLowerCase()
    .replace(/[.!,]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!normalised || normalised.length > 60) return false
  return /^(yes|yep|yeah|ok|okay|sure|confirm(ed)?|create( it| the meeting( scheduler)?)?|go ahead|do it|looks good|that'?s (right|correct|good))( (please|thanks|create it|confirm|go ahead|do it|that'?s (right|correct|good)))*$/.test(
    normalised,
  )
}

/** Edits the admin may make to a scheduler before its invites are emailed. */
export interface MeetingInviteEdits {
  schedulerId: string
  title: string
  durationMinutes: MeetingDuration
  meetingTopic?: string
  attendees: StagedMeetingAttendee[]
}

/**
 * Re-validates the send-invites card. Runs in the browser for the card and
 * again in the send route, so an edited payload gets the same checks.
 */
export function validateInviteEdits(raw: unknown): MeetingInviteEdits {
  const input = asRecord(raw, 'input')
  const schedulerId = boundedText(input.schedulerId, 'schedulerId', 40) ?? ''
  if (!/^\d+$/.test(schedulerId)) throw new Error('schedulerId must be a record id')
  const title = boundedText(input.title, 'title', 200) ?? ''
  const duration = String(input.durationMinutes ?? '30')
  if (!durations.has(duration))
    throw new Error(`durationMinutes must be one of ${MEETING_DURATION_OPTIONS.join(', ')}`)
  if (!Array.isArray(input.attendees) || input.attendees.length === 0)
    throw new Error('Add at least one attendee')
  if (input.attendees.length > MAX_MEETING_ATTENDEES)
    throw new Error(`attendees can have at most ${MAX_MEETING_ATTENDEES} people`)
  const attendees = input.attendees.map(validateAttendee)
  const emails = new Set<string>()
  for (const attendee of attendees) {
    if (emails.has(attendee.email)) throw new Error(`${attendee.email} is listed twice`)
    emails.add(attendee.email)
  }
  if (attendees.every((attendee) => attendee.internalConfirmed))
    throw new Error('At least one attendee must receive an invite')
  return {
    schedulerId,
    title,
    durationMinutes: duration as MeetingDuration,
    meetingTopic: boundedText(input.meetingTopic, 'meetingTopic', 2000, false),
    attendees,
  }
}

/**
 * True when a dictated message clearly asks to send the staged invites
 * ("send it", "yes, send the invites"). Deliberately stricter than
 * isVoiceConfirmation: a plain "yes" never emails anyone.
 */
export function isSendConfirmation(text: string): boolean {
  const normalised = text
    .trim()
    .toLowerCase()
    .replace(/[.!,]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!normalised || normalised.length > 60) return false
  return /^((yes|yep|yeah|ok|okay|sure) )?(please )?(go ahead and )?send( it| them| the (invites?|emails?)| (invites?|emails?))?( now)?( please| thanks)?$/.test(
    normalised,
  )
}

/** A scheduler AdminMate can send invites for. */
export interface AdminMateSchedulerSummary {
  id: string
  title: string
  status: string
  attendees: string[]
}

export function createAdminMateMeetingInviteTools(
  schedulers: AdminMateSchedulerSummary[],
): CanonicalTool<unknown>[] {
  const find: CanonicalTool<{ query: string }> = {
    name: 'find_meeting_schedulers',
    description:
      'Search recent meeting schedulers that are not yet confirmed, by title or attendee name/email, to send their invites.',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string', minLength: 1, maxLength: 200 } },
      required: ['query'],
      additionalProperties: false,
    },
    validate: (raw) => ({ query: boundedText(asRecord(raw, 'input').query, 'query', 200) ?? '' }),
    execute: async ({ query }) => ({
      ok: true,
      data: {
        schedulers: schedulers.filter((s) => matches(query, s.title, ...s.attendees)).slice(0, 10),
      },
    }),
  }

  const stage: CanonicalTool<{ schedulerId: string }> = {
    name: 'stage_meeting_invites',
    description:
      "Stage sending a meeting scheduler's invite emails for human review. No email is sent here — the admin reviews and edits the details on a card, then confirms. schedulerId comes from find_meeting_schedulers.",
    inputSchema: {
      type: 'object',
      properties: { schedulerId: { type: 'string', maxLength: 40 } },
      required: ['schedulerId'],
      additionalProperties: false,
    },
    validate: (raw) => {
      const schedulerId = boundedText(asRecord(raw, 'input').schedulerId, 'schedulerId', 40) ?? ''
      if (!schedulers.some((s) => s.id === schedulerId))
        throw new Error(
          'schedulerId does not match a meeting scheduler; call find_meeting_schedulers',
        )
      return { schedulerId }
    },
    execute: async ({ schedulerId }) => ({ ok: true, data: { schedulerId } }),
  }

  return [find as unknown as CanonicalTool<unknown>, stage as unknown as CanonicalTool<unknown>]
}
