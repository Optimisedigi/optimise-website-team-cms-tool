import type { CollectionConfig } from 'payload'
import { adminOnlyDelete, canAccess, hideUnlessFeature } from '../lib/access'

export const MonthlyKeywordSelections: CollectionConfig = {
  slug: 'monthly-keyword-selections',
  labels: {
    singular: 'Monthly Keyword Selection',
    plural: 'Monthly Keyword Selections',
  },
  admin: {
    hidden: hideUnlessFeature('negative-keyword-lists'),
    group: 'Growth Tools',
    useAsTitle: 'client',
    defaultColumns: ['client', 'status', 'updatedAt'],
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
      unique: true,
      admin: {
        position: 'sidebar',
        description: 'The client this month-on-month review belongs to.',
      },
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'active',
      options: [
        { label: 'Active', value: 'active' },
        { label: 'Archived', value: 'archived' },
      ],
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'selections',
      type: 'array',
      admin: {
        description: 'Human decisions for raw monthly search terms.',
        initCollapsed: true,
      },
      fields: [
        {
          name: 'yearMonth',
          type: 'text',
          required: true,
          admin: { description: 'Month in YYYY-MM format.' },
        },
        {
          name: 'searchTerm',
          type: 'text',
          required: true,
          admin: { description: 'The raw Google Ads search term.' },
        },
        {
          name: 'negativeKeyword',
          type: 'text',
          required: true,
          admin: { description: 'The negative keyword the reviewer wants to add.' },
        },
        {
          name: 'matchType',
          type: 'select',
          required: true,
          defaultValue: 'exact',
          options: [
            { label: 'Broad', value: 'broad' },
            { label: 'Phrase', value: 'phrase' },
            { label: 'Exact', value: 'exact' },
          ],
        },
        {
          name: 'decision',
          type: 'select',
          required: true,
          defaultValue: 'pending',
          options: [
            { label: 'Pending', value: 'pending' },
            { label: 'Approved', value: 'approved' },
            { label: 'Skipped', value: 'skipped' },
          ],
        },
        {
          name: 'appliedToNKL',
          type: 'relationship',
          relationTo: 'negative-keyword-lists',
        },
        {
          name: 'appliedAt',
          type: 'date',
        },
      ],
    },
  ],
  timestamps: true,
}
