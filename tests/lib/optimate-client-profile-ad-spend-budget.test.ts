import { describe, expect, it, vi } from 'vitest'
import type { Payload } from 'payload'
import { buildOptimateClientProfile } from '@/lib/optimate-client-profile'

function fakePayload(opts: {
  client: Record<string, unknown>
  audits?: Array<Record<string, unknown>>
  auditError?: boolean
}) {
  const find = vi.fn(async ({ collection }: { collection: string }) => {
    if (collection === 'google-ads-audits') {
      if (opts.auditError) throw new Error('db down')
      return { docs: opts.audits ?? [], totalDocs: (opts.audits ?? []).length }
    }
    return { docs: [], totalDocs: 0 }
  })
  const findByID = vi.fn(async () => opts.client)
  return { payload: { find, findByID } as unknown as Payload, find }
}

describe('buildOptimateClientProfile commercial.monthlyAdSpendBudget', () => {
  it('reads the newest Google Ads audit monthlyBudget (Budget Management) for the commercial group', async () => {
    const { payload, find } = fakePayload({
      client: { id: 42, name: 'Berendsen', monthlyRetainer: 1350 },
      audits: [{ id: 7, monthlyBudget: 4000 }],
    })
    const profile = await buildOptimateClientProfile(payload, { id: 42, fields: ['commercial'] })
    expect(profile?.commercial?.monthlyRetainer).toBe(1350)
    expect(profile?.commercial?.monthlyAdSpendBudget).toBe(4000)
    expect(profile?.commercial?.monthlyAdSpendBudgetSource).toBe('budget_management')
    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'google-ads-audits',
        where: { client: { equals: 42 } },
        sort: '-createdAt',
        limit: 1,
      }),
    )
  })

  it('falls back to the client spend policy target when no audit budget is set', async () => {
    const { payload } = fakePayload({
      client: { id: 42, name: 'EPG', spendPolicy: { monthlyBudgetTarget: 2500 } },
      audits: [{ id: 7, monthlyBudget: null }],
    })
    const profile = await buildOptimateClientProfile(payload, { id: 42, fields: ['commercial'] })
    expect(profile?.commercial?.monthlyAdSpendBudget).toBe(2500)
    expect(profile?.commercial?.monthlyAdSpendBudgetSource).toBe('spend_policy')
  })

  it('returns null without failing when the audit lookup errors and nothing is configured', async () => {
    const { payload } = fakePayload({ client: { id: 42, name: 'MTP' }, auditError: true })
    const profile = await buildOptimateClientProfile(payload, { id: 42, fields: ['commercial'] })
    expect(profile?.commercial?.monthlyAdSpendBudget).toBeNull()
    expect(profile?.commercial?.monthlyAdSpendBudgetSource).toBeNull()
  })

  it('does not query audits when the commercial group is not requested', async () => {
    const { payload, find } = fakePayload({ client: { id: 42, name: 'MTP' }, audits: [{ id: 7, monthlyBudget: 1 }] })
    await buildOptimateClientProfile(payload, { id: 42, fields: ['contact'] })
    expect(find).not.toHaveBeenCalledWith(expect.objectContaining({ collection: 'google-ads-audits' }))
  })
})
