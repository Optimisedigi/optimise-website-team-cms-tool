import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Payload, PayloadRequest } from 'payload'
import {
  applyInviteEdits,
  SchedulerNotSendableError,
  sendSchedulerInvites,
} from '@/lib/meeting-scheduler-invites'

function fakePayload(doc: Record<string, unknown>) {
  const update = vi.fn().mockResolvedValue({})
  const payload = { findByID: vi.fn().mockResolvedValue(doc), update } as unknown as Payload
  return { payload, update }
}

const req = {} as PayloadRequest
const baseDoc = {
  id: 31,
  title: 'Discovery call',
  status: 'slots_generated',
  durationMinutes: '30',
  generatedSlots: [{ slot: '2026-10-12T22:00:00.000Z' }],
  attendees: [
    { id: 'a1', name: 'Priya', email: 'priya@afp.com.au', token: 'tok-priya', responded: true },
    { id: 'a2', name: 'Sam', email: 'sam@afp.com.au', token: 'tok-sam' },
  ],
}

describe('applyInviteEdits', () => {
  it('keeps existing invitees’ private links and responses, adds new ones and drops removed ones', async () => {
    const { payload, update } = fakePayload(baseDoc)

    await applyInviteEdits(
      payload,
      31,
      {
        title: 'Discovery call v2',
        durationMinutes: '45',
        attendees: [
          { name: 'Priya Shah', email: 'PRIYA@afp.com.au', internalConfirmed: false },
          { name: 'Lee', email: 'lee@afp.com.au', internalConfirmed: false },
        ],
      },
      req,
    )

    const data = update.mock.calls[0]?.[0].data
    expect(data).toMatchObject({
      title: 'Discovery call v2',
      durationMinutes: '45',
      meetingTopic: null,
    })
    expect(data.attendees).toEqual([
      {
        id: 'a1',
        name: 'Priya Shah',
        email: 'priya@afp.com.au',
        token: 'tok-priya',
        responded: true,
        internalConfirmed: false,
      },
      { name: 'Lee', email: 'lee@afp.com.au', internalConfirmed: false },
    ])
  })

  it('refuses to change a confirmed meeting', async () => {
    const { payload, update } = fakePayload({ ...baseDoc, status: 'confirmed' })
    await expect(
      applyInviteEdits(payload, 31, { title: 'x', durationMinutes: '30', attendees: [] }, req),
    ).rejects.toBeInstanceOf(SchedulerNotSendableError)
    expect(update).not.toHaveBeenCalled()
  })
})

describe('sendSchedulerInvites', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('emails each external invitee their own link and marks the scheduler sent', async () => {
    vi.stubEnv('BREVO_API_KEY', 'test-key')
    vi.stubEnv('NEXT_PUBLIC_SERVER_URL', 'https://cms.example')
    const { payload, update } = fakePayload({
      ...baseDoc,
      attendees: [
        ...baseDoc.attendees,
        { name: 'Pe', email: 'pe@od.com', token: 'tok-pe', internalConfirmed: true },
      ],
    })
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, text: async () => '' })

    const result = await sendSchedulerInvites(payload, 31, { fetchImpl })

    expect(result).toMatchObject({ ok: true, sentCount: 2 })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    const first = JSON.parse(fetchImpl.mock.calls[0]?.[1].body)
    expect(first.to).toEqual([{ email: 'priya@afp.com.au', name: 'Priya' }])
    expect(first.htmlContent).toContain('https://cms.example/schedule/tok-priya')
    expect(update.mock.calls[0]?.[0].data.status).toBe('invites_sent')
  })

  it('refuses when no meeting times are offered yet', async () => {
    vi.stubEnv('BREVO_API_KEY', 'test-key')
    const { payload } = fakePayload({ ...baseDoc, generatedSlots: [] })
    expect(await sendSchedulerInvites(payload, 31, { fetchImpl: vi.fn() })).toMatchObject({
      ok: false,
      status: 400,
    })
  })
})
