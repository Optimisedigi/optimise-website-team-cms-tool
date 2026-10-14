import { beforeEach, describe, expect, it, vi } from 'vitest'

const createSnapshotForAudit = vi.fn()
vi.mock('@/lib/google-ads-audit-snapshots/lifecycle', () => ({
  createSnapshotForAudit: (...args: unknown[]) => createSnapshotForAudit(...args),
}))
const getValidGmailToken = vi.fn()
vi.mock('@/lib/agents/_shared/user-gmail-tokens', () => ({
  getValidGmailToken: (...args: unknown[]) => getValidGmailToken(...args),
}))
const queueForApproval = vi.fn()
vi.mock('@/lib/agents/_shared/approval-queue', () => ({
  queueForApproval: (...args: unknown[]) => queueForApproval(...args),
}))
const createGmailDraft = vi.fn()
vi.mock('@/lib/gmail-service', () => ({
  createGmailDraft: (...args: unknown[]) => createGmailDraft(...args),
}))

import {
  addMonthsClamped,
  milestonePlan,
  planScheduledRows,
  toYmd,
} from '@/lib/google-ads-milestone-audits/schedule'
import { runMilestoneAuditTick } from '@/lib/google-ads-milestone-audits/runner'
import {
  applyMilestoneAuditShare,
  buildMilestoneEmail,
  MILESTONE_PROPOSAL_TYPE,
} from '@/lib/google-ads-milestone-audits/share'

// ── Minimal in-memory Payload double ──────────────────────────────────────
type Doc = Record<string, any>

function getPath(doc: Doc, path: string): unknown {
  return path.split('.').reduce<any>((value, key) => (value == null ? undefined : value[key]), doc)
}

function idOf(value: unknown): unknown {
  return value && typeof value === 'object' ? (value as Doc).id : value
}

function matches(doc: Doc, where: any): boolean {
  if (!where) return true
  if (where.and) return where.and.every((w: any) => matches(doc, w))
  return Object.entries(where).every(([path, cond]: [string, any]) => {
    const raw = getPath(doc, path)
    const value = idOf(raw)
    if ('equals' in cond) return String(value) === String(cond.equals)
    if ('not_equals' in cond) return value !== cond.not_equals
    if ('in' in cond) return cond.in.map(String).includes(String(value))
    if ('exists' in cond) return cond.exists ? value != null && value !== '' : value == null || value === ''
    if ('less_than' in cond) return Number(value) < Number(cond.less_than)
    throw new Error(`unsupported where ${JSON.stringify(cond)}`)
  })
}

function makePayload(seed: Record<string, Doc[]>) {
  const db: Record<string, Doc[]> = {}
  for (const [k, v] of Object.entries(seed)) db[k] = v.map((d) => ({ ...d }))
  let nextId = 1000
  const table = (c: string) => (db[c] ??= [])
  const payload = {
    db,
    find: vi.fn(async ({ collection, where, sort, limit }: any) => {
      let docs = table(collection).filter((d) => matches(d, where))
      if (sort) {
        const desc = sort.startsWith('-')
        const key = sort.replace(/^-/, '')
        docs = [...docs].sort((a, b) => (a[key] > b[key] ? 1 : -1) * (desc ? -1 : 1))
      }
      return { docs: docs.slice(0, limit ?? docs.length).map((d) => structuredClone(d)) }
    }),
    findByID: vi.fn(async ({ collection, id }: any) => {
      const doc = table(collection).find((d) => String(d.id) === String(id))
      if (!doc) throw new Error(`${collection} ${id} not found`)
      return structuredClone(doc)
    }),
    create: vi.fn(async ({ collection, data }: any) => {
      const doc = { id: nextId++, ...structuredClone(data) }
      table(collection).push(doc)
      return structuredClone(doc)
    }),
    update: vi.fn(async ({ collection, id, data }: any) => {
      const doc = table(collection).find((d) => String(d.id) === String(id))
      if (!doc) throw new Error(`${collection} ${id} not found`)
      Object.assign(doc, structuredClone(data))
      return structuredClone(doc)
    }),
  }
  return payload
}

