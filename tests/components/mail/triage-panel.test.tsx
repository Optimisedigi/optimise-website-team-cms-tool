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
  it('reads a big inbox in chunks with progress, and sorts what was read if Gmail stops a later chunk', async () => {
    const ids = Array.from({ length: 450 }, (_, i) => `m${i}`)
    const bodies: Array<{ step: string; ids?: string[]; messages?: unknown[] }> = []
    let release: (() => void) | undefined
    const api = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body))
      bodies.push(body)
      if (body.step === 'list') return { ids, truncated: false } as never
      if (body.step === 'read') {
        const reads = bodies.filter((b) => b.step === 'read').length
        if (reads === 2) await new Promise<void>((resolve) => (release = resolve))
        if (reads === 3) throw new Error('Gmail is busy: too many requests in the last minute. Try again in a minute.')
        return { messages: (body.ids as string[]).map((messageId) => ({ messageId })) } as never
      }
      return { ...RESULT, scanned: (body.messages as unknown[]).length, truncated: undefined } as never
    })
    render(<TriagePanel api={api} onApplied={vi.fn()} onClose={vi.fn()} />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Triage unread emails' }))
    })
    // Second chunk in flight: progress shows how far it got and roughly how long is left.
    expect(screen.getByRole('status').textContent).toMatch(/Reading senders and subjects: 200 of 450\. .*under a minute/)
    await act(async () => {
      release?.()
    })
    expect(bodies.filter((b) => b.step === 'read').map((b) => b.ids?.length)).toEqual([200, 200, 50])
    // The third chunk failed: the 400 read so far are sorted, and the panel says it stopped early.
    expect(bodies.at(-1)?.step).toBe('sort')
    expect(bodies.at(-1)?.messages).toHaveLength(400)
    expect(screen.getByText(/Only the newest 400 were checked/)).toBeTruthy()
    expect(screen.getByRole('status').textContent).toMatch(/Gmail stopped the reading early \(Gmail is busy/)
  })

  it('shows the error when even the first chunk fails, without sorting', async () => {
    const api = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body))
      if (body.step === 'list') return { ids: ['m1'], truncated: false } as never
      throw new Error('Gmail is busy: too many requests in the last minute. Try again in a minute.')
    })
    render(<TriagePanel api={api} onApplied={vi.fn()} onClose={vi.fn()} />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Triage unread emails' }))
    })
    expect(screen.getByRole('status').textContent).toMatch(/^Gmail is busy/)
    expect(api.mock.calls.map(([, init]) => JSON.parse(String(init?.body)).step)).toEqual(['list', 'read'])
  })

  it('summarises categories, lets senders be unticked, and archives only what is still ticked', async () => {
    const calls: Array<{ url: string; body: unknown }> = []
    const api = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null })
      if (url !== '/api/mail/triage') return { ok: true } as never
      const step = (calls[calls.length - 1]?.body as { step?: string } | null)?.step
      if (step === 'list') return { ids: ['a0'], truncated: false } as never
      if (step === 'read') return { messages: [{ messageId: 'a0' }] } as never
      const { truncated: _t, ...sorted } = RESULT
      return sorted as never
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
    expect(calls.filter((call) => call.url === '/api/mail/triage/apply')[0]).toEqual({ url: '/api/mail/triage/apply', body: { messageIds: ANN_IDS, action: 'archive' } })
    expect(onApplied).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('Ann')).toBeNull()
    expect(screen.getByText('33 unread emails from 2 senders.')).toBeTruthy()
  })
})
