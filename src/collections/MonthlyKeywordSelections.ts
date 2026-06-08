import type { CollectionConfig } from 'payload'
import { adminOnlyDelete, canAccess } from '../lib/access'

export const MonthlyKeywordSelections: CollectionConfig = {
  slug: 'monthly-keyword-selections',
  labels: {
    singular: 'Monthly negative KWs',
    plural: 'Monthly negative KWs',
  },
  admin: {
    hidden: true,
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
          name: 'rowIndex',
          type: 'number',
          required: true,
          defaultValue: 0,
          admin: { description: 'Sub-row index for this search term. 0 is the primary negative; >0 are additional negatives sharing the same target NKL.' },
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
            { label: 'Watch', value: 'watch' },
            { label: 'Needs review', value: 'needs_review' },
          ],
        },
        {
          name: 'watchHorizonMonths',
          type: 'number',
          admin: {
            description: 'For watched terms: months until the performance re-check is due (1, 2, 3 or 6). Defaults to 3.',
          },
        },
        {
          name: 'watchUntil',
          type: 'date',
          admin: {
            description: 'For watched terms: computed date when this term is due for a conversion-performance re-check.',
          },
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
        {
          name: 'appliedBy',
          type: 'text',
          admin: { description: 'Display name of the user who first applied this negative to an NKL.' },
        },
        {
          name: 'appliedByUserId',
          type: 'text',
          admin: { description: 'User id of the user who first applied this negative to an NKL (for notifications later).' },
        },
        {
          name: 'removedComment',
          type: 'textarea',
          admin: { description: 'Explanation a teammate gave when removing this already-applied negative from its NKL.' },
        },
        {
          name: 'removedBy',
          type: 'text',
          admin: { description: 'Display name of the user who removed this already-applied negative.' },
        },
        {
          name: 'removedByUserId',
          type: 'text',
          admin: { description: 'User id of the user who removed this already-applied negative.' },
        },
        {
          name: 'removedAt',
          type: 'text',
          admin: { description: 'ISO timestamp when this already-applied negative was removed with an explanation.' },
        },
        {
          name: 'decidedBy',
          type: 'text',
          admin: { description: 'Display name of whoever last set this row to a non-pending decision (auto-tracked on save).' },
        },
        {
          name: 'decidedByUserId',
          type: 'text',
          admin: { description: 'User id of whoever last set this row to a non-pending decision (used to notify the original handler).' },
        },
        {
          name: 'reviewDismissedAt',
          type: 'text',
          admin: { description: 'ISO timestamp when this needs-review term was dismissed as feedback.' },
        },
        {
          name: 'reviewDismissedBy',
          type: 'text',
          admin: { description: 'Display name of the reviewer who dismissed this needs-review term as feedback.' },
        },
        {
          name: 'reviewComment',
          type: 'textarea',
          admin: { description: 'Reviewer note for a "needs review" term. Visible to anyone with tool access.' },
        },
        {
          name: 'reviewCommentBy',
          type: 'text',
          admin: { description: 'Display name of the person who last saved the comment.' },
        },
        {
          name: 'reviewCommentAt',
          type: 'text',
          admin: { description: 'ISO timestamp of the last comment save.' },
        },
        {
          name: 'reviewCommentTaggedUserIds',
          type: 'text',
          admin: { description: 'Comma-separated user IDs tagged in the comment (for notifications).' },
        },
        {
          name: 'outcomeType',
          type: 'text',
          admin: { description: "Latest review-outcome type for this term: 'added' | 'updated' | 'moved'. Server-managed." },
        },
        {
          name: 'outcomeDetail',
          type: 'text',
          admin: { description: 'Human before→after summary of the latest outcome, e.g. "exact → phrase" or "added to List A".' },
        },
        {
          name: 'outcomeComment',
          type: 'textarea',
          admin: { description: 'Optional teaching note left by the actor when they added/updated/moved this term.' },
        },
        {
          name: 'outcomeBy',
          type: 'text',
          admin: { description: 'Display name of the user who performed the latest outcome.' },
        },
        {
          name: 'outcomeByUserId',
          type: 'text',
          admin: { description: 'User id of the user who performed the latest outcome.' },
        },
        {
          name: 'outcomeAt',
          type: 'text',
          admin: { description: 'ISO timestamp of the latest added/updated/moved outcome.' },
        },
      ],
    },
  ],
  timestamps: true,
}
