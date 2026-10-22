import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import TriagePanel from '@/components/mail/TriagePanel'

afterEach(cleanup)

const ANN_IDS = Array.from({ length: 200 }, (_, i) => `a${i}`)

const RESULT = {
  scanned: 233,
  truncated: false,
  failedBatches: 0,
  categories: [
    {
      key: 'sales_pitch',
      label: 'Sales pitches',
      count: 230,
      defaultSelected: true,
      senders: [
        { address: 'ann@seo.io', name: 'Ann', count: 200, subjects: ['Rank #1', 'Bump', 'Again', 'Last try'], messageIds: ANN_IDS },
        { address: 'bob@dev.io', name: 'Bob', count: 30, subjects: ['Apps'], messageIds: ['b1'] },
      ],
    },
    { key: 'clients', label: 'Clients', count: 3, defaultSelected: false, senders: [{ address: 'jo@acme.com', name: 'Jo', count: 3, subjects: ['Invoice'], messageIds: ['c1'] }] },
  ],
}

describe('TriagePanel', () => {
  it('summarises categories, lets senders be unticked, and archives only what is still ticked', async () => {
    const calls: Array<{ url: string; body: unknown }> = []
    const api = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null })
      return (url === '/api/mail/triage' ? RESULT : { ok: true }) as never
    })
    const onApplied = vi.fn()
    render(<TriagePanel api={api} onApplied={onApplied} onClose={vi.fn()} />)
    // Nothing runs until asked.
    expect(api).not.toHaveBeenCalled()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Triage unread emails' }))
    })
    expect(screen.getByText('233 unread emails from 3 senders.')).toBeTruthy()
    // Category table: emails, senders and share per category, plus a total row.
    const table = screen.getByRole('table', { name: 'Unread emails by category' })
    const salesRow = within(table).getByRole('row', { name: /Sales pitches/ })
    expect(within(salesRow).getAllByRole('cell').map((cell) => cell.textContent)).toEqual(['', '230', '2', '99%', '230'])
    expect(within(table).getByRole('row', { name: /Total/ }).textContent).toContain('233')
    // Clients are not selected by default; sales pitches are.
    expect(screen.getByText('Selected: 230 emails from 2 senders')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /Sales pitches/ }))
    expect(screen.getByText('+1 more subjects')).toBeTruthy()
    // Sender table inside the category: one row per sender, however many emails they sent.
    const senders = screen.getByRole('table', { name: 'Sales pitches by sender' })
    expect(within(senders).getAllByRole('row')).toHaveLength(3)
    fireEvent.click(screen.getByLabelText('Clear Bob (bob@dev.io)'))
    expect(screen.getByText('Selected: 200 emails from 1 sender')).toBeTruthy()
    expect((screen.getByLabelText('Select all Sales pitches') as HTMLInputElement).indeterminate).toBe(true)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Archive selected' }))
    })
    expect(calls[1]).toEqual({ url: '/api/mail/triage/apply', body: { messageIds: ANN_IDS, action: 'archive' } })
    expect(onApplied).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('Ann')).toBeNull()
    expect(screen.getByText('33 unread emails from 2 senders.')).toBeTruthy()
  })
})
