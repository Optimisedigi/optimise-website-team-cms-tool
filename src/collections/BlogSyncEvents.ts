import type { CollectionConfig } from 'payload'

/** Private durable delivery queue. Post ID is stored as text to survive deletion. */
export const BlogSyncEvents: CollectionConfig = {
  slug: 'blog-sync-events',
  // Never edited in the admin; see the locked-documents note in payload.config.ts.
  lockDocuments: false,
  admin: { group: 'Content', useAsTitle: 'eventKey', defaultColumns: ['eventKey', 'state', 'attempts', 'lastError', 'updatedAt'] },
  access: {
    read: ({ req }) => req.user?.role === 'admin',
    create: () => false, update: () => false, delete: () => false,
  },
  fields: [
    { name: 'eventKey', type: 'text', required: true, unique: true },
    { name: 'clientId', type: 'number', required: true, index: true },
    { name: 'postId', type: 'text', required: true, index: true },
    { name: 'revision', type: 'text', required: true },
    { name: 'kind', type: 'select', options: ['published', 'unpublished', 'review_requested', 'review_withdrawn'], required: true },
    { name: 'body', type: 'json', required: true },
    { name: 'state', type: 'select', options: ['pending', 'delivered', 'retry', 'review', 'superseded', 'approved', 'changes_requested'], defaultValue: 'pending', required: true },
    { name: 'attempts', type: 'number', defaultValue: 0, required: true },
    { name: 'nextAttempt', type: 'date' },
    { name: 'leaseToken', type: 'text' },
    { name: 'leaseUntil', type: 'date' },
    { name: 'acknowledgedAt', type: 'date' },
    { name: 'lastError', type: 'textarea' },
  ],
}
