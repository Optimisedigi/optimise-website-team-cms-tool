import { describe, expect, it, vi } from 'vitest'

const threadsList = vi.fn()
const threadsGet = vi.fn()
const messagesList = vi.fn()
vi.mock('googleapis', () => ({
  google: {
    auth: { OAuth2: class { setCredentials() {} } },
    gmail: () => ({ users: { threads: { list: threadsList, get: threadsGet }, messages: { list: messagesList } } }),
  },
}))

const { listFolderThreads } = await import('@/lib/mail/gmail-mail')
const { parseMailFolder } = await import('@/lib/mail/folders')

const message = (id: string, labelIds: string[], from: string, to: string, date: string) => ({
  id,
  labelIds,
  snippet: `snippet ${id}`,
  internalDate: String(Date.parse(date)),
  payload: {
    headers: [
      { name: 'From', value: from },
      { name: 'To', value: to },
      { name: 'Subject', value: 'Hello' },
      { name: 'Date', value: date },
    ],
  },
})

const thread = {
  messages: [
    message('m1', ['SENT'], 'me@od.com', 'jo@client.com', '2026-10-01T10:00:00Z'),
    message('m2', ['INBOX', 'UNREAD'], 'jo@client.com', 'me@od.com', '2026-10-02T10:00:00Z'),
    message('m3', ['DRAFT'], 'me@od.com', 'jo@client.com', '2026-10-03T10:00:00Z'),
  ],
}

describe('parseMailFolder', () => {
  it('accepts only the known folders', () => {
    expect(parseMailFolder('inbox')).toBe('inbox')
    expect(parseMailFolder('sent')).toBe('sent')
    expect(parseMailFolder('drafts')).toBe('drafts')
    expect(parseMailFolder('spam')).toBeNull()
    expect(parseMailFolder(undefined)).toBeNull()
  })
})

describe('listFolderThreads', () => {
  it('lists the inbox by its label and shows the latest message', async () => {
    threadsList.mockReset().mockResolvedValueOnce({ data: { threads: [{ id: 't1' }], nextPageToken: 'next' } })
    threadsGet.mockReset().mockResolvedValueOnce({ data: thread })
    const result = await listFolderThreads('tok', 'inbox')
    expect(threadsList).toHaveBeenCalledWith(expect.objectContaining({ labelIds: ['INBOX'] }))
    expect(result.nextPageToken).toBe('next')
    expect(result.threads[0]).toMatchObject({ threadId: 't1', messageId: 'm3', unread: true, messageCount: 3 })
  })

  // Regression: threads.list with a query returned threads out of date order and
  // dropped recent ones, so hidden-sender filtering hid new mail from the inbox.
  it('lists filtered folders via messages.list, newest first, one row per thread', async () => {
    threadsList.mockReset()
    messagesList.mockReset().mockResolvedValueOnce({
      data: {
        messages: [
          { id: 'a', threadId: 't2' },
          { id: 'b', threadId: 't1' },
          { id: 'c', threadId: 't2' },
        ],
        nextPageToken: 'p2',
      },
    })
    threadsGet.mockReset().mockResolvedValue({ data: thread })
    const result = await listFolderThreads('tok', 'inbox', { q: '-from:x.com' })
    expect(threadsList).not.toHaveBeenCalled()
    expect(messagesList).toHaveBeenCalledWith(expect.objectContaining({ labelIds: ['INBOX'], q: '-from:x.com' }))
    expect(result.threads.map((row) => row.threadId)).toEqual(['t2', 't1'])
    expect(result.nextPageToken).toBe('p2')
  })

  it('shows the latest sent message in Sent, not the incoming reply or the draft', async () => {
    threadsList.mockReset().mockResolvedValueOnce({ data: { threads: [{ id: 't1' }] } })
    threadsGet.mockReset().mockResolvedValueOnce({ data: thread })
    const result = await listFolderThreads('tok', 'sent')
    expect(threadsList).toHaveBeenCalledWith(expect.objectContaining({ labelIds: ['SENT'] }))
    expect(result.threads[0]).toMatchObject({
      messageId: 'm1',
      from: 'me@od.com',
      to: 'jo@client.com',
      snippet: 'snippet m1',
      date: '2026-10-01T10:00:00.000Z',
    })
  })

  it('uses the draft message id for Drafts rows so the compose window can open it', async () => {
    threadsList.mockReset().mockResolvedValueOnce({ data: { threads: [{ id: 't1' }] } })
    threadsGet.mockReset().mockResolvedValueOnce({ data: thread })
    const result = await listFolderThreads('tok', 'drafts')
    expect(threadsList).toHaveBeenCalledWith(expect.objectContaining({ labelIds: ['DRAFT'] }))
    expect(result.threads[0]).toMatchObject({ messageId: 'm3', to: 'jo@client.com' })
    expect(result.nextPageToken).toBeNull()
  })
})