const NOW = new Date('2026-10-14T01:00:00.000Z') // 11am Brisbane, 14 Oct 2026

function seed() {
  return {
    clients: [
      // 7 months in: 1- and 3-month missed, 6-month is the latest missed.
      { id: 1, name: 'Acme Plumbing', slug: 'acme', campaignStartDate: '2026-03-10T00:00:00.000Z', isActive: true, contactEmail: 'owner@acme.test', presentations: [], gadsAuto: { milestoneAuditsEnabled: true } },
      // Went live years ago: nothing should be caught up.
      { id: 2, name: 'Old Co', slug: 'old', campaignStartDate: '2024-01-01T00:00:00.000Z', isActive: true, presentations: [], gadsAuto: {} },
      // Switched off.
      { id: 3, name: 'Paused Co', slug: 'paused', campaignStartDate: '2026-03-10T00:00:00.000Z', isActive: true, presentations: [], gadsAuto: { milestoneAuditsEnabled: false } },
      // No go-live date.
      { id: 4, name: 'No Date', slug: 'nodate', isActive: true, presentations: [], gadsAuto: {} },
    ],
    'google-ads-audits': [
      { id: 11, client: 1, customerId: '123-456-7890', businessName: 'Acme Plumbing', updatedAt: '2026-10-01' },
      // Older duplicate audit for the same account: ignored.
      { id: 10, client: 1, customerId: '1234567890', businessName: 'Acme (prospect)', updatedAt: '2025-01-01' },
      { id: 21, client: 2, customerId: '222-222-2222', businessName: 'Old Co', updatedAt: '2026-10-01' },
      { id: 31, client: 3, customerId: '333-333-3333', businessName: 'Paused Co', updatedAt: '2026-10-01' },
    ],
  }
}

describe('milestone schedule maths', () => {
  it('clamps month-end go-live dates', () => {
    expect(addMonthsClamped('2026-01-31', 1)).toBe('2026-02-28')
    expect(addMonthsClamped('2027-11-30', 3)).toBe('2028-02-29')
    expect(addMonthsClamped('2026-03-10', 12)).toBe('2027-03-10')
  })

  it('plans five milestones with a go-live → day-before window', () => {
    const plan = milestonePlan('2026-03-10')
    expect(plan.map((p) => [p.months, p.dueDate])).toEqual([
      [1, '2026-04-10'], [3, '2026-06-10'], [6, '2026-09-10'], [9, '2026-12-10'], [12, '2027-03-10'],
    ])
    expect(plan[2]).toMatchObject({ periodStart: '2026-03-10', periodEnd: '2026-09-09' })
  })

  it('reads Payload date-only values as the entered day', () => {
    expect(toYmd('2026-03-10T00:00:00.000Z')).toBe('2026-03-10')
    expect(toYmd('2026-03-10')).toBe('2026-03-10')
    expect(toYmd(null)).toBeNull()
  })

  it('runs only the latest missed milestone and skips the older ones', () => {
    const rows = milestonePlan('2026-03-10').map((p) => ({ id: p.months, months: p.months, dueDate: p.dueDate }))
    const plan = planScheduledRows(rows, '2026-10-14')
    expect(plan.run?.months).toBe(6)
    expect(plan.skip.map((s) => s.row.months)).toEqual([1, 3])
  })

  it('does not run a milestone on its due date, only the day after', () => {
    const rows = [{ id: 1, months: 1, dueDate: '2026-10-14' }]
    expect(planScheduledRows(rows, '2026-10-14').run).toBeNull()
    expect(planScheduledRows(rows, '2026-10-15').run?.months).toBe(1)
  })

  it('skips a missed milestone that fell due too long ago', () => {
    const rows = milestonePlan('2024-01-01').map((p) => ({ id: p.months, months: p.months, dueDate: p.dueDate }))
    const plan = planScheduledRows(rows, '2026-10-14')
    expect(plan.run).toBeNull()
    expect(plan.skip).toHaveLength(5)
  })
})

