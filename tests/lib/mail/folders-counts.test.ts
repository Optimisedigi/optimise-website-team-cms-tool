import { describe, expect, it } from 'vitest'
import { MAIL_FOLDERS, MAIL_TABS, mailTabLabel } from '@/lib/mail/folders'

describe('mailTabLabel', () => {
  it('puts the unread count in parentheses on Inbox and the draft count on Drafts', () => {
    const counts = { inboxUnread: 12, drafts: 3 }
    expect(mailTabLabel('inbox', counts)).toBe('Inbox (12)')
    expect(mailTabLabel('drafts', counts)).toBe('Drafts (3)')
  })

  it('badges Scheduled with the emails waiting to send, and never badges Sent', () => {
    expect(mailTabLabel('scheduled', { inboxUnread: 12, drafts: 3, scheduled: 2 })).toBe('Scheduled (2)')
    expect(mailTabLabel('scheduled', { inboxUnread: 12, drafts: 3 })).toBe('Scheduled')
    expect(mailTabLabel('scheduled', { inboxUnread: 0, drafts: 0, scheduled: 0 })).toBe('Scheduled')
    expect(mailTabLabel('sent', { inboxUnread: 12, drafts: 3, scheduled: 2 })).toBe('Sent')
  })

  it('shows no badge for zero, unknown or invalid counts', () => {
    expect(mailTabLabel('inbox', { inboxUnread: 0, drafts: 0 })).toBe('Inbox')
    expect(mailTabLabel('drafts', { inboxUnread: 0, drafts: 0 })).toBe('Drafts')
    expect(mailTabLabel('inbox', null)).toBe('Inbox')
    expect(mailTabLabel('drafts', { inboxUnread: 1, drafts: Number.NaN })).toBe('Drafts')
  })

  it('adds Scheduled and Awaiting reply as tabs without changing the Gmail folders', () => {
    expect(MAIL_FOLDERS).toEqual(['inbox', 'sent', 'drafts'])
    expect(MAIL_TABS).toEqual(['inbox', 'sent', 'drafts', 'scheduled', 'awaiting'])
  })

  it('labels Awaiting reply and badges it with the reminders that are due', () => {
    expect(mailTabLabel('awaiting', { inboxUnread: 1, drafts: 0, followUpsDue: 2 })).toBe('Awaiting reply (2)')
    expect(mailTabLabel('awaiting', { inboxUnread: 1, drafts: 0, followUpsDue: 0 })).toBe('Awaiting reply')
    expect(mailTabLabel('awaiting', null)).toBe('Awaiting reply')
  })
})
