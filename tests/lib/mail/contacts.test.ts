import { describe, expect, it } from 'vitest'
import { buildMailContacts, parseAddressList, type ContactSourceMessage } from '@/lib/mail/contacts'
import { addressesIn, applyRecipient, matchMailContacts, recipientTokenAt } from '@/lib/mail/contacts-shared'

const msg = (m: Partial<ContactSourceMessage>): ContactSourceMessage => ({ sent: false, from: '', to: '', cc: '', labelIds: ['INBOX'], ...m })
const OWN = ['me@od.com']

describe('parseAddressList', () => {
  it('reads names, quoted names with commas and bare addresses', () => {
    expect(parseAddressList('Jo Smith <Jo@X.com>, "Lee, Sam" <sam@y.com>; kim@z.com')).toEqual([
      { email: 'jo@x.com', name: 'Jo Smith' },
      { email: 'sam@y.com', name: 'Lee, Sam' },
      { email: 'kim@z.com', name: '' },
    ])
  })

  it('drops invalid entries and names that are just the address', () => {
    expect(parseAddressList('not an email, "a@b.com" <a@b.com>')).toEqual([{ email: 'a@b.com', name: '' }])
  })
})

describe('buildMailContacts', () => {
  it('uses people from sent and received mail, never your own address', () => {
    const contacts = buildMailContacts(
      [
        msg({ sent: true, labelIds: ['SENT'], from: 'me@od.com', to: 'Carli <carli@client.com>', cc: 'me@od.com' }),
        msg({ from: 'Dan Lee <dan@other.com>', to: 'me@od.com' }),
      ],
      OWN,
    )
    expect(contacts).toEqual([
      { email: 'carli@client.com', name: 'Carli' },
      { email: 'dan@other.com', name: 'Dan Lee' },
    ])
  })

  it('leaves out marketing and account emails', () => {
    const contacts = buildMailContacts(
      [
        msg({ from: 'Shop <deals@shop.com>', labelIds: ['INBOX', 'CATEGORY_PROMOTIONS'] }),
        msg({ from: 'Xero <messaging@xero.com>', labelIds: ['INBOX', 'CATEGORY_UPDATES'] }),
        msg({ from: 'News <hello@brand.com>', listUnsubscribe: '<mailto:u@brand.com>' }),
        msg({ from: 'Google <no-reply@accounts.google.com>' }),
        msg({ from: 'Stripe <billing@stripe.com>' }),
        msg({ from: 'Real Person <real@person.com>' }),
        // Even when you wrote to one, a no-reply/account mailbox is not a person.
        msg({ sent: true, labelIds: ['SENT'], to: 'noreply@app.com, accounts@vendor.com' }),
      ],
      OWN,
    )
    expect(contacts.map((c) => c.email)).toEqual(['real@person.com'])
  })

  it('ranks people you emailed first, then by how often, then most recent', () => {
    const contacts = buildMailContacts(
      [
        msg({ from: 'often@x.com' }),
        msg({ from: 'new@x.com' }),
        msg({ from: 'often@x.com' }),
        msg({ sent: true, labelIds: ['SENT'], to: 'wrote@x.com' }),
      ],
      OWN,
    )
    expect(contacts.map((c) => c.email)).toEqual(['wrote@x.com', 'often@x.com', 'new@x.com'])
  })
})

describe('matchMailContacts', () => {
  const contacts = [
    { email: 'carli@client.com', name: 'Carli Brown' },
    { email: 'cameron@agency.com', name: '' },
    { email: 'jo@brownco.com', name: 'Jo Smith' },
  ]

  it('waits for two letters', () => {
    expect(matchMailContacts(contacts, 'c')).toEqual([])
    expect(matchMailContacts(contacts, 'ca').map((c) => c.email)).toEqual(['carli@client.com', 'cameron@agency.com'])
  })

  it('matches name words and domains, and skips addresses already added', () => {
    expect(matchMailContacts(contacts, 'bro').map((c) => c.email)).toEqual(['carli@client.com', 'jo@brownco.com'])
    expect(matchMailContacts(contacts, 'agen').map((c) => c.email)).toEqual(['cameron@agency.com'])
    expect(matchMailContacts(contacts, 'ca', new Set(['carli@client.com'])).map((c) => c.email)).toEqual(['cameron@agency.com'])
  })
})

describe('recipient field editing', () => {
  it('replaces only the address being typed and leaves room for the next', () => {
    const value = 'a@b.com, car'
    const token = recipientTokenAt(value, value.length)
    expect(token.text).toBe('car')
    expect(applyRecipient(value, token, 'carli@client.com')).toEqual({ value: 'a@b.com, carli@client.com, ', caret: 27 })
    expect(addressesIn('A@B.com, x')).toEqual(new Set(['a@b.com']))
  })
})
