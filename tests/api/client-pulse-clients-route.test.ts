import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  payload: {
    auth: vi.fn(),
    find: vi.fn(),
    update: vi.fn(),
  },
  userHasFeature: vi.fn(),
  createLocalReq: vi.fn(),
}))

vi.mock('payload', () => ({
  getPayload: vi.fn(async () => mocks.payload),
  createLocalReq: mocks.createLocalReq,
}))
vi.mock('@/payload.config', () => ({ default: Promise.resolve({}) }))
vi.mock('@/lib/access', () => ({ userHasFeature: mocks.userHasFeature }))

import { POST } from '@/app/(frontend)/api/client-pulse/clients/route'

function request(clientIds: unknown, headers: Record<string, string> = {}) {
  return new Request('https://cms.test/api/client-pulse/clients', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify({ clientIds }),
  })
}

describe('POST /api/client-pulse/clients', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.payload.auth.mockResolvedValue({ user: { id: 7 } })
    mocks.userHasFeature.mockReturnValue(true)
    mocks.createLocalReq.mockResolvedValue({ user: { id: 7 } })
    mocks.payload.find.mockResolvedValue({
      docs: [{ id: 3, clientPulse: { priority: 'normal' } }],
    })
    mocks.payload.update.mockResolvedValue({})
  })

  it('rejects requests without an authenticated user', async () => {
    mocks.payload.auth.mockResolvedValue({ user: null })
    const response = await POST(request([3]))

    expect(response.status).toBe(401)
    expect(mocks.payload.find).not.toHaveBeenCalled()
  })

  it('rejects users who cannot access Client Pulse', async () => {
    mocks.userHasFeature.mockReturnValue(false)
    const response = await POST(request([3]))

    expect(response.status).toBe(403)
    expect(mocks.payload.find).not.toHaveBeenCalled()
  })

  it('validates IDs and only updates server-approved active clients', async () => {
    const response = await POST(request([3, 4]))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ added: 1 })
    expect(mocks.payload.find).toHaveBeenCalledWith(
      expect.objectContaining({
        overrideAccess: false,
        where: {
          and: [
            { id: { in: [3, 4] } },
            { isActive: { not_equals: false } },
            { 'clientPulse.enabled': { not_equals: true } },
          ],
        },
      }),
    )
    expect(mocks.payload.update).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 3,
        overrideAccess: false,
        data: { clientPulse: { priority: 'normal', enabled: true } },
      }),
    )
  })

  it('rejects malformed client IDs before querying data', async () => {
    const response = await POST(request([3, '4']))

    expect(response.status).toBe(400)
    expect(mocks.payload.find).not.toHaveBeenCalled()
  })
})
