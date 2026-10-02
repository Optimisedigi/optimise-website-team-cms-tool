import type { CollectionConfig } from 'payload'
import { canAccess, adminOnlyDelete, hideUnlessAnyFeature } from '../lib/access'

/**
 * One-off hosting payment links (for example, backdated hosting). Issued,
 * paid and revoked only by server routes (overrideAccess); staff can view
 * them, but a hand-made or edited record could carry any amount.
 */
export const HostingOneOffPayments: CollectionConfig = {
  slug: 'hosting-one-off-payments',
  labels: { singular: 'Hosting one-off payment', plural: 'Hosting one-off payments' },
  admin: {
    group: 'Finance',
    hidden: hideUnlessAnyFeature('hosting-billing-settings'),
    useAsTitle: 'id',
    defaultColumns: ['id', 'client', 'status', 'expiresAt', 'paidAt'],
  },
  access: {
    read: canAccess('hosting-billing-settings'),
    create: () => false,
    update: () => false,
    delete: adminOnlyDelete,
  },
  fields: [
    { name: 'client', type: 'relationship', relationTo: 'clients', required: true, index: true },
    {
      name: 'tokenHash',
      type: 'text',
      required: true,
      unique: true,
      access: { read: () => false },
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'active',
      options: ['active', 'checkout_pending', 'paid', 'revoked'],
    },
    { name: 'expiresAt', type: 'date', required: true },
    { name: 'stripeCheckoutSessionId', type: 'text' },
    { name: 'paidAt', type: 'date' },
    {
      name: 'snapshot',
      type: 'json',
      required: true,
      admin: { description: 'Immutable description, amount, surcharge and recipient.' },
    },
  ],
}
