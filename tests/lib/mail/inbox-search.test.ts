import { describe, expect, it } from 'vitest'
import { inboxSearchQuery, mailSearchQuery, parseSearchScope, parseSearchSenders, rankMailSearchResults } from '@/lib/mail/inbox-search'

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

describe('mailSearchQuery (Search in)', () => {
  it('searches only the person, the subject or the text when asked', () => {
    expect(mailSearchQuery('rebe', { folder: 'inbox', scope: 'person', senderAddresses: ['rebekah@x.com'] })).toBe('{from:rebe from:rebekah@x.com}')
    expect(mailSearchQuery('weekly report', { folder: 'inbox', scope: 'subject' })).toBe('subject:(weekly report)')
    expect(mailSearchQuery('invoice', { folder: 'inbox', scope: 'body', senderAddresses: ['rebekah@x.com'] })).toBe('invoice')
  })

  it('keeps the inbox default as before, and matches recipients in Sent and Drafts', () => {
    expect(mailSearchQuery('rebe', { folder: 'inbox', senderAddresses: ['rebekah@x.com'] })).toBe(inboxSearchQuery('rebe', ['rebekah@x.com']))
    expect(mailSearchQuery('carli', { folder: 'sent', senderAddresses: ['carli@x.com'] })).toBe(
      '{carli to:carli cc:carli bcc:carli to:carli@x.com cc:carli@x.com}',
    )
    expect(mailSearchQuery('carli', { folder: 'drafts', scope: 'person' })).toBe('{to:carli cc:carli bcc:carli}')
  })

  it('passes Gmail syntax through whatever the scope, and reads the scope parameter safely', () => {
    expect(mailSearchQuery('from:jo', { folder: 'inbox', scope: 'subject' })).toBe('from:jo')
    expect(mailSearchQuery('  ', { folder: 'inbox', scope: 'subject' })).toBe('')
    expect(parseSearchScope('subject')).toBe('subject')
    expect(parseSearchScope('} OR in:trash')).toBe('all')
    expect(parseSearchScope(null)).toBe('all')
  })
})

describe('rankMailSearchResults', () => {
  const row = (from: string, subject: string, snippet = '') => ({ from, to: 'me@od.com', subject, snippet })
  it('puts the person match first, then subject, then preview, keeping Gmail order for ties', () => {
    const rows = [
      row('Sam <sam@x.com>', 'Other', 'mentions budget here'),
      row('Sam <sam@x.com>', 'Budget for May'),
      row('Budget Bot <bot@budget.io>', 'Hi'),
      row('Ann <ann@y.com>', 'Budget for June'),
    ]
    expect(rankMailSearchResults(rows, 'budget', { folder: 'inbox' }).map((r) => r.subject)).toEqual([
      'Hi',
      'Budget for May',
      'Budget for June',
      'Other',
    ])
  })
  it('keeps Gmail order for hand-written Gmail searches', () => {
    const rows = [row('A <a@x.com>', 'one'), row('budget <b@x.com>', 'two')]
    expect(rankMailSearchResults(rows, 'from:budget', { folder: 'inbox' })).toEqual(rows)
  })
})
