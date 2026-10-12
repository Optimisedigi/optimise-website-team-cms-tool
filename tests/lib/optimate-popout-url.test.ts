import { describe, expect, it } from 'vitest'
import { buildGoogleMatePopoutUrl, parsePopoutId, SELECTED_ACCOUNTS_TAB_ID } from '@/lib/optimate-popout-url'

function params(url: string): URLSearchParams {
  return new URL(url, 'https://cms.example').searchParams
}

describe('buildGoogleMatePopoutUrl', () => {
  it('carries the "Selected accounts" thread and active tab so a multi-account chat reopens populated', () => {
    const url = buildGoogleMatePopoutUrl({
      portfolio: false,
      auditIds: [4, 2, 7],
      sessionMap: {
        [SELECTED_ACCOUNTS_TAB_ID]: 'a1b2c3d4-0000-4000-8000-000000000001',
        '2': 'sess-two',
      },
      activeTabId: SELECTED_ACCOUNTS_TAB_ID,
    })
    const p = params(url)
    expect(url.startsWith('/optimate-popout?')).toBe(true)
    expect(p.get('audits')).toBe('4,2,7')
    expect(p.get('sessionIds')).toBe(',sess-two,')
    expect(p.get('selectedSessionId')).toBe('a1b2c3d4-0000-4000-8000-000000000001')
    expect(p.get('active')).toBe(SELECTED_ACCOUNTS_TAB_ID)
  })

  it('uses the portfolio thread in portfolio mode', () => {
    const p = params(buildGoogleMatePopoutUrl({ portfolio: true, auditIds: [], sessionMap: { portfolio: 'sess-p' } }))
    expect(p.get('mode')).toBe('portfolio')
    expect(p.get('sessionIds')).toBe('sess-p')
    expect(p.has('audits')).toBe(false)
  })

  it('drops session ids that are not plain id tokens', () => {
    const p = params(
      buildGoogleMatePopoutUrl({
        portfolio: false,
        auditIds: [1],
        sessionMap: { '1': 'x,y', [SELECTED_ACCOUNTS_TAB_ID]: '../evil' },
        activeTabId: '<script>',
      }),
    )
    expect(p.has('sessionIds')).toBe(false)
    expect(p.has('selectedSessionId')).toBe(false)
    expect(p.has('active')).toBe(false)
  })
})

describe('parsePopoutId', () => {
  it('accepts uuids and numeric ids, rejects anything else', () => {
    expect(parsePopoutId(' 12 ')).toBe('12')
    expect(parsePopoutId('a1b2c3d4-0000-4000-8000-000000000001')).toBe('a1b2c3d4-0000-4000-8000-000000000001')
    expect(parsePopoutId('')).toBeUndefined()
    expect(parsePopoutId(undefined)).toBeUndefined()
    expect(parsePopoutId('a/b')).toBeUndefined()
    expect(parsePopoutId('x'.repeat(129))).toBeUndefined()
  })
})
