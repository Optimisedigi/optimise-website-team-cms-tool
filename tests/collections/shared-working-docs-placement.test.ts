import { describe, expect, it } from 'vitest'

import { Clients } from '@/collections/Clients'
import { SharedWorkingDocs } from '@/collections/SharedWorkingDocs'

describe('shared working documents admin placement', () => {
  it('hides the standalone collection from the admin navigation', () => {
    expect(SharedWorkingDocs.admin?.hidden).toBe(true)
  })

  it('renders working documents in their own client profile tab', () => {
    const tabsField = (Clients.fields as any[]).find((field) => field.type === 'tabs')
    const workingDocsTab = tabsField?.tabs?.find(
      (tab: { label?: string }) => tab.label === 'Working Docs',
    )
    expect(workingDocsTab).toBeDefined()
    expect(workingDocsTab.fields).toContainEqual(
      expect.objectContaining({
        name: 'sharedWorkingDocsPanel',
        type: 'ui',
        admin: expect.objectContaining({
          components: { Field: '/components/ClientWorkingDocsPanel' },
        }),
      }),
    )
  })
})
