import { describe, expect, it } from 'vitest'
import { cmsMailDraftPathFromGmailUrl } from '@/lib/mail/drafts'

describe('cmsMailDraftPathFromGmailUrl', () => {
  it('maps a Gmail draft link to the CMS Mail compose view', () => {
    expect(cmsMailDraftPathFromGmailUrl('https://mail.google.com/mail/u/0/#drafts/19a2b3c4d5')).toBe(
      '/admin/mail?draft=19a2b3c4d5',
    )
  })

  it('ignores non-draft Gmail links, look-alike hosts and junk ids', () => {
    expect(cmsMailDraftPathFromGmailUrl('https://mail.google.com/mail/u/0/#all/19a2b3c4d5')).toBeNull()
    expect(cmsMailDraftPathFromGmailUrl('https://mail.google.com.evil.test/mail/u/0/#drafts/abc')).toBeNull()
    expect(cmsMailDraftPathFromGmailUrl('http://mail.google.com/mail/u/0/#drafts/abc')).toBeNull()
    expect(cmsMailDraftPathFromGmailUrl('https://mail.google.com/mail/u/0/#drafts/a%22b')).toBeNull()
    expect(cmsMailDraftPathFromGmailUrl('not a url')).toBeNull()
  })
})
