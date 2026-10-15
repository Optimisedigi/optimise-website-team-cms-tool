import { describe, expect, it } from 'vitest'
import { appendGmailSignature, formatGmailDraftHtml } from '@/lib/gmail-service'
import { buildEditableDraft, stripAppendedSignature } from '@/lib/mail/draft-content'
import { markdownLiteToHtml } from '@/lib/email-draft-markdown'

const SIGNATURE = '<div dir="ltr"><p style="font-family:Arial;font-size:12px">Peter Tu</p><img src="https://example.com/logo.png"></div>'

describe('stripAppendedSignature', () => {
  it('removes the signature createGmailDraft appended, keeping the body', () => {
    const saved = formatGmailDraftHtml(appendGmailSignature(markdownLiteToHtml('Hi Sam,\n\nThursday works.'), SIGNATURE))
    const body = stripAppendedSignature(saved, SIGNATURE)
    expect(body).toBe(
      '<div style="font-family:Verdana,sans-serif;font-size:small;line-height:1.5;color:#1f2937;">Hi Sam,<br><br>Thursday works.</div>',
    )
    expect(body).not.toContain('Peter Tu')
  })

  it('leaves drafts without that signature alone', () => {
    expect(stripAppendedSignature('<p>Hi</p>', SIGNATURE)).toBe('<p>Hi</p>')
    expect(stripAppendedSignature('<p>Hi</p>', '')).toBe('<p>Hi</p>')
  })
})

describe('buildEditableDraft', () => {
  it('shows inline images as data URLs and returns other files as attachments', () => {
    const draft = buildEditableDraft(
      {
        html: '<p>See <img src="cid:image1@optimate.mail"></p><script>x()</script>',
        text: '',
        inline: [{ filename: 'image-1.png', mimeType: 'image/png', contentId: 'image1@optimate.mail', data: 'AAAA', size: 3 }],
        attachments: [{ filename: 'quote.pdf', mimeType: 'application/pdf', contentId: '', data: 'BBBB', size: 3 }],
        tooLarge: false,
      },
      '',
    )
    expect(draft.html).toBe('<p>See <img src="data:image/png;base64,AAAA"></p>')
    expect(draft.attachments).toEqual([{ name: 'quote.pdf', mediaType: 'application/pdf', data: 'BBBB' }])
  })

  it('uses the plain-text part when a draft has no HTML', () => {
    const draft = buildEditableDraft({ html: '', text: 'Hi <Sam>\nThanks', inline: [], attachments: [], tooLarge: false }, '')
    expect(draft.html).toBe('Hi &lt;Sam&gt;<br>Thanks')
  })
})
