import { beforeEach, describe, expect, it, vi } from 'vitest'

const find = vi.fn()
vi.mock('payload', () => ({ getPayload: vi.fn(async () => ({ find })) }))
vi.mock('@/payload.config', () => ({ default: Promise.resolve({}) }))

import { executeClientBillingTool } from '@/lib/agents/optimate-invoice/client-billing-tools'

describe('InvoiceMate client billing profiles', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    find.mockResolvedValue({
      docs: [{
        id: 42,
        name: 'In the Picture',
        tradingName: null,
        clientType: 'recurring',
        clientStartDate: '2026-09-10T00:00:00.000Z',
        retainerStartDate: '2026-09-10T00:00:00.000Z',
        monthlyRetainer: 3000,
        setupFee: 500,
        oneOffProjects: [{ projectName: 'Website build', amount: 8000, date: '2026-08-01', countTowardsRetainer: false }],
      }],
    })
  })

  it('returns invoice-ready billing facts and calculated first-month proration', async () => {
    const result = await executeClientBillingTool(
      'getClientBillingProfile',
      { clientName: 'In the Picture' },
      { role: 'admin' },
    )

    expect(result).toEqual({ profiles: [{
      clientId: 42,
      name: 'In the Picture',
      tradingName: null,
      clientType: 'recurring',
      clientStartDate: '2026-09-10T00:00:00.000Z',
      retainerStartDate: '2026-09-10T00:00:00.000Z',
      monthlyRetainer: 3000,
      firstMonthProratedAmount: 2100,
      setupFee: 500,
      oneOffProjects: [{ projectName: 'Website build', amount: 8000, date: '2026-08-01', countTowardsRetainer: false }],
    }] })
    expect(find).toHaveBeenCalledWith(expect.objectContaining({
      collection: 'clients',
      overrideAccess: false,
      where: {
        or: [
          { name: { contains: 'In the Picture' } },
          { tradingName: { contains: 'In the Picture' } },
        ],
      },
    }))
  })

  it('searches both the legal client name and trading name', async () => {
    find.mockResolvedValue({
      docs: [{
        id: 43,
        name: 'Example Holdings Pty Ltd',
        tradingName: 'In the Picture',
        clientType: 'recurring',
        clientStartDate: '2026-09-10T00:00:00.000Z',
        retainerStartDate: null,
        monthlyRetainer: 3000,
        setupFee: 0,
        oneOffProjects: [],
      }],
    })

    const result = await executeClientBillingTool(
      'getClientBillingProfile',
      { clientName: 'In the Picture' },
      { role: 'admin' },
    )

    expect(find).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        or: [
          { name: { contains: 'In the Picture' } },
          { tradingName: { contains: 'In the Picture' } },
        ],
      },
    }))
    expect(result).toMatchObject({ profiles: [{
      name: 'Example Holdings Pty Ltd',
      tradingName: 'In the Picture',
    }] })
  })

  it('refuses users without both invoice and client access', async () => {
    const result = await executeClientBillingTool(
      'getClientBillingProfile',
      { clientName: 'In the Picture' },
      { role: 'specialist', featureAccess: ['nav:invoices'] },
    )

    expect(result).toEqual({ error: 'You do not have access to client billing profiles.' })
    expect(find).not.toHaveBeenCalled()
  })
})
