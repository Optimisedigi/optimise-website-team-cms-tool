import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/headers', () => ({
  headers: vi.fn(() => Promise.resolve(new Headers())),
}))

const mockPayload = {
  auth: vi.fn(),
  find: vi.fn(),
  create: vi.fn(),
  delete: vi.fn(),
}

vi.mock('payload', () => ({
  getPayload: vi.fn(() => Promise.resolve(mockPayload)),
}))

vi.mock('@/payload.config', () => ({
  default: Promise.resolve({}),
}))

import { POST } from '@/app/(frontend)/api/costs/projection/adjustments/route'
import { DELETE } from '@/app/(frontend)/api/costs/projection/adjustments/[id]/route'
import { NextRequest } from 'next/server'

const post = (body: unknown) =>
  new NextRequest('http://localhost:3001/api/costs/projection/adjustments', { method: 'POST', body: JSON.stringify(body) })
const del = (id: string) =>
  DELETE(new NextRequest(`http://localhost:3001/api/costs/projection/adjustments/${id}`, { method: 'DELETE' }), { params: Promise.resolve({ id }) })

describe('manual estimate adjustments API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPayload.auth.mockResolvedValue({ user: { id: 1, role: 'admin' } })
    mockPayload.create.mockResolvedValue({ id: 5 })
    mockPayload.find.mockResolvedValue({ docs: [{ id: 5 }] })
  })

  it('adds an estimated cost to a month, keeping its category', async () => {
    const res = await POST(post({ month: '2026-11', kind: 'cost', amount: 249.999, description: '  New tool ', account: 'Software' }))
    expect(await res.json()).toEqual({ ok: true, id: 5 })
    expect(mockPayload.create).toHaveBeenCalledWith(expect.objectContaining({
      collection: 'estimate-adjustments',
      data: { month: '2026-11', kind: 'cost', amount: 250, description: 'New tool', account: 'Software' },
    }))
  })

  it('drops the category on estimated invoices', async () => {
    await POST(post({ month: '2026-12', kind: 'invoiced', amount: -500, description: 'Discount', account: 'Software' }))
    expect(mockPayload.create.mock.calls[0]?.[0].data).toMatchObject({ kind: 'invoiced', amount: -500, account: null })
  })

  it('replaces a client\u2019s estimated retainer, keeping the client record as it is', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 22, 12))
    mockPayload.find.mockResolvedValueOnce({ docs: [{ id: 7, name: 'Acme' }] })

    const res = await POST(post({ kind: 'retainer', clientId: 7, amount: 3000 }))

    expect(await res.json()).toEqual({ ok: true, id: 5 })
    expect(mockPayload.delete).toHaveBeenCalledWith({
      collection: 'estimate-adjustments',
      where: { and: [{ kind: { equals: 'retainer' } }, { clientId: { equals: 7 } }] },
      overrideAccess: true,
    })
    expect(mockPayload.create.mock.calls[0]?.[0].data).toEqual({
      month: '2026-10',
      kind: 'retainer',
      amount: 3000,
      description: 'Estimated retainer for Acme',
      clientId: 7,
    })
    vi.useRealTimers()
  })

  it('404s a retainer override for an unknown client', async () => {
    mockPayload.find.mockResolvedValueOnce({ docs: [] })
    expect((await POST(post({ kind: 'retainer', clientId: 99, amount: 100 }))).status).toBe(404)
    expect(mockPayload.create).not.toHaveBeenCalled()
  })

  it.each([
    [{ kind: 'retainer', clientId: 7, amount: -1 }],
    [{ kind: 'retainer', clientId: '7', amount: 100 }],
    [{ month: '2026-13', kind: 'cost', amount: 1, description: 'x' }],
    [{ month: '2026-11', kind: 'refund', amount: 1, description: 'x' }],
    [{ month: '2026-11', kind: 'cost', amount: 0, description: 'x' }],
    [{ month: '2026-11', kind: 'cost', amount: '100', description: 'x' }],
    [{ month: '2026-11', kind: 'cost', amount: 100, description: '   ' }],
  ])('rejects %j with 400', async (body) => {
    expect((await POST(post(body))).status).toBe(400)
    expect(mockPayload.create).not.toHaveBeenCalled()
  })

  it('removes an adjustment, 404s on unknown ids and 400s on bad ids', async () => {
    expect((await del('5')).status).toBe(200)
    expect(mockPayload.delete).toHaveBeenCalledWith({ collection: 'estimate-adjustments', id: 5, overrideAccess: true })
    mockPayload.find.mockResolvedValueOnce({ docs: [] })
    expect((await del('6')).status).toBe(404)
    expect((await del('abc')).status).toBe(400)
    expect(mockPayload.delete).toHaveBeenCalledTimes(1)
  })

  it('returns 401 without a session and 403 without finance access', async () => {
    mockPayload.auth.mockResolvedValueOnce({ user: null })
    expect((await POST(post({}))).status).toBe(401)
    mockPayload.auth.mockResolvedValueOnce({ user: { id: 2, role: 'editor', features: [] } })
    expect((await POST(post({}))).status).toBe(403)
    mockPayload.auth.mockResolvedValueOnce({ user: { id: 2, role: 'editor', features: [] } })
    expect((await del('5')).status).toBe(403)
    expect(mockPayload.create).not.toHaveBeenCalled()
    expect(mockPayload.delete).not.toHaveBeenCalled()
  })
})
