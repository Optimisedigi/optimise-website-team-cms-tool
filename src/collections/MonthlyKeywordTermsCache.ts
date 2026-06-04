import type { CollectionConfig } from 'payload'
import { adminOnlyDelete, canAccess, hideUnlessFeature } from '../lib/access'

export const MonthlyKeywordTermsCache: CollectionConfig = {
  slug: 'monthly-keyword-terms-cache',
  labels: {
    singular: 'Monthly Keyword Terms Cache',
    plural: 'Monthly Keyword Terms Cache',
  },
  admin: {
    hidden: hideUnlessFeature('negative-keyword-lists'),
    group: 'Growth Tools',
    useAsTitle: 'yearMonth',
    defaultColumns: ['client', 'yearMonth', 'reviewComplete', 'fetchedAt'],
  },
  access: {
    read: canAccess('negative-keyword-lists'),
    create: canAccess('negative-keyword-lists'),
    update: canAccess('negative-keyword-lists'),
    delete: adminOnlyDelete,
  },
  fields: [
    {
      name: 'client',
      type: 'relationship',
      relationTo: 'clients',
      required: true,
      index: true,
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'yearMonth',
      type: 'text',
      required: true,
      index: true,
      admin: {
        position: 'sidebar',
        description: 'Complete calendar month in YYYY-MM format.',
      },
    },
    {
      name: 'terms',
      type: 'json',
      required: true,
      admin: {
        description: 'Qualifying search terms for this complete month.',
      },
    },
    {
      name: 'reviewComplete',
      type: 'checkbox',
      defaultValue: false,
      admin: {
        position: 'sidebar',
        description: 'Workflow marker: the team has finished reviewing this month.',
      },
    },
    {
      name: 'reviewCompletedAt',
      type: 'text',
      admin: {
        position: 'sidebar',
        description: 'ISO timestamp for when reviewComplete was last enabled.',
      },
    },
    {
      name: 'reviewCompletedBy',
      type: 'relationship',
      relationTo: 'users',
      admin: {
        position: 'sidebar',
        description: 'User who marked this month complete.',
      },
    },
    {
      name: 'fetchedAt',
      type: 'text',
      required: true,
      admin: {
        position: 'sidebar',
        description: 'ISO timestamp when this complete month was fetched from Growth Tools.',
      },
    },
  ],
  timestamps: true,
}
