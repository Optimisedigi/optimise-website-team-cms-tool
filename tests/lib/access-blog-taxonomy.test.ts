import { describe, expect, it } from 'vitest'
import {
  canUpdateClientBlogTaxonomy,
  clientBlogTaxonomyAccess,
  getEffectiveFeatures,
  isClientBlogTaxonomyUpdate,
} from '@/lib/access'

const blogUser = {
  id: 7,
  role: 'specialist',
  featureAccess: ['blog-posts'],
}

function accessArgs(user: unknown) {
  return { req: { user } } as any
}

describe('client blog taxonomy RBAC', () => {
  it('allows a non-manager blog user to update the client record for a taxonomy-only edit', () => {
    expect(canUpdateClientBlogTaxonomy(accessArgs(blogUser))).toBe(true)
    expect(clientBlogTaxonomyAccess(accessArgs(blogUser))).toBe(true)
    expect(
      isClientBlogTaxonomyUpdate({
        blogCategories: 'Guides\nNews',
        blogTags: 'SEO\nContent',
      }),
    ).toBe(true)
  })

  it('identifies non-taxonomy client updates so the beforeChange guard can reject them', () => {
    expect(
      isClientBlogTaxonomyUpdate({
        blogCategories: 'Guides',
        monthlyRetainer: 5000,
      }),
    ).toBe(false)
  })

  it('auto-grants client read access to blog-settings users', () => {
    const features = getEffectiveFeatures({
      id: 9,
      role: 'specialist',
      featureAccess: ['blog-settings'],
    })
    expect(features).toContain('blog-settings')
    expect(features).toContain('clients-basic')
  })

  it('keeps full client editors able to update the full client record', () => {
    const clientEditor = {
      id: 8,
      role: 'specialist',
      featureAccess: ['clients'],
    }

    expect(canUpdateClientBlogTaxonomy(accessArgs(clientEditor))).toBe(true)
  })
})
