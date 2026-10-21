import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { signOAuthState } from '@/lib/oauth-state'

const mockPayload = {
  auth: vi.fn(),
  find: vi.fn(),
  findByID: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}
const cookieJar = new Map<string, string>()

vi.mock('payload', () => ({ getPayload: vi.fn(() => Promise.resolve(mockPayload)) }))
vi.mock('@/payload.config', () => ({ default: Promise.resolve({}) }))
vi.mock('next/headers', () => ({
  headers: vi.fn(async () => new Headers()),
  cookies: vi.fn(async () => ({
    get: (name: string) => (cookieJar.has(name) ? { name, value: cookieJar.get(name) } : undefined),
    set: (name: string, value: string) => cookieJar.set(name, value),
    delete: (name: string) => cookieJar.delete(name),
  })),
}))
const getGmailOAuthUrl = vi.fn((state: string, options?: { selectAccount?: boolean }) => `https://google.test/?state=${state}&select=${options?.selectAccount ? 1 : 0}`)
const exchangeGmailCode = vi.fn()
const refreshGmailAccessToken = vi.fn()
vi.mock('@/lib/gmail-service', () => ({
  getGmailOAuthUrl: (state: string, options?: { selectAccount?: boolean }) => getGmailOAuthUrl(state, options),
  exchangeGmailCode: (code: string) => exchangeGmailCode(code),
  refreshGmailAccessToken: (token: string) => refreshGmailAccessToken(token),
}))

const connect = await import('@/app/(frontend)/api/gmail/connect/route')
const callback = await import('@/app/(frontend)/api/gmail/callback/route')
const { getValidGmailToken } = await import('@/lib/agents/_shared/user-gmail-tokens')

const location = (res: Response) => new URL(res.headers.get('location') ?? 'http://x/')

beforeEach(() => {
  vi.clearAllMocks()
  cookieJar.clear()
  process.env.PAYLOAD_SECRET = 'test-secret'
  process.env.GOOGLE_CLIENT_ID = 'id'
  process.env.GOOGLE_CLIENT_SECRET = 'secret'
  process.env.GMAIL_REDIRECT_URI = 'http://localhost/api/gmail/callback'
  mockPayload.auth.mockResolvedValue({ user: { id: 7, role: 'admin' } })
  mockPayload.find.mockResolvedValue({ docs: [] })
})

