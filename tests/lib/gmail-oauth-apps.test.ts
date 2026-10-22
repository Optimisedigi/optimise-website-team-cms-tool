import { afterEach, describe, expect, it } from 'vitest'
import { createGmailOAuthClient, gmailAltDomains, gmailAppForEmail, gmailAppMatchesEmail } from '@/lib/gmail-oauth-apps'

const ENV = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GMAIL_REDIRECT_URI', 'GMAIL_ALT_CLIENT_ID', 'GMAIL_ALT_CLIENT_SECRET', 'GMAIL_ALT_DOMAINS'] as const
const saved = Object.fromEntries(ENV.map((key) => [key, process.env[key]]))

afterEach(() => {
  for (const key of ENV) {
    if (saved[key] === undefined) delete process.env[key]
    else process.env[key] = saved[key]
  }
})

const setAlt = (domains = 'cipherhealth.com.au') => {
  process.env.GOOGLE_CLIENT_ID = 'main-id'
  process.env.GOOGLE_CLIENT_SECRET = 'main-secret'
  process.env.GMAIL_REDIRECT_URI = 'https://cms.test/api/gmail/callback'
  process.env.GMAIL_ALT_CLIENT_ID = 'alt-id'
  process.env.GMAIL_ALT_CLIENT_SECRET = 'alt-secret'
  process.env.GMAIL_ALT_DOMAINS = domains
}

describe('Gmail OAuth app per account', () => {
  it('sends the second app’s domains to it and everything else to the main app', () => {
    setAlt(' @CipherHealth.com.au ,example.org, not a domain, cipherhealth.com.au')
    expect(gmailAltDomains()).toEqual(['cipherhealth.com.au', 'example.org'])
    expect(gmailAppForEmail('Peter@CipherHealth.com.au')).toBe('alt')
    expect(gmailAppForEmail('peter@optimisedigital.online')).toBe('main')
    // A subdomain or look-alike is not the domain.
    expect(gmailAppForEmail('x@mail.cipherhealth.com.au')).toBe('main')
    expect(gmailAppForEmail('x@cipherhealth.com.au.evil.com')).toBe('main')
    expect(gmailAppForEmail('')).toBe('main')
    expect(gmailAppMatchesEmail('alt', 'peter@cipherhealth.com.au')).toBe(true)
    expect(gmailAppMatchesEmail('main', 'peter@cipherhealth.com.au')).toBe(false)
  })

  it('treats a half-configured second app as absent', () => {
    setAlt()
    delete process.env.GMAIL_ALT_CLIENT_SECRET
    expect(gmailAltDomains()).toEqual([])
    expect(gmailAppForEmail('peter@cipherhealth.com.au')).toBe('main')
    expect(() => createGmailOAuthClient('alt')).toThrow(/not configured/)
  })

  it('builds each app’s client with its own credentials and the shared redirect', () => {
    setAlt()
    const alt = createGmailOAuthClient('alt') as unknown as { _clientId: string; _clientSecret: string; redirectUri: string }
    const main = createGmailOAuthClient('main') as unknown as { _clientId: string; redirectUri: string }
    expect(alt._clientId).toBe('alt-id')
    expect(alt._clientSecret).toBe('alt-secret')
    expect(alt.redirectUri).toBe('https://cms.test/api/gmail/callback')
    expect(main._clientId).toBe('main-id')
    expect(main.redirectUri).toBe('https://cms.test/api/gmail/callback')
  })
})
