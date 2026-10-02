import { describe, expect, it } from 'vitest'
import { Clients } from '@/collections/Clients'
import { HostingPaymentOffers } from '@/collections/HostingPaymentOffers'

/**
 * Staff with the `clients` permission must not be able to push prices or
 * subscription changes to Stripe by editing records directly: price changes
 * must go through the notice process, and offers must come from the server.
 * These read the real collection configs.
 */

type AnyField = Record<string, any>

function findField(fields: AnyField[], name: string): AnyField | undefined {
  for (const field of fields) {
    if (field.name === name) return field
    const nested = [...(field.fields ?? []), ...(field.tabs ?? [])]
    const found = nested.length ? findField(nested, name) : undefined
    if (found) return found
  }
  return undefined
}

const hostingGroup = findField(Clients.fields as AnyField[], 'hostingSubscription')
const subField = (name: string) => (hostingGroup?.fields as AnyField[]).find((f) => f.name === name)
// An admin holds every feature, so a `false` here proves the lock is absolute.
const staff = { req: { user: { id: 2, role: 'admin' } } }

describe('hosting billing access', () => {
  it.each([
    'priceChanges',
    'stripeCustomerId',
    'stripeSubscriptionId',
    'stripeHostingItemId',
    'stripeSurchargeItemId',
    'subscriptionStatus',
    'cancelAtPeriodEnd',
    'currentPeriodEnd',
    'providerEventId',
    'providerEventCreatedAt',
    'activeOffer',
    'offerCompletedAt',
  ])('only server code can write %s', (name) => {
    const access = subField(name)?.access
    expect(access?.update?.(staff)).toBe(false)
    expect(access?.create?.(staff)).toBe(false)
  })

  it.each(['planName', 'monthlyBaseCents', 'annualBaseCents', 'recipientEmail', 'billingInterval'])(
    'staff can still set up %s',
    (name) => {
      expect(subField(name)).toBeDefined()
      expect(subField(name)?.access).toBeUndefined()
    },
  )

  it('payment offers cannot be created or edited through the admin or API', () => {
    const access = HostingPaymentOffers.access as Record<string, (args: unknown) => unknown>
    expect(access.read?.(staff)).toBe(true)
    expect(access.create?.(staff)).toBe(false)
    expect(access.update?.(staff)).toBe(false)
  })
})
