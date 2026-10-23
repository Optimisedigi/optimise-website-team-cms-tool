import React, { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import AdminMateMeetingInvitesCard from '@/components/AdminMateMeetingInvitesCard'
import type { MeetingInviteEdits } from '@/lib/agents/adminmate/meeting-scheduler-tools'
import type { MeetingInvitePreview } from '@/lib/meeting-scheduler-invites'

const preview = {
  schedulerId: '31',
  title: 'Discovery call',
  durationMinutes: '30',
  timezone: 'Australia/Sydney',
  status: 'slots_generated',
  offeredTimes: 6,
  firstTime: '2026-10-12T22:00:00.000Z',
  lastTime: '2026-10-13T00:30:00.000Z',
  attendees: [],
  adminUrl: '/admin/collections/meeting-schedulers/31',
} as unknown as MeetingInvitePreview

const CONTACTS = [
  { email: 'rebekah@inthepicture.com.au', name: 'Rebekah Jones' },
  { email: 'priya@afp.com.au', name: 'Priya Shah' },
  { email: 'rebecca@other.com', name: '' },
]

function Harness({ initial }: { initial: MeetingInviteEdits['attendees'] }) {
  const [edits, setEdits] = useState({
    title: 'Discovery call',
    durationMinutes: '30',
    attendees: initial,
  } as MeetingInviteEdits)
  return (
    <AdminMateMeetingInvitesCard
      preview={preview}
      edits={edits}
      sending={false}
      onChange={(changes) => setEdits((current) => ({ ...current, ...changes }))}
      onSend={vi.fn()}
      onDiscard={vi.fn()}
    />
  )
}

const suggestions = async () =>
  within(await screen.findByRole('listbox')).getAllByRole('option')

describe('AdminMateMeetingInvitesCard invitee email suggestions', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ contacts: CONTACTS, senders: [] }) })
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('loads inbox contacts on focus and fills email and name from a pick', async () => {
    render(
      <Harness
        initial={[
          { name: 'Priya', email: 'priya@afp.com.au', internalConfirmed: false },
          { name: '', email: '', internalConfirmed: false },
        ]}
      />,
    )
    expect(fetchMock).not.toHaveBeenCalled()
    const email = screen.getByRole('combobox', { name: 'Invitee 2 email' })
    fireEvent.focus(email)
    expect(fetchMock).toHaveBeenCalledWith('/api/mail/contacts', { credentials: 'include' })

    fireEvent.change(email, { target: { value: 'r' } })
    expect(screen.queryByRole('listbox')).toBeNull()
    fireEvent.change(email, { target: { value: 're' } })
    const options = await suggestions()
    expect(options.map((o) => o.textContent)).toEqual([
      'Rebekah Jonesrebekah@inthepicture.com.au',
      'rebecca@other.com',
    ])

    fireEvent.click(options[0] as HTMLElement)
    expect(email).toHaveValue('rebekah@inthepicture.com.au')
    expect(screen.getByRole('textbox', { name: 'Invitee 2 name' })).toHaveValue('Rebekah Jones')
    expect(screen.queryByRole('listbox')).toBeNull()

    // Focusing another invitee reuses the loaded list.
    fireEvent.focus(screen.getByRole('combobox', { name: 'Invitee 1 email' }))
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('matches by name, leaves out invited addresses and keeps a typed name', async () => {
    render(
      <Harness
        initial={[
          { name: 'Bec', email: '', internalConfirmed: false },
          { name: '', email: 'rebecca@other.com', internalConfirmed: false },
        ]}
      />,
    )
    const email = screen.getByRole('combobox', { name: 'Invitee 1 email' })
    fireEvent.focus(email)
    fireEvent.change(email, { target: { value: 'jon' } })
    expect((await suggestions()).map((o) => o.textContent)).toEqual([
      'Rebekah Jonesrebekah@inthepicture.com.au',
    ])

    fireEvent.change(email, { target: { value: 'reb' } })
    expect((await suggestions()).map((o) => o.textContent)).toEqual([
      'Rebekah Jonesrebekah@inthepicture.com.au',
    ])
    fireEvent.keyDown(email, { key: 'Enter' })
    expect(email).toHaveValue('rebekah@inthepicture.com.au')
    expect(screen.getByRole('textbox', { name: 'Invitee 1 name' })).toHaveValue('Bec')
  })

  it('works as a plain field when contacts cannot load', async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: 'gmail-not-connected' }) })
    render(<Harness initial={[{ name: '', email: '', internalConfirmed: false }]} />)
    const email = screen.getByRole('combobox', { name: 'Invitee 1 email' })
    fireEvent.focus(email)
    fireEvent.change(email, { target: { value: 'someone@example.com' } })
    await Promise.resolve()
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(email).toHaveValue('someone@example.com')
  })
})

describe('AdminMateMeetingInvitesCard no-email option', () => {
  afterEach(cleanup)

  it('switches the send button to getting links when emails are turned off', () => {
    render(<Harness initial={[{ name: 'Priya', email: 'priya@afp.com.au', internalConfirmed: false }]} />)
    expect(screen.getByRole('button', { name: 'Send invites to 1 person' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('checkbox', { name: /Don.t email invitees/ }))
    expect(screen.getByRole('button', { name: 'Get invite links for 1 person' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Nobody is emailed')
  })

  it('keeps the title in step with what is covered until the admin types their own', () => {
    render(<Harness initial={[{ name: 'Priya', email: 'priya@afp.com.au', internalConfirmed: false }]} />)
    const title = screen.getByRole('textbox', { name: 'Invite meeting title' })
    fireEvent.change(title, { target: { value: 'Availability Meeting' } })
    const topic = screen.getByRole('textbox', { name: 'Invite meeting topic' })
    fireEvent.change(topic, { target: { value: 'ADT Google Ads' } })
    expect(title).toHaveValue('ADT Google Ads')
    fireEvent.change(topic, { target: { value: 'ADT Google Ads + Marketing strategy' } })
    expect(title).toHaveValue('ADT Google Ads + Marketing strategy')
    fireEvent.change(title, { target: { value: 'Q4 review' } })
    fireEvent.change(topic, { target: { value: 'Something else' } })
    expect(title).toHaveValue('Q4 review')
  })
})
