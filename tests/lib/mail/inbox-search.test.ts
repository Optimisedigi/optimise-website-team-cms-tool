import { describe, expect, it } from 'vitest'
import { inboxSearchQuery, parseSearchSenders } from '@/lib/mail/inbox-search'

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

describe('inboxSearchQuery with matched senders', () => {
  it('adds each matched person as another from: match, so part of a name finds their mail', () => {
    expect(inboxSearchQuery('rebe', ['rebekah@inthepicture.com.au', 'rebecca@x.com'])).toBe(
      '{rebe from:rebe from:rebekah@inthepicture.com.au from:rebecca@x.com}',
    )
  })

  it('drops anything that is not a plain address, and leaves Gmail syntax alone', () => {
    expect(inboxSearchQuery('rebe', ['rebekah@x.com} OR in:trash', 'REBEKAH@X.COM'])).toBe('{rebe from:rebe from:rebekah@x.com}')
    expect(inboxSearchQuery('from:rebe', ['rebekah@x.com'])).toBe('from:rebe')
    expect(inboxSearchQuery('jo@x.com', ['jo@x.com'])).toBe('{jo@x.com from:jo@x.com}')
  })
})

describe('parseSearchSenders', () => {
  it('keeps valid, unique addresses up to the limit', () => {
    expect(parseSearchSenders(null)).toEqual([])
    expect(parseSearchSenders(' A@x.com, a@x.com,bad,b@y.co ')).toEqual(['a@x.com', 'b@y.co'])
    const many = Array.from({ length: 15 }, (_, i) => `p${i}@x.com`).join(',')
    expect(parseSearchSenders(many)).toHaveLength(10)
  })
})
