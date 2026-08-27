import { beforeEach, describe, expect, it, vi } from 'vitest'

const find = vi.fn()
const findByID = vi.fn()
vi.mock('payload', () => ({ getPayload: vi.fn(async () => ({ find, findByID })) }))
vi.mock('@/payload.config', () => ({ default: Promise.resolve({}) }))

import { parseContractorCostPayments } from '@/lib/agents/optimate-invoice/contractor-cost-parse'
import { executeContractorCostTool } from '@/lib/agents/optimate-invoice/contractor-cost-tools'
import { filterContractorPayments } from '@/lib/contractor-overview'

const contractor = {
  id: 1,
  name: 'Ada Lovelace',
  currency: 'AUD',
  hourlyRate: 20,
  chatGptReimbursementPerFortnight: 30,
  transferFeeDefault: 4,
  transferReferenceTemplate: '{startShort}-{endShort} Optimise',
}

describe('InvoiceMate contractor costs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    find.mockImplementation(({ collection }: { collection: string }) => {
      if (collection === 'contractors') return { docs: [contractor] }
      if (collection === 'users') return { docs: [] }
      if (collection === 'contractor-payments') return { docs: [] }
      return {
        docs: [
          { id: 9, contractor: { id: 1 }, weekCommencing: '2026-07-06', hours: 8, totalFee: 160, status: 'approved' },
          { id: 8, contractor: { id: 1 }, weekCommencing: '2026-06-29', hours: 8, totalFee: 160, status: 'approved' },
        ],
      }
    })
    findByID.mockResolvedValue({ id: 9, contractor: { id: 1 }, weekCommencing: '2026-07-06', hours: 8, clientAllocations: [] })
  })

  it('returns unpaid fortnights for a named contractor from CMS data', async () => {
    const result = await executeContractorCostTool(
      'listContractorCosts',
      { contractorName: 'Ada' },
      { role: 'admin' },
    )

    expect(result).toMatchObject({
      totalOwed: 354,
      payments: [
        {
          contractorId: 1,
          contractorName: 'Ada Lovelace',
          fortnightStartDate: '2026-06-29',
          fortnightEndDate: '2026-07-12',
          amount: 354,
          transferReference: '2906-1207 Optimise',
          status: 'unpaid',
        },
      ],
    })
  })

  it('refuses contractor cost data without contractor-costs access', async () => {
    const result = await executeContractorCostTool(
      'listContractorCosts',
      { contractorName: 'Ada' },
      { role: 'specialist', featureAccess: ['nav:invoices'] },
    )
    expect(result).toEqual({ error: 'You do not have access to contractor costs.' })
    expect(find).not.toHaveBeenCalled()
  })

  it('filters by contractor name and unpaid status', () => {
    const payments = filterContractorPayments(
      [
        { id: '1', contractorId: 1, contractorName: 'Ada Lovelace', currency: 'AUD', fortnightStartDate: '2026-06-29', fortnightEndDate: '2026-07-12', totalHours: 16, subtotal: 320, reimbursement: 30, fee: 4, amount: 354, transferReference: 'REF', status: 'unpaid', paidDate: null },
        { id: '2', contractorId: 2, contractorName: 'Lorenzo', currency: 'AUD', fortnightStartDate: '2026-06-29', fortnightEndDate: '2026-07-12', totalHours: 10, subtotal: 200, reimbursement: 0, fee: 0, amount: 200, transferReference: 'REF2', status: 'unpaid', paidDate: null },
      ],
      { contractorName: 'ada', status: 'unpaid' },
    )
    expect(payments).toHaveLength(1)
    expect(payments[0].contractorName).toBe('Ada Lovelace')
  })

  it('parses listContractorCosts actions for in-chat cards', () => {
    const payments = parseContractorCostPayments([
      {
        tool: 'listContractorCosts',
        result: {
          payments: [
            { contractorId: 1, contractorName: 'Ada Lovelace', fortnightStartDate: '2026-06-29', fortnightEndDate: '2026-07-12', amount: 354, currency: 'AUD', transferReference: '2906-1207 Optimise', status: 'unpaid' },
          ],
        },
      },
    ])
    expect(payments).toEqual([
      { contractorId: 1, contractorName: 'Ada Lovelace', fortnightStartDate: '2026-06-29', fortnightEndDate: '2026-07-12', amount: 354, currency: 'AUD', transferReference: '2906-1207 Optimise', status: 'unpaid' },
    ])
  })
})
