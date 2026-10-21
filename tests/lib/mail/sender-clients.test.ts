import { describe, expect, it } from 'vitest'
import { buildClientDomainIndex, matchMessageToClient, type MatchableClient } from '@/lib/mail/client-matching'
import { cleanSenderClients, normaliseSenderEntry, senderClientFor, withSenderClient } from '@/lib/mail/sender-clients'

const CLIENTS: MatchableClient[] = [
  { id: 1, name: 'Acme', websiteUrl: 'https://acme.com.au', contactEmail: 'jo@acme.com.au' },
  { id: 2, name: 'Beta', websiteUrl: 'beta.com' },
]

describe('sender → client choices in matching', () => {
  it('a chosen client beats automatic matching, exact address before domain', () => {
    const index = buildClientDomainIndex(CLIENTS, {
      overrides: [
        { sender: '@acme.com.au', clientId: 2 },
        { sender: 'jo@acme.com.au', clientId: 1 },
      ],
    })
    expect(matchMessageToClient(index, { from: 'Sam <sam@mail.acme.com.au>' })).toMatchObject({ clientId: 2, clientName: 'Beta', matchType: 'domain' })
    expect(matchMessageToClient(index, { from: 'Jo <jo@acme.com.au>' })).toMatchObject({ clientId: 1, matchedOn: 'jo@acme.com.au' })
    // A sender no client claims can be given one too, even on a shared provider.
    const gmail = buildClientDomainIndex(CLIENTS, { overrides: [{ sender: 'owner@gmail.com', clientId: 1 }] })
    expect(matchMessageToClient(gmail, { from: 'owner@gmail.com' })).toMatchObject({ clientId: 1 })
  })

  it('"No client" makes the sender unmatched, and choices naming a missing client are ignored', () => {
    const index = buildClientDomainIndex(CLIENTS, {
      overrides: [
        { sender: '@beta.com', clientId: null },
        { sender: 'jo@acme.com.au', clientId: 99 },
      ],
    })
    expect(matchMessageToClient(index, { from: 'pat@beta.com' })).toBeNull()
    expect(matchMessageToClient(index, { from: 'jo@acme.com.au' })).toMatchObject({ clientId: 1, matchType: 'address' })
  })

  it('never lets a choice claim our own addresses', () => {
    const index = buildClientDomainIndex(CLIENTS, {
      ownAddresses: ['peter@optimisedigital.online'],
      overrides: [{ sender: '@optimisedigital.online', clientId: 1 }],
    })
    expect(matchMessageToClient(index, { from: 'peter@optimisedigital.online', to: 'pat@beta.com' })).toMatchObject({ clientId: 2 })
  })
})

describe('sender → client storage helpers', () => {
  it('normalises entries and refuses whole shared providers', () => {
    expect(normaliseSenderEntry('Jo <JO@Acme.com.au>')).toBe('jo@acme.com.au')
    expect(normaliseSenderEntry('acme.com.au')).toBe('@acme.com.au')
    expect(normaliseSenderEntry('@gmail.com')).toBeNull()
    expect(normaliseSenderEntry('someone@gmail.com')).toBe('someone@gmail.com')
  })

  it('cleans stored lists: bad rows dropped, latest choice per sender wins', () => {
    expect(
      cleanSenderClients([
        { sender: 'jo@acme.com.au', clientId: 1 },
        { sender: 'bad', clientId: 1 },
        { sender: '@beta.com', clientId: 'x' },
        { sender: 'JO@acme.com.au', clientId: 2 },
        { sender: '@beta.com', clientId: null },
      ]),
    ).toEqual([
      { sender: 'jo@acme.com.au', clientId: 2 },
      { sender: '@beta.com', clientId: null },
    ])
    expect(cleanSenderClients('nope')).toEqual([])
  })

  it('finds the choice for a From header and updates or removes one', () => {
    const list = [
      { sender: '@acme.com.au', clientId: 2 },
      { sender: 'jo@acme.com.au', clientId: 1 },
    ]
    expect(senderClientFor('"jo@acme.com.au" <x@evil.com>', list)).toBeUndefined()
    expect(senderClientFor('Jo <jo@acme.com.au>', list)).toEqual({ sender: 'jo@acme.com.au', clientId: 1 })
    expect(senderClientFor('sam@mail.acme.com.au', list)).toEqual({ sender: '@acme.com.au', clientId: 2 })
    expect(withSenderClient(list, '@acme.com.au', undefined)).toEqual([{ sender: 'jo@acme.com.au', clientId: 1 }])
    expect(withSenderClient(list, 'jo@acme.com.au', null)).toEqual([
      { sender: '@acme.com.au', clientId: 2 },
      { sender: 'jo@acme.com.au', clientId: null },
    ])
  })
})
