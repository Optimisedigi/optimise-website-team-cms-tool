import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ClientUnreadMailCard from '@/components/ClientUnreadMailCard'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function stubResponse(status: number, body: unknown) {
  const fetchMock = vi.fn(() => Promise.resolve({ ok: status >= 200 && status < 300, status, json: async () => body }))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('ClientUnreadMailCard', () => {
  it('lists unread client emails with sender and subject, linking to the thread in Mail', async () => {
    const fetchMock = stubResponse(200, {
      clientSenderCount: 1,
      more: false,
      emails: [{ threadId: 'abc123', from: 'Jo Smith <jo@client.com>', subject: 'Invoice question', date: '2026-10-15T01:00:00.000Z', messageCount: 1 }],
    })

    render(<ClientUnreadMailCard />)

    expect(screen.getByText('Loading unread client emails...')).toBeInTheDocument()
    expect(await screen.findByText('Jo Smith')).toBeInTheDocument()
    expect(screen.getByText('Invoice question')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Jo Smith/ })).toHaveAttribute('href', '/admin/mail?thread=abc123')
    expect(fetchMock).toHaveBeenCalledWith('/api/mail/client-unread', expect.objectContaining({ credentials: 'include' }))
  })

  it('shows an empty state when no client sender has unread mail', async () => {
    stubResponse(200, { clientSenderCount: 2, more: false, emails: [] })
    render(<ClientUnreadMailCard />)
    expect(await screen.findByText('No unread emails from clients.')).toBeInTheDocument()
  })

  it('prompts to star senders when none are marked as clients', async () => {
    stubResponse(200, { clientSenderCount: 0, more: false, emails: [] })
    render(<ClientUnreadMailCard />)
    expect(await screen.findByText(/No client senders yet/)).toBeInTheDocument()
  })

  it('offers Connect Gmail when Gmail is not connected', async () => {
    stubResponse(403, { error: 'gmail-not-connected', connectUrl: '/api/gmail/connect' })
    render(<ClientUnreadMailCard />)
    expect(await screen.findByRole('link', { name: 'Connect Gmail' })).toHaveAttribute('href', '/api/gmail/connect')
  })

  it('renders nothing for users without the Mail feature', async () => {
    const fetchMock = stubResponse(403, { error: 'Mail is not enabled for your account.' })
    const { container } = render(<ClientUnreadMailCard />)
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled())
    await vi.waitFor(() => expect(container).toBeEmptyDOMElement())
  })

  it('shows an error with Retry on other failures', async () => {
    const fetchMock = stubResponse(502, { error: 'Could not load unread client emails from Gmail.' })
    render(<ClientUnreadMailCard />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load unread client emails from Gmail.')
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
  })
})
