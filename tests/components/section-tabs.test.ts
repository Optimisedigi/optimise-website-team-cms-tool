import { describe, expect, it, vi } from 'vitest'

vi.mock('@payloadcms/ui', () => ({ useAuth: () => ({ user: null }) }))
vi.mock('next/navigation', () => ({ usePathname: () => '/' }))

import { findSection, SECTIONS } from '@/components/SectionTabs'

describe('SectionTabs.findSection', () => {
  it('maps every combined screen to its section', () => {
    expect(findSection('/admin/collections/process-templates')?.tabs).toBe(SECTIONS.processes)
    expect(findSection('/admin/globals/hosting-billing-settings')?.tabs).toBe(SECTIONS.hosting)
    expect(findSection('/admin/collections/cost-rules')?.tabs).toBe(SECTIONS.costs)
    expect(findSection('/admin/globals/blog-settings')?.tabs).toBe(SECTIONS.blog)
    expect(findSection('/admin/collections/permission-profiles')?.tabs).toBe(SECTIONS.users)
  })

  it('only shows on list and global screens, not inside a record', () => {
    expect(findSection('/admin/collections/users/12')).toBeNull()
    expect(findSection('/admin/collections/clients')).toBeNull()
  })
})
