import { describe, expect, it } from 'vitest'
import {
  calculateCardSurcharge,
  createHostingQuote,
  getStripeInvoiceReferences,
  shouldApplyHostingPriceChange,
  validateSurchargeConfig,
} from '@/lib/hosting-billing'

describe('hosting billing quotes', () => {
  it('grosses up and rounds to cents', () =>
    expect(calculateCardSurcharge(10_000, { percentage: 2.9, fixedCents: 30 })).toBe(
      Math.ceil(10_030 / 0.971) - 10_000,
    ))

  it('rejects unsafe rates', () => {
    expect(() => validateSurchargeConfig({ percentage: 100, fixedCents: 0 })).toThrow()
    expect(() => calculateCardSurcharge(-1, { percentage: 0, fixedCents: 0 })).toThrow()
  })

  it('finds client and subscription references on recurring invoice events', () => {
    expect(
      getStripeInvoiceReferences({
        customer: 'cus_123',
        parent: {
          subscription_details: {
            metadata: { cmsClientId: '42' },
            subscription: 'sub_123',
          },
        },
      }),
    ).toEqual({
      clientId: '42',
      customerId: 'cus_123',
      subscriptionId: 'sub_123',
    })
  })

  it('selects pending changes shortly before renewal without using currentPeriodEnd', () => {
    expect(
      shouldApplyHostingPriceChange(
        { status: 'pending', effectiveAt: '2026-08-01T12:00:00.000Z' },
        new Date('2026-08-01T10:30:00.000Z'),
      ),
    ).toBe(true)
    expect(
      shouldApplyHostingPriceChange(
        { status: 'pending', effectiveAt: '2026-08-01T12:00:00.000Z' },
        new Date('2026-08-01T09:00:00.000Z'),
      ),
    ).toBe(false)
  })

  it('persists the quoted surcharge separately', () => {
    const quote = createHostingQuote({
      currency: 'aud',
      baseCents: 12000,
      interval: 'year',
      allowance: '1 GB',
      clause: 'Notice applies',
      planName: 'Standard',
      surcharge: { percentage: 0, fixedCents: 30 },
    })
    expect(quote).toMatchObject({
      baseCents: 12000,
      surchargeCents: 30,
      totalCents: 12030,
      interval: 'year',
    })
  })
})
