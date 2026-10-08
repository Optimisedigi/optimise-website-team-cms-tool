import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import ScheduleResponseClient from '@/components/ScheduleResponseClient'
import { zonedToUtc } from '@/lib/meeting-availability'

const tz = 'Australia/Sydney'
const at = (minutes: number) => zonedToUtc('2030-03-05', minutes, tz).toISOString()

const meeting = {
  title: 'AFP Google ads audit - run through',
  durationMinutes: '30',
  timezone: tz,
  // 9:00, 9:30 and 11:00 are offered; 10:00–11:00 is busy.
  generatedSlots: [at(540), at(570), at(660)],
  status: 'invites_sent',
  attendeeName: 'Pat',
  attendeeEmail: 'pat@example.com',
  responded: false,
  selectedSlots: [],
}

describe('ScheduleResponseClient availability grid', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ confirmed: false }) })
    vi.stubGlobal('fetch', fetchMock)
  })

  it('shows only the free hours, locks busy times, and submits the picked times', async () => {
    render(<ScheduleResponseClient token="t" previewData={meeting} />)
    const grid = screen.getByRole('group', { name: 'Free times to choose from' })

    // Rows span 9:00 to 11:00 only, in one column for the day.
    expect(within(grid).getByText('9:00 am')).toBeInTheDocument()
    expect(within(grid).getByText('11:00 am')).toBeInTheDocument()
    expect(within(grid).queryByText('8:30 am')).not.toBeInTheDocument()
    expect(within(grid).queryByText('11:30 am')).not.toBeInTheDocument()

    const busyCell = within(grid).getByRole('button', { name: /10:00 am.*unavailable/ })
    expect(busyCell).toBeDisabled()

    fireEvent.click(within(grid).getByRole('button', { name: /9:00 am.*free/ }))
    fireEvent.click(within(grid).getByRole('button', { name: /11:00 am.*free/ }))
    expect(screen.getByText('2 times selected')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Submit availability (2 selected)' }))
    const body = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string)
    expect(body.selectedSlots).toEqual([at(540), at(660)])
  })

  it('selects every free time at once', () => {
    render(<ScheduleResponseClient token="t" previewData={meeting} />)
    fireEvent.click(screen.getByRole('button', { name: 'Select all' }))
    expect(screen.getByText('3 times selected')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Clear all' })).toBeInTheDocument()
  })
})
