import { describe, expect, it } from 'vitest'
import {
  cmsMailDraftPathFromGmailUrl,
  draftHtmlToText,
  stripTrailingSignature,
} from '@/lib/mail/drafts'
import { appendGmailSignature, formatGmailDraftHtml } from '@/lib/gmail-service'
import { markdownLiteToHtml } from '@/lib/email-draft-markdown'

const SIGNATURE = '<div dir="ltr"><b>Peter Tu</b><br>Optimise Digital<br><img src="https://example.com/logo.png"></div>'

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

describe('draft text round trip', () => {
  it('recovers the editable body without the Gmail signature from a saved draft', () => {
    const body = 'Hi Sam,\n\nThursday works for us.\n\n- Agenda attached\n- Call at 10am'
    const savedHtml = formatGmailDraftHtml(appendGmailSignature(markdownLiteToHtml(body), SIGNATURE))

    const text = stripTrailingSignature(draftHtmlToText(savedHtml), SIGNATURE)

    expect(text).toBe('Hi Sam,\n\nThursday works for us.\n\n- Agenda attached\n- Call at 10am')
    expect(text).not.toContain('Peter Tu')
  })

  it('leaves the body alone when the signature is not at the end', () => {
    expect(stripTrailingSignature('Peter Tu\nOptimise Digital\nMore text', SIGNATURE)).toBe(
      'Peter Tu\nOptimise Digital\nMore text',
    )
    expect(stripTrailingSignature('Hi Sam,', '')).toBe('Hi Sam,')
  })
})
