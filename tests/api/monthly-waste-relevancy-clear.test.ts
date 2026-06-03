import { describe, it, expect, vi, beforeEach } from 'vitest'
import crypto from 'crypto'
import { NextRequest } from 'next/server'

const mockPayload = {
  auth: vi.fn(),
  delete: vi.fn(),
  findByID: vi.fn(),
}

vi.mock('payload', () => ({
  getPayload: vi.fn(() => Promise.resolve(mockPayload)),
}))

vi.mock('@/payload.config', () => ({
  default: Promise.resolve({}),
}))

import { POST } from '@/app/(frontend)/api/dashboard/monthly-waste-relevancy/clear/route'

// Mirror the verify route's token signing. Resolves the same way the route
// does — tests/setup.ts sets PAYLOAD_SECRET="test-secret", so both sides HMAC
// with that value (the literal fallback only applies when no env is set).
const COOKIE_SECRET =
  process.env.PAYLOAD_SECRET || process.env.INTERNAL_API_KEY || 'dashboard-fallback-secret'

function signToken(slug: string, expiresAt: number): string {
  const payloadStr = `${slug}:${expiresAt}`
  const sig = crypto.createHmac('sha256', COOKIE_SECRET).update(payloadStr).digest('hex')
  return `${payloadStr}:${sig}`
}

function makeRequest(body: unknown, opts: { token?: string } = {}): NextRequest {
  const headers = new Headers({ 'content-type': 'application/json' })
  if (opts.token) headers.set('cookie', `dashboard_token=${opts.token}`)
  return new NextRequest('http://localhost/api/dashboard/monthly-waste-relevancy/clear', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
}

const validToken = (slug: string) => signToken(slug, Date.now() + 60_000)

describe('POST /api/dashboard/monthly-waste-relevancy/clear', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPayload.auth.mockResolvedValue({ user: null })
    mockPayload.delete.mockResolvedValue({ docs: [{ id: 1 }, { id: 2 }] })
    mockPayload.findByID.mockResolvedValue({ id: 5, slug: 'mtp-client' })
  })

  it('401 when no admin session and no dashboard token', async () => {
    const res = await POST(makeRequest({ clientId: 5, slug: 'mtp-client' }))
    expect(res.status).toBe(401)
    expect(mockPayload.delete).not.toHaveBeenCalled()
  })

  it('admin session clears any client without slug binding', async () => {
    mockPayload.auth.mockResolvedValue({ user: { id: 1 } })
    const res = await POST(makeRequest({ clientId: 5 }))
    expect(res.status).toBe(200)
    // Admin path must not require the slug→client lookup.
    expect(mockPayload.findByID).not.toHaveBeenCalled()
    expect(mockPayload.delete).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'negative-keyword-monthly-waste-relevancy-cache',
        where: { client: { equals: 5 } },
      }),
    )
  })

  it('valid dashboard token whose slug matches the target client clears the cache', async () => {
    const res = await POST(
      makeRequest({ clientId: 5, slug: 'mtp-client' }, { token: validToken('mtp-client') }),
    )
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
    expect(json.cleared).toBe(2)
    expect(mockPayload.delete).toHaveBeenCalledOnce()
  })

  it('401 when the token slug does not belong to the posted clientId (cross-tenant)', async () => {
    // Token is valid for "other-client", but clientId 5 resolves to "mtp-client".
    mockPayload.findByID.mockResolvedValue({ id: 5, slug: 'mtp-client' })
    const res = await POST(
      makeRequest({ clientId: 5, slug: 'other-client' }, { token: validToken('other-client') }),
    )
    expect(res.status).toBe(401)
    expect(mockPayload.delete).not.toHaveBeenCalled()
  })

  it('401 when the dashboard token is invalid (bad signature)', async () => {
    const res = await POST(
      makeRequest({ clientId: 5, slug: 'mtp-client' }, { token: 'mtp-client:9999999999999:deadbeef' }),
    )
    expect(res.status).toBe(401)
    expect(mockPayload.delete).not.toHaveBeenCalled()
  })

  it('400 when clientId is missing', async () => {
    mockPayload.auth.mockResolvedValue({ user: { id: 1 } })
    const res = await POST(makeRequest({ slug: 'mtp-client' }))
    expect(res.status).toBe(400)
    expect(mockPayload.delete).not.toHaveBeenCalled()
  })
})
