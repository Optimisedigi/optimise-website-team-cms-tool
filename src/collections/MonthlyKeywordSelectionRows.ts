import type { CollectionConfig } from 'payload'
import { adminOnlyDelete, canAccess } from '../lib/access'

const matchTypeOptions = [
  { label: 'Broad', value: 'broad' },
  { label: 'Phrase', value: 'phrase' },
  { label: 'Exact', value: 'exact' },
]

const decisionOptions = [
  { label: 'Pending', value: 'pending' },
  { label: 'Approved', value: 'approved' },
  { label: 'Skipped', value: 'skipped' },
  { label: 'Watch', value: 'watch' },
  { label: 'Needs review', value: 'needs_review' },
]

export const MonthlyKeywordSelectionRows: CollectionConfig = {
  slug: 'monthly-keyword-selection-rows',
  labels: {
    singular: 'Monthly negative KW decision row',
    plural: 'Monthly negative KW decision rows',
  },
  admin: {
    hidden: true,
    group: 'Growth Tools',
    useAsTitle: 'searchTerm',
    defaultColumns: ['client', 'yearMonth', 'searchTerm', 'decision', 'updatedAt'],
  },
  access: {
    read: canAccess('negative-keyword-lists'),
    create: canAccess('negative-keyword-lists'),
    update: canAccess('negative-keyword-lists'),
    delete: adminOnlyDelete,
  },
  fields: [
    { name: 'client', type: 'relationship', relationTo: 'clients', required: true, index: true, admin: { position: 'sidebar' } },
    { name: 'yearMonth', type: 'text', required: true, index: true, admin: { position: 'sidebar', description: 'Month in YYYY-MM format.' } },
    { name: 'searchTerm', type: 'text', required: true },
    { name: 'searchTermKey', type: 'text', required: true, index: true, admin: { description: 'Lowercase/trimmed search term for indexed lookup.' } },
    { name: 'rowIndex', type: 'number', required: true, defaultValue: 0, admin: { description: 'Sub-row index for this search term. 0 is the primary negative.' } },
    { name: 'rowKey', type: 'text', required: true, unique: true, index: true, admin: { description: 'Durable unique key: client|yearMonth|searchTermKey|rowIndex.' } },
    { name: 'keywordKey', type: 'text', index: true, admin: { description: 'Lowercase negative keyword + match type for indexed fallback matching.' } },
    { name: 'negativeKeyword', type: 'text', required: true },
    { name: 'matchType', type: 'select', required: true, defaultValue: 'exact', options: matchTypeOptions },
    { name: 'decision', type: 'select', required: true, defaultValue: 'pending', options: decisionOptions },
    { name: 'appliedToNKL', type: 'relationship', relationTo: 'negative-keyword-lists' },
    { name: 'appliedAt', type: 'date' },
    { name: 'watchHorizonMonths', type: 'number' },
    { name: 'watchUntil', type: 'date' },
    { name: 'appliedBy', type: 'text' },
    { name: 'appliedByUserId', type: 'text' },
    { name: 'removedComment', type: 'textarea' },
    { name: 'removedBy', type: 'text' },
    { name: 'removedByUserId', type: 'text' },
    { name: 'removedAt', type: 'text' },
    { name: 'decidedBy', type: 'text' },
    { name: 'decidedByUserId', type: 'text' },
    { name: 'reviewDismissedAt', type: 'text' },
    { name: 'reviewDismissedBy', type: 'text' },
    { name: 'reviewComment', type: 'textarea' },
    { name: 'reviewCommentBy', type: 'text' },
    { name: 'reviewCommentAt', type: 'text' },
    { name: 'reviewCommentTaggedUserIds', type: 'text' },
    { name: 'outcomeType', type: 'text' },
    { name: 'outcomeDetail', type: 'text' },
    { name: 'outcomeComment', type: 'textarea' },
    { name: 'outcomeBy', type: 'text' },
    { name: 'outcomeByUserId', type: 'text' },
    { name: 'outcomeAt', type: 'text' },
    {
      name: 'outcomeFollowUpComments',
      dbName: 'selection_row_outcome_followups',
      type: 'array',
      fields: [
        { name: 'comment', type: 'textarea', required: true },
        { name: 'by', type: 'text' },
        { name: 'byUserId', type: 'text' },
        { name: 'at', type: 'text' },
        { name: 'taggedUserIds', type: 'text' },
      ],
    },
  ],
  timestamps: true,
}
