import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock next/headers before importing the route
vi.mock('next/headers', () => ({
  headers: vi.fn(() => Promise.resolve(new Headers())),
}))

const mockPayload = {
  auth: vi.fn(),
  find: vi.fn(),
  count: vi.fn(),
  findGlobal: vi.fn(),
}

vi.mock('payload', () => ({
  getPayload: vi.fn(() => Promise.resolve(mockPayload)),
}))

vi.mock('@/payload.config', () => ({
  default: Promise.resolve({}),
}))

// `userHasFeature` is dynamically imported by the route — mock the module.
vi.mock('@/lib/access', () => ({
  userHasFeature: vi.fn(() => true),
}))

import { GET } from '@/app/(frontend)/api/dashboard/route'

describe('GET /api/dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPayload.auth.mockResolvedValue({ user: { id: 1, role: 'admin', name: 'Test', email: 't@x' } })
    mockPayload.findGlobal.mockResolvedValue(null)
    mockPayload.count.mockResolvedValue({ totalDocs: 0 })

    // Default: every find call returns an empty collection.
    // Individual tests override `clientsForRetainer` by detecting the
    // `select.monthlyRetainer` shape.
    mockPayload.find.mockImplementation((args: any) => {
      // GSC client lookup
      if (args?.collection === 'clients' && args?.where?.slug?.equals === 'optimise-digital') {
        return Promise.resolve({ docs: [] })
      }
      // Agency lookup
      if (args?.collection === 'clients' && args?.where?.isAgency?.equals === true) {
        return Promise.resolve({ docs: [] })
      }
      // The clientsForRetainer call has select.monthlyRetainer
      if (args?.collection === 'clients' && args?.select?.monthlyRetainer) {
        return Promise.resolve({ docs: [] })
      }
      return Promise.resolve({ docs: [] })
    })
  })

  it('returns 401 when user is not authenticated', async () => {
    mockPayload.auth.mockResolvedValue({ user: null })
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('exposes monthlyRetainerNet, AAR, oneOffYTD, retainerYTD in the response', async () => {
    const res = await GET()
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toHaveProperty('monthlyRetainerNet')
    expect(json).toHaveProperty('annualisedAgencyRevenue')
    expect(json).toHaveProperty('oneOffYTD')
    expect(json).toHaveProperty('retainerYTD')
    expect(json.monthlyRetainerNet).toBe(0)
    expect(json.annualisedAgencyRevenue).toBe(0)
    expect(json.oneOffYTD).toBe(0)
    expect(json.retainerYTD).toBe(0)
  })

  it('returns breakdowns object with monthlyRetainer / oneOffYTD / retainerYTD arrays', async () => {
    const res = await GET()
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toHaveProperty('breakdowns')
    expect(Array.isArray(json.breakdowns.monthlyRetainer)).toBe(true)
    expect(Array.isArray(json.breakdowns.oneOffYTD)).toBe(true)
    expect(Array.isArray(json.breakdowns.retainerYTD)).toBe(true)
  })

  it('sorts breakdown entries by amount descending', async () => {
    mockPayload.find.mockImplementation((args: any) => {
      if (args?.collection === 'clients' && args?.select?.monthlyRetainer) {
        return Promise.resolve({
          docs: [
            {
              id: 1,
              name: 'Small Co',
              monthlyRetainer: 500,
              clientStartDate: '2020-01-01',
              oneOffProjects: [],
              retainerHistory: [],
              historicalRevenue: 0,
              referralCommissions: [],
            },
            {
              id: 2,
              name: 'Big Co',
              monthlyRetainer: 2000,
              clientStartDate: '2020-01-01',
              oneOffProjects: [],
              retainerHistory: [],
              historicalRevenue: 0,
              referralCommissions: [],
            },
            {
              id: 3,
              name: 'Mid Co',
              monthlyRetainer: 1000,
              clientStartDate: '2020-01-01',
              oneOffProjects: [],
              retainerHistory: [],
              historicalRevenue: 0,
              referralCommissions: [],
            },
          ],
        })
      }
      return Promise.resolve({ docs: [] })
    })

    const res = await GET()
    const json = await res.json()
    const names = json.breakdowns.monthlyRetainer.map((r: any) => r.clientName)
    expect(names).toEqual(['Big Co', 'Mid Co', 'Small Co'])
  })

  it('deducts an 8% monthly commission from a $1350 retainer in monthlyRetainerNet', async () => {
    // Override the clientsForRetainer call to return one fixture client.
    mockPayload.find.mockImplementation((args: any) => {
      if (args?.collection === 'clients' && args?.select?.monthlyRetainer) {
        return Promise.resolve({
          docs: [
            {
              id: 1,
              monthlyRetainer: 1350,
              clientStartDate: null,
              oneOffProjects: [],
              retainerHistory: [],
              historicalRevenue: 0,
              referralCommissions: [
                {
                  frequency: 'monthly',
                  commissionType: 'percentage',
                  percentage: 8,
                  startDate: '2020-01-01',
                },
              ],
            },
          ],
        })
      }
      return Promise.resolve({ docs: [] })
    })

    const res = await GET()
    expect(res.status).toBe(200)
    const json = await res.json()
    // 1350 * 0.92 = 1242 (not 1350)
    expect(json.monthlyRetainerNet).toBe(1242)
  })

  it('applies revenueSharePercent to monthlyRetainerNet (50% partner split)', async () => {
    mockPayload.find.mockImplementation((args: any) => {
      if (args?.collection === 'clients' && args?.select?.monthlyRetainer) {
        return Promise.resolve({
          docs: [
            {
              id: 1,
              name: 'Partner Co',
              monthlyRetainer: 2000,
              revenueSharePercent: 50,
              clientStartDate: null,
              oneOffProjects: [],
              retainerHistory: [],
              referralCommissions: [],
            },
          ],
        })
      }
      return Promise.resolve({ docs: [] })
    })

    const res = await GET()
    const json = await res.json()
    // $2,000 × 50% share = $1,000
    expect(json.monthlyRetainerNet).toBe(1000)
    expect(json.annualisedAgencyRevenue).toBe(12000)
    // Breakdown row reflects the post-share net + carries the share %
    expect(json.breakdowns.monthlyRetainer[0]).toMatchObject({
      clientName: 'Partner Co',
      gross: 1000,
      net: 1000,
      revenueSharePercent: 50,
    })
  })

  it('counts active total leads by excluding lost and client stages', async () => {
    const res = await GET()
    expect(res.status).toBe(200)
    await res.json()

    expect(mockPayload.count).toHaveBeenCalledWith({
      collection: 'sales-leads',
      where: {
        and: [
          { stage: { not_equals: 'lost' } },
          { stage: { not_equals: 'client' } },
        ],
      },
    })
  })

  it('calculates lead conversion from converted leads over total leads received', async () => {
    mockPayload.count.mockImplementation((args: any) => {
      if (args?.collection === 'sales-leads' && args?.where?.stage?.equals === 'client') {
        return Promise.resolve({ totalDocs: 3 })
      }
      if (args?.collection === 'sales-leads' && !args?.where) {
        return Promise.resolve({ totalDocs: 12 })
      }
      if (args?.collection === 'sales-leads') {
        return Promise.resolve({ totalDocs: 4 })
      }
      return Promise.resolve({ totalDocs: 0 })
    })

    const res = await GET()
    const json = await res.json()

    expect(json.proposals.conversionRate).toBe(25)
    expect(json.totalLeads).toBe(12)
    expect(json.activeLeads).toBe(4)
  })

  it('omits revenueSharePercent badge when share is 100', async () => {
    mockPayload.find.mockImplementation((args: any) => {
      if (args?.collection === 'clients' && args?.select?.monthlyRetainer) {
        return Promise.resolve({
          docs: [
            {
              id: 1,
              name: 'Full Co',
              monthlyRetainer: 1000,
              revenueSharePercent: 100,
              clientStartDate: null,
              oneOffProjects: [],
              retainerHistory: [],
              referralCommissions: [],
            },
          ],
        })
      }
      return Promise.resolve({ docs: [] })
    })

    const res = await GET()
    const json = await res.json()
    expect(json.breakdowns.monthlyRetainer[0].revenueSharePercent).toBeNull()
  })
})
