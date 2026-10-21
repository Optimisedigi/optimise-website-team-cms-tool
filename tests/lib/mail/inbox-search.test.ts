import { describe, expect, it } from 'vitest'
import { inboxSearchQuery } from '@/lib/mail/inbox-search'

describe('inboxSearchQuery', () => {
  it('matches a full sender address as well as free text', () => {
    expect(inboxSearchQuery('audits@optimisedigital.online')).toBe(
      '{audits@optimisedigital.online from:audits@optimisedigital.online}',
    )
  })

  it('matches part of an address (domain or local part)', () => {
    expect(inboxSearchQuery('optimisedigital.online')).toBe('{optimisedigital.online from:optimisedigital.online}')
    expect(inboxSearchQuery('no-reply')).toBe('{no-reply from:no-reply}')
  })

  it('keeps a subject search as the same free text, OR the sender', () => {
    expect(inboxSearchQuery('budget')).toBe('{budget from:budget}')
    // Several words stay one AND group, as before.
    expect(inboxSearchQuery('  campaign   build ')).toBe('{(campaign build) from:(campaign build)}')
  })

  it('passes hand-written Gmail searches through unchanged', () => {
    for (const raw of [
      'from:jo@client.com',
      'subject:invoice',
      '"campaign build"',
      'budget -newsletter',
      '+exact',
      'jo OR amy',
      '{jo amy}',
      '(jo amy)',
    ]) {
      expect(inboxSearchQuery(raw)).toBe(raw)
    }
  })

  it('returns an empty string for an empty search', () => {
    expect(inboxSearchQuery('')).toBe('')
    expect(inboxSearchQuery('   ')).toBe('')
  })
})
