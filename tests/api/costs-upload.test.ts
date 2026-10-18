// @vitest-environment node
// jsdom's File isn't accepted by Node's multipart FormData parser.
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('next/headers', () => ({
  headers: vi.fn(() => Promise.resolve(new Headers())),
}))

const mockPayload = {
  auth: vi.fn(),
  find: vi.fn(),
  count: vi.fn(),
  create: vi.fn(),
}

vi.mock('payload', () => ({
  getPayload: vi.fn(() => Promise.resolve(mockPayload)),
}))

vi.mock('@/payload.config', () => ({
  default: Promise.resolve({}),
}))

import { POST } from '@/app/(frontend)/api/costs/upload/route'
import { NextRequest } from 'next/server'

function makeUpload(csv: string): NextRequest {
  const fd = new FormData()
  fd.append('file', new File([csv], 'statement.csv', { type: 'text/csv' }))
  return new NextRequest('http://localhost:3001/api/costs/upload', { method: 'POST', body: fd })
}

function created(collection: string): string[] {
  return mockPayload.create.mock.calls
    .filter((call) => call[0].collection === collection)
    .map((call) => call[0].data.description)
}

type Stored = { collection: string; date: string; amount: number; description: string }

/** Make payload.count answer from an in-memory list of already-imported rows. */
function storedRows(rows: Stored[]) {
  mockPayload.count.mockImplementation(async ({ collection, where }) => {
    const [date, amount, description] = where.and.map((c: Record<string, { equals: unknown }>) => Object.values(c)[0]?.equals)
    return {
      totalDocs: rows.filter((r) => r.collection === collection && r.date === date && r.amount === amount && r.description === description).length,
    }
  })
}

describe('POST /api/costs/upload', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPayload.auth.mockResolvedValue({ user: { id: 1, featureAccess: ['business-costs'] } })
    mockPayload.find.mockResolvedValue({ totalDocs: 0, docs: [] }) // no cost rules
    storedRows([])
    mockPayload.create.mockResolvedValue({ id: 1 })
  })

  it('imports the first transaction of a header-less CBA export', async () => {
    const csv = [
      '01/10/2026,"-31.00","VERCEL INC SAN FRANCISCO","+1000.00"',
      '02/10/2026,"-7.75","RAILWAY CORP","+992.25"',
    ].join('\n')

    const res = await POST(makeUpload(csv))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.total).toBe(2)
    expect(created('business-costs')).toEqual(['VERCEL INC SAN FRANCISCO', 'RAILWAY CORP'])
  })

  it('still skips a header row when one is present', async () => {
    const csv = [
      'Date,Amount,Description,Balance',
      '01/10/2026,"-31.00","VERCEL INC SAN FRANCISCO","+1000.00"',
    ].join('\n')

    const json = await (await POST(makeUpload(csv))).json()

    expect(json.total).toBe(1)
    expect(created('business-costs')).toEqual(['VERCEL INC SAN FRANCISCO'])
  })

  it('saves credits as bank receipts, not costs', async () => {
    const csv = '03/10/2026,"+5000.00","ACME PLUMBING INV-0042","+6000.00"'

    const json = await (await POST(makeUpload(csv))).json()

    expect(json.total).toBe(0)
    expect(json.receipts).toBe(1)
    expect(created('business-costs')).toEqual([])
    expect(mockPayload.create).toHaveBeenCalledWith(expect.objectContaining({
      collection: 'bank-receipts',
      data: expect.objectContaining({ amount: 5000, description: 'ACME PLUMBING INV-0042', date: '2026-10-03T00:00:00.000Z' }),
    }))
  })

  it('skips rows already imported when an overlapping statement is uploaded', async () => {
    storedRows([
      { collection: 'business-costs', date: '2026-10-01T00:00:00.000Z', amount: 31, description: 'VERCEL' },
      { collection: 'bank-receipts', date: '2026-10-03T00:00:00.000Z', amount: 5000, description: 'ACME' },
    ])
    const csv = [
      '01/10/2026,"-31.00","VERCEL","+1000.00"', // already imported
      '03/10/2026,"+5000.00","ACME","+6000.00"', // already imported
      '05/10/2026,"-20.00","OPENAI","+5980.00"', // new
    ].join('\n')

    const json = await (await POST(makeUpload(csv))).json()

    expect(json.duplicatesSkipped).toBe(2)
    expect(json.total).toBe(1)
    expect(json.receipts).toBe(0)
    expect(created('business-costs')).toEqual(['OPENAI'])
    expect(created('bank-receipts')).toEqual([])
  })

  it('keeps two genuine identical charges on the same day, and skips both on re-import', async () => {
    const csv = [
      '06/10/2026,"-4.50","CAFE","+900.00"',
      '06/10/2026,"-4.50","CAFE","+895.50"',
    ].join('\n')

    const first = await (await POST(makeUpload(csv))).json()
    expect(first.total).toBe(2)

    vi.clearAllMocks()
    mockPayload.auth.mockResolvedValue({ user: { id: 1, featureAccess: ['business-costs'] } })
    mockPayload.find.mockResolvedValue({ totalDocs: 0, docs: [] })
    storedRows([
      { collection: 'business-costs', date: '2026-10-06T00:00:00.000Z', amount: 4.5, description: 'CAFE' },
      { collection: 'business-costs', date: '2026-10-06T00:00:00.000Z', amount: 4.5, description: 'CAFE' },
    ])

    const again = await (await POST(makeUpload(csv))).json()
    expect(again.total).toBe(0)
    expect(again.duplicatesSkipped).toBe(2)
    expect(mockPayload.create).not.toHaveBeenCalled()
  })

  it('rejects an empty file', async () => {
    const res = await POST(makeUpload('\n\n'))
    const json = await res.json()

    expect(res.status).toBe(400)
    expect(json.error).toBe('CSV file is empty')
  })
})
