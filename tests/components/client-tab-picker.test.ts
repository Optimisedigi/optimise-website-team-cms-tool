import { describe, expect, it } from 'vitest'
import { groupClientTabs } from '@/components/client-business/ClientTabPicker'

describe('groupClientTabs', () => {
  it('groups the client tabs and puts unknown ones under More', () => {
    const tabs = ['Business', 'Notes', 'Google Ads', 'Integrations', 'Retainer', 'Something new'].map((label, index) => ({
      index,
      label,
      active: index === 0,
    }))
    const groups = groupClientTabs(tabs)
    expect(groups.map((g) => [g.title, g.tabs.map((t) => t.label)])).toEqual([
      ['Client', ['Business', 'Notes']],
      ['Marketing', ['Google Ads']],
      ['Sharing', ['Integrations']],
      ['Billing', ['Retainer']],
      ['More', ['Something new']],
    ])
  })
})