describe('adding another Gmail account', () => {
  it('?add=1 marks the flow with its own nonce cookie and lets the user pick a Google login', async () => {
    const res = await connect.GET(new NextRequest('http://localhost/api/gmail/connect?add=1'))
    expect(cookieJar.has('oauth_nonce_gmail_add')).toBe(true)
    expect(cookieJar.has('oauth_nonce_gmail')).toBe(false)
    expect(location(res).searchParams.get('select')).toBe('1')
  })

  it('saves a different address as an extra account and leaves the main Gmail untouched', async () => {
    const { state, nonce } = signOAuthState(7, 7)
    cookieJar.set('oauth_nonce_gmail_add', nonce)
    mockPayload.findByID.mockResolvedValue({ id: 7, gmailConnected: true, gmailEmail: 'me@od.com' })
    exchangeGmailCode.mockResolvedValue({ email: 'Sales@OD.com', accessToken: 'a', refreshToken: 'r', expiry: null })
    const res = await callback.GET(new NextRequest(`http://localhost/api/gmail/callback?code=c&state=${encodeURIComponent(state)}`))
    expect(location(res).pathname).toBe('/admin/mail')
    expect(location(res).searchParams.get('account')).toBe('sales@od.com')
    expect(mockPayload.update).not.toHaveBeenCalledWith(expect.objectContaining({ collection: 'users' }))
    expect(mockPayload.create).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'mail-accounts',
        data: expect.objectContaining({ owner: 7, email: 'sales@od.com', accessToken: 'a', refreshToken: 'r' }),
      }),
    )
    expect(cookieJar.has('oauth_nonce_gmail_add')).toBe(false)
  })

  it('picking the main address again just refreshes the main Gmail', async () => {
    const { state, nonce } = signOAuthState(7, 7)
    cookieJar.set('oauth_nonce_gmail_add', nonce)
    mockPayload.findByID.mockResolvedValue({ id: 7, gmailConnected: true, gmailEmail: 'me@od.com' })
    exchangeGmailCode.mockResolvedValue({ email: 'me@od.com', accessToken: 'a', refreshToken: 'r', expiry: null })
    await callback.GET(new NextRequest(`http://localhost/api/gmail/callback?code=c&state=${encodeURIComponent(state)}`))
    expect(mockPayload.update).toHaveBeenCalledWith(expect.objectContaining({ collection: 'users', id: 7 }))
    expect(mockPayload.create).not.toHaveBeenCalled()
  })

  it('the normal connect flow still replaces the main Gmail', async () => {
    const { state, nonce } = signOAuthState(7, 7)
    cookieJar.set('oauth_nonce_gmail', nonce)
    exchangeGmailCode.mockResolvedValue({ email: 'other@od.com', accessToken: 'a', refreshToken: 'r', expiry: null })
    const res = await callback.GET(new NextRequest(`http://localhost/api/gmail/callback?code=c&state=${encodeURIComponent(state)}`))
    expect(location(res).pathname).toBe('/admin/settings/integrations')
    expect(mockPayload.update).toHaveBeenCalledWith(expect.objectContaining({ collection: 'users', data: expect.objectContaining({ gmailEmail: 'other@od.com' }) }))
    expect(mockPayload.create).not.toHaveBeenCalled()
  })
})

describe('getValidGmailToken with an account', () => {
  const user = { id: 7, email: 'peter@od.com', gmailConnected: true, gmailEmail: 'Me@od.com', gmailAccessToken: 'main', gmailRefreshToken: 'r', gmailTokenExpiry: '2999-01-01T00:00:00.000Z' }

  it('uses the main Gmail with no account or the main address', async () => {
    mockPayload.findByID.mockResolvedValue(user)
    expect(await getValidGmailToken(7)).toMatchObject({ ok: true, accessToken: 'main', account: '' })
    expect(await getValidGmailToken(7, 'me@od.com')).toMatchObject({ ok: true, accessToken: 'main', account: '' })
    expect(mockPayload.find).not.toHaveBeenCalled()
  })

  it('uses one of the user’s own extra accounts, refreshing an expired token', async () => {
    mockPayload.findByID.mockResolvedValue(user)
    mockPayload.find.mockResolvedValue({ docs: [{ id: 3, email: 'sales@od.com', accessToken: 'old', refreshToken: 'sr', tokenExpiry: '2000-01-01T00:00:00.000Z' }] })
    refreshGmailAccessToken.mockResolvedValue({ accessToken: 'fresh', expiry: '2999-01-01T00:00:00.000Z' })
    expect(await getValidGmailToken(7, 'Sales@od.com')).toMatchObject({ ok: true, accessToken: 'fresh', email: 'sales@od.com', account: 'sales@od.com' })
    expect(mockPayload.find).toHaveBeenCalledWith(
      expect.objectContaining({ collection: 'mail-accounts', where: { and: [{ owner: { equals: 7 } }, { email: { equals: 'sales@od.com' } }] } }),
    )
    expect(mockPayload.update).toHaveBeenCalledWith(expect.objectContaining({ collection: 'mail-accounts', id: 3, data: { accessToken: 'fresh', tokenExpiry: '2999-01-01T00:00:00.000Z' } }))
  })

  it('refuses an account the user has not connected', async () => {
    mockPayload.findByID.mockResolvedValue(user)
    mockPayload.find.mockResolvedValue({ docs: [] })
    const result = await getValidGmailToken(7, 'someone-else@od.com')
    expect(result.ok).toBe(false)
  })
})
