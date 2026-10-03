import { describe, expect, it } from 'vitest'
import {
  isHostingSubscriptionInvoice,
  summariseHostingPayments,
  type InvoiceLike,
} from '@/lib/hosting-payments'

const base = (over: Partial<InvoiceLike> = {}): InvoiceLike => ({
  id: 'in_1',
  status: 'paid',
  amount_paid: 1000,
  currency: 'AUD',
  period_start: 100,
  period_end: 100,
  metadata: {},
  parent: { subscription_details: { subscription: 'sub_1' } },
  status_transitions: { paid_at: 100 },
  ...over,
})

describe('hosting payments helpers', () => {
  it('accepts paid subscription invoices only', () => {
    expect(isHostingSubscriptionInvoice(base())).toBe(true)
    expect(isHostingSubscriptionInvoice(base({ status: 'open' }))).toBe(false)
    expect(isHostingSubscriptionInvoice(base({ parent: null }))).toBe(false)
    expect(
      isHostingSubscriptionInvoice(base({ metadata: { hostingOneOffPaymentId: '3' } })),
    ).toBe(false)
    expect(isHostingSubscriptionInvoice(base(), 'sub_2')).toBe(false)
  })

  it('uses line periods, de-duplicates and lowercases currency', () => {
    const invoice = base({ lines: { data: [{ period: { start: 200, end: 300 } }] } })
    const summary = summariseHostingPayments([invoice, invoice])
    expect(summary.count).toBe(1)
    expect(summary.payments[0]).toMatchObject({
      periodStart: new Date(200_000).toISOString(),
      periodEnd: new Date(300_000).toISOString(),
      currency: 'aud',
    })
  })
})
