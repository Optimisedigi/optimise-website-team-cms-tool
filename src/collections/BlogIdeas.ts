import type { Access, CollectionConfig } from 'payload'
import { canAccess, hideUnlessFeature } from '../lib/access'
import { configuredClientId } from '../lib/in-the-picture/config'

const scopedAccess: Access = ({ req }) => {
  const id = configuredClientId()
  return id && canAccess('blog-ideas')({ req }) ? { client: { equals: id } } : false
}

/** Website-owned brief and ordering; only notes and linkedPost are editable here. */
export const BlogIdeas: CollectionConfig = {
  slug: 'blog-ideas',
  admin: { group: 'Content', useAsTitle: 'blogIdea', defaultColumns: ['priority', 'blogIdea', 'status', 'linkedPost'], hidden: hideUnlessFeature('blog-ideas') },
  access: {
    read: scopedAccess,
    create: () => false,
    update: scopedAccess,
    delete: () => false,
  },
  hooks: {
    beforeChange: [async ({ data, req }) => {
      if (data?.linkedPost) {
        const post = await req.payload.findByID({ collection: 'blog-posts', id: typeof data.linkedPost === 'object' ? data.linkedPost.id : data.linkedPost, depth: 0, overrideAccess: true, req })
        const clientId = typeof post.client === 'object' ? post.client?.id : post.client
        if (clientId !== configuredClientId()) throw new Error('Linked post must belong to this client')
      }
      return data
    }],
  },
  fields: [
    { name: 'client', type: 'relationship', relationTo: 'clients', required: true, index: true, access: { update: () => false }, admin: { readOnly: true } },
    { name: 'blogId', type: 'text', required: true, unique: true, access: { update: () => false }, admin: { readOnly: true } },
    { name: 'priority', type: 'number', required: true, access: { update: () => false }, admin: { readOnly: true, description: '1 is highest priority' } },
    { name: 'blogIdea', type: 'text', required: true, access: { update: () => false }, admin: { readOnly: true } },
    { name: 'suggestedTitle', type: 'text', access: { update: () => false }, admin: { readOnly: true } },
    { name: 'mainPoint', type: 'textarea', access: { update: () => false }, admin: { readOnly: true } },
    { name: 'keyPoints', type: 'textarea', access: { update: () => false }, admin: { readOnly: true } },
    { name: 'pointsToAvoid', type: 'textarea', access: { update: () => false }, admin: { readOnly: true } },
    { name: 'supportingContent', type: 'textarea', access: { update: () => false }, admin: { readOnly: true } },
    { name: 'contributor', type: 'text', access: { update: () => false }, admin: { readOnly: true } },
    { name: 'idealAuthor', type: 'text', access: { update: () => false }, admin: { readOnly: true } },
    { name: 'status', type: 'select', options: ['open', 'published'], required: true, access: { update: () => false }, admin: { readOnly: true } },
    { name: 'publishedSlug', type: 'text', access: { update: () => false }, admin: { readOnly: true } },
    { name: 'sourceUpdatedAt', type: 'text', access: { update: () => false }, admin: { readOnly: true } },
    { name: 'recordRevision', type: 'number', required: true, access: { update: () => false }, admin: { readOnly: true } },
    { name: 'orderRevision', type: 'number', required: true, access: { update: () => false }, admin: { readOnly: true } },
    { name: 'editorNotes', type: 'textarea' },
    { name: 'linkedPost', type: 'relationship', relationTo: 'blog-posts' },
  ],
}