describe('milestone email', () => {
  it('shows the score change and escapes client text', () => {
    const { subject, html } = buildMilestoneEmail({
      clientName: 'A&B <Plumbing>',
      months: 6,
      deckUrl: 'https://cms.example/partners/ab/google-ads-audit-1-6m',
      periodStart: '2026-03-10',
      periodEnd: '2026-09-09',
      score: 74,
      previous: { months: 3, score: 61 },
      totals: { cost: 12000, clicks: 3000, conversions: 120, cpa: 100 },
      currencyCode: 'AUD',
    })
    expect(subject).toBe('A&B <Plumbing>: your 6-month Google Ads audit')
    expect(html).toContain('A&amp;B &lt;Plumbing&gt;')
    expect(html).toContain('74/100 (+13 since the 3-month audit)')
    expect(html).toContain('https://cms.example/partners/ab/google-ads-audit-1-6m')
  })
})

describe('runMilestoneAuditTick + apply', () => {
  beforeEach(() => {
    createSnapshotForAudit.mockReset()
    getValidGmailToken.mockReset()
    createGmailDraft.mockReset()
  })

  it('schedules, catches up, captures, queues an approval, then shares as a Gmail draft', async () => {
    const payload = makePayload(seed())
    queueForApproval.mockImplementation(async (input: any) => {
      const row = { id: 77, status: 'pending', client: input.clientId, proposalType: input.proposalType, title: input.title, proposalPayload: input.proposalPayload, rendered: input.rendered }
      ;(payload.db['agent-approval-queue'] ??= []).push(row)
      return row.id
    })
    createSnapshotForAudit.mockImplementation(async (_p: unknown, auditId: unknown, opts: any) => {
      const snap = { id: 500, audit: auditId, status: 'running', periodStart: opts.window.periodStartFloor, periodEnd: opts.window.periodEnd }
      payload.db['google-ads-audit-snapshots'] = [snap]
      return snap
    })

    // Run 1: rows created, older milestones skipped, 6-month capture started.
    const first = await runMilestoneAuditTick(payload as any, { now: NOW })
    const rows = () => payload.db['google-ads-milestone-audits']
    expect(first.accounts).toBe(2) // Acme (deduped) + Old Co; paused and undated clients excluded
    expect(first.created).toBe(10)
    expect(first.started).toBe(1)
    expect(createSnapshotForAudit).toHaveBeenCalledTimes(1)
    expect(createSnapshotForAudit.mock.calls[0][1]).toBe(11)
    expect(createSnapshotForAudit.mock.calls[0][2]).toMatchObject({ allowNew: true, window: { periodEnd: '2026-09-09', periodStartFloor: '2026-03-10' } })
    const acme = rows().filter((r) => r.audit === 11)
    expect(Object.fromEntries(acme.map((r) => [r.months, r.status]))).toEqual({ 1: 'skipped', 3: 'skipped', 6: 'capturing', 9: 'scheduled', 12: 'scheduled' })
    expect(rows().filter((r) => r.audit === 21).every((r) => r.status === 'skipped')).toBe(true)

    // Run 2: capture finished → unpublished deck + pending approval.
    Object.assign(payload.db['google-ads-audit-snapshots'][0], {
      status: 'completed',
      capturedAt: '2026-10-14T02:00:00.000Z',
      requestedAt: '2026-10-14T01:00:00.000Z',
      accountTimeZone: 'Australia/Sydney',
      currencyCode: 'AUD',
      earliestAvailableActivityDate: '2025-06-01',
      analysis: { scoring: { total: 72, categories: [] }, totals: { cost: 9000, clicks: 2000, conversions: 90, cpa: 100 } },
      sourceRowCounts: {},
    })
    const second = await runMilestoneAuditTick(payload as any, { now: new Date('2026-10-14T02:40:00.000Z') })
    expect(second.readyForApproval).toBe(1)
    expect(createSnapshotForAudit).toHaveBeenCalledTimes(1) // nothing new started
    const six = rows().find((r) => r.audit === 11 && r.months === 6)!
    expect(six).toMatchObject({ status: 'awaiting_approval', overallScore: 72, deckSlug: 'google-ads-audit-11-6m', deckUrl: '/partners/acme/google-ads-audit-11-6m' })
    const approval = payload.db['agent-approval-queue'][0]
    expect(approval).toMatchObject({ proposalType: MILESTONE_PROPOSAL_TYPE, status: 'pending', client: 1 })
    expect(approval.rendered.clientHtml).toContain('6-month')
    const presentation = payload.db.clients[0].presentations[0]
    expect(presentation).toMatchObject({ deckSlug: 'google-ads-audit-11-6m', isPublic: false })
    expect(presentation.deckPayload.milestone).toEqual({ months: 6, goLiveDate: '2026-03-10', dueDate: '2026-09-10' })

    // Gmail not connected: apply fails and nothing is published.
    getValidGmailToken.mockResolvedValueOnce({ ok: false, reason: 'No Gmail connection' })
    await expect(applyMilestoneAuditShare(approval.proposalPayload, { payload: payload as any, approvalId: approval.id, userId: 7 })).rejects.toThrow(/Connect Gmail/)
    expect(payload.db.clients[0].presentations[0].isPublic).toBe(false)

    // Apply: publish deck + Gmail draft to the client contact.
    getValidGmailToken.mockResolvedValue({ ok: true, accessToken: 'tok', email: 'am@agency.test' })
    createGmailDraft.mockResolvedValue({ draftId: 'd1', messageId: 'm1' })
    const applied = await applyMilestoneAuditShare(approval.proposalPayload, { payload: payload as any, approvalId: approval.id, userId: 7 })
    expect(getValidGmailToken).toHaveBeenLastCalledWith(7)
    expect(createGmailDraft).toHaveBeenCalledWith('tok', expect.objectContaining({ to: 'owner@acme.test', subject: 'Acme Plumbing: your 6-month Google Ads audit' }))
    expect(payload.db.clients[0].presentations[0].isPublic).toBe(true)
    expect(rows().find((r) => r.id === six.id)).toMatchObject({ status: 'shared', gmailDraftId: 'd1' })
    expect(applied.message).toContain('owner@acme.test')

    // Re-applying is a no-op.
    await applyMilestoneAuditShare(approval.proposalPayload, { payload: payload as any, approvalId: approval.id, userId: 7 })
    expect(createGmailDraft).toHaveBeenCalledTimes(1)
  })

  it('moves unstarted milestones when the go-live date changes, and marks rejected approvals', async () => {
    const payload = makePayload(seed())
    payload.db.clients[0].campaignStartDate = '2026-09-20T00:00:00.000Z' // nothing due yet
    await runMilestoneAuditTick(payload as any, { now: NOW })
    expect(createSnapshotForAudit).not.toHaveBeenCalled()
    payload.db.clients[0].campaignStartDate = '2026-10-01T00:00:00.000Z'
    const result = await runMilestoneAuditTick(payload as any, { now: NOW })
    expect(result.rescheduled).toBe(5)
    const one = payload.db['google-ads-milestone-audits'].find((r) => r.audit === 11 && r.months === 1)!
    expect(one).toMatchObject({ dueDate: '2026-11-01', goLiveDate: '2026-10-01', status: 'scheduled' })

    payload.db['agent-approval-queue'] = [{ id: 900, status: 'rejected' }]
    Object.assign(one, { status: 'awaiting_approval', approval: 900 })
    const after = await runMilestoneAuditTick(payload as any, { now: NOW })
    expect(after.rejected).toBe(1)
    expect(one.status).toBe('rejected')
  })

  it('retries a failed capture and gives up after three attempts', async () => {
    const payload = makePayload(seed())
    createSnapshotForAudit.mockRejectedValue(new Error('Growth Tools down'))
    for (let i = 0; i < 3; i++) await runMilestoneAuditTick(payload as any, { now: NOW })
    const six = payload.db['google-ads-milestone-audits'].find((r) => r.audit === 11 && r.months === 6)!
    expect(createSnapshotForAudit).toHaveBeenCalledTimes(3)
    expect(six).toMatchObject({ status: 'failed', attempts: 3 })
    expect(six.note).toContain('Growth Tools down')
  })
})
