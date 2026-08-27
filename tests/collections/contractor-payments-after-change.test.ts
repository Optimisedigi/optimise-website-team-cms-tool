import { describe, expect, it } from 'vitest'
import { ContractorPayments } from '@/collections/ContractorPayments'

describe('ContractorPayments afterChange', () => {
  it('defers time-entry linking until after the payment save commits', () => {
    const hook = ContractorPayments.hooks?.afterChange?.[0]
    expect(typeof hook).toBe('function')
    const source = String(hook)
    expect(source).toMatch(/deferPostCommit/)
    const deferralAt = source.search(/deferPostCommit\)?\(/)
    const insideSave = deferralAt === -1 ? source : source.slice(0, deferralAt)
    expect(insideSave).not.toMatch(/await\s+(?:req\.)?payload\.(?:delete|create|update)\)?\(/)
  })
})
