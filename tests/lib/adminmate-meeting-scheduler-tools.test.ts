import { describe, expect, it } from 'vitest'
import {
  createAdminMateMeetingSchedulerTools,
  isSendConfirmation,
  isVoiceConfirmation,
  validateInviteEdits,
  validateStagedMeetingScheduler,
} from '@/lib/agents/adminmate/meeting-scheduler-tools'

const base = {
  title: 'Discovery call',
  dates: [{ date: '2026-10-13', start: '09:00', end: '12:00' }],
}

describe('validateStagedMeetingScheduler', () => {
  it('applies defaults and lower-cases attendee emails', () => {
    expect(
      validateStagedMeetingScheduler({
        ...base,
        attendees: [{ name: 'Priya', email: 'Priya@AFP.com.au' }],
      }),
    ).toEqual({
      ...base,
      durationMinutes: '30',
      meetingTopic: undefined,
      timezone: 'Australia/Sydney',
      attendees: [{ name: 'Priya', email: 'priya@afp.com.au', internalConfirmed: false }],
    })
  })

  it.each([
    ['no dates', { title: 'x', dates: [] }, /at least one/],
    [
      'impossible date',
      { ...base, dates: [{ date: '2026-02-30', start: '09:00', end: '10:00' }] },
      /YYYY-MM-DD/,
    ],
    [
      'end before start',
      { ...base, dates: [{ date: '2026-10-13', start: '12:00', end: '09:00' }] },
      /end after/,
    ],
    ['bad duration', { ...base, durationMinutes: '20' }, /durationMinutes/],
    ['bad timezone', { ...base, timezone: 'Mars/Base' }, /timezone/],
    ['bad email', { ...base, attendees: [{ name: 'A', email: 'nope' }] }, /valid email/],
    ['bad link id', { ...base, link: { kind: 'prospect', id: '1; drop', name: 'x' } }, /record id/],
  ])('rejects %s', (_label, input, error) => {
    expect(() => validateStagedMeetingScheduler(input)).toThrow(error)
  })
})

describe('stage_meeting_scheduler', () => {
  const [, stage] = createAdminMateMeetingSchedulerTools(
    [{ id: '7', name: 'Acme', slug: 'acme' }],
    [{ id: '4', businessName: 'Aussie Fluid Power' }],
  )

  it('links a prospect by id with the server-side name', () => {
    expect(stage?.validate?.({ ...base, prospectId: '4' })).toMatchObject({
      link: { kind: 'prospect', id: '4', name: 'Aussie Fluid Power' },
    })
  })

  it('rejects ids the server did not load', () => {
    expect(() => stage?.validate?.({ ...base, clientId: '99' })).toThrow(/find_clients/)
  })
})

describe('isVoiceConfirmation', () => {
  it.each(['Yes', 'yes, create it.', 'Go ahead', 'okay please', "that's right"])(
    'accepts %s',
    (text) => {
      expect(isVoiceConfirmation(text)).toBe(true)
    },
  )

  it.each(['yes but make it Wednesday', 'no', 'create a meeting with Acme', ''])(
    'rejects %s',
    (text) => {
      expect(isVoiceConfirmation(text)).toBe(false)
    },
  )
})

describe('validateInviteEdits', () => {
  const edits = {
    schedulerId: '31',
    title: 'Discovery call',
    attendees: [{ name: 'Priya', email: 'Priya@AFP.com.au' }],
  }

  it('normalises emails and defaults the duration', () => {
    expect(validateInviteEdits(edits)).toMatchObject({
      durationMinutes: '30',
      attendees: [{ email: 'priya@afp.com.au', internalConfirmed: false }],
    })
  })

  it.each([
    ['no invitees', { ...edits, attendees: [] }, /at least one attendee/],
    [
      'only internal invitees',
      { ...edits, attendees: [{ name: 'Pe', email: 'pe@od.com', internalConfirmed: true }] },
      /must receive an invite/,
    ],
    [
      'duplicate emails',
      { ...edits, attendees: [edits.attendees[0], { name: 'P', email: 'priya@afp.com.au' }] },
      /listed twice/,
    ],
    ['bad scheduler id', { ...edits, schedulerId: '../1' }, /record id/],
  ])('rejects %s', (_label, input, error) => {
    expect(() => validateInviteEdits(input)).toThrow(error)
  })
})

describe('isSendConfirmation', () => {
  it.each([
    'Send it',
    'yes, send the invites',
    'go ahead and send them',
    'send invites now please',
  ])('accepts %s', (text) => {
    expect(isSendConfirmation(text)).toBe(true)
  })

  it.each(['yes', 'yes, create it', 'go ahead', 'send it to someone else instead'])(
    'does not email on %s',
    (text) => {
      expect(isSendConfirmation(text)).toBe(false)
    },
  )
})
