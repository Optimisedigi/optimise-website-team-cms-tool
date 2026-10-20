import React, { createRef } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { act, render, waitFor } from '@testing-library/react'
import RichEmailEditor, { clipboardImageFiles, type EmailSelectionFormat, type RichEmailEditorHandle } from '@/components/mail/RichEmailEditor'
import { clampImageWidth, MIN_IMAGE_WIDTH, resizedImageWidth } from '@/components/mail/EmailImageNode'

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

async function mount(initialHtml: string, onFormatChange?: (format: EmailSelectionFormat) => void) {
  const ref = createRef<RichEmailEditorHandle>()
  const onContentChange = vi.fn()
  render(
    <RichEmailEditor
      ref={ref}
      initialHtml={initialHtml}
      placeholder="Write here"
      ariaLabel="Email body"
      onContentChange={onContentChange}
      onPasteFiles={() => undefined}
      onFormatChange={onFormatChange}
    />,
  )
  await waitFor(() => expect(ref.current?.getHtml()).toBeTruthy())
  return { ref, onContentChange }
}

describe('RichEmailEditor', () => {
  it('keeps bold, italic, underline, tables and inline images from loaded HTML', async () => {
    const { ref } = await mount(
      `<p><b>Bold</b> <i>it</i> <u>under</u></p>` +
        `<table><tr><th>Month</th><th>Clicks</th></tr><tr><td>Sep</td><td>120</td></tr></table>` +
        `<p><img src="data:image/png;base64,${PNG}" alt="chart" width="300"></p>`,
    )
    const html = ref.current?.getHtml() ?? ''
    expect(html).toMatch(/<b>[^]*Bold/)
    expect(html).toMatch(/<i>[^]*it/)
    expect(html).toMatch(/<u>[^]*under/)
    expect(html).toContain('<table')
    expect(html).toContain('Clicks')
    expect(html).toContain(`src="data:image/png;base64,${PNG}"`)
    expect(html).toContain('width="300"')
  })

  it('drops unsafe images and markup from pasted or loaded HTML', async () => {
    const { ref } = await mount('<p onclick="x()">Hi</p><img src="javascript:alert(1)"><script>alert(1)</script>')
    const html = ref.current?.getHtml() ?? ''
    expect(html).toContain('Hi')
    expect(html).not.toContain('javascript:')
    expect(html).not.toContain('onclick')
    expect(html).not.toContain('<script')
  })

  it('never keeps a pasted font or size, but keeps colour and bold inside coloured text', async () => {
    const { ref } = await mount(
      '<p><span style="font-family:Georgia;font-size:28px;color:#cc0000">Red <b>bold</b></span> ' +
        '<font face="Arial" size="6" color="#0b5394">blue</font> <code>mono</code></p>',
    )
    const html = ref.current?.getHtml() ?? ''
    expect(html).not.toMatch(/font-family|font-size|Georgia|Arial|<code/)
    expect(html).toMatch(/<span style="[^"]*color: (?:#cc0000|rgb\(204, 0, 0\))[^"]*">Red /)
    expect(html).toMatch(/<b><strong[^>]*style="[^"]*color: (?:#cc0000|rgb\(204, 0, 0\))[^"]*">bold<\/strong><\/b>/)
    expect(html).toMatch(/color: (?:#0b5394|rgb\(11, 83, 148\))[^"]*">blue/)
    expect(html).toContain('mono')
  })

  it('colours selected text and toggles bulleted and numbered lists', async () => {
    const onFormat = vi.fn()
    const { ref } = await mount('<p>Item one</p>', onFormat)
    act(() => {
      ref.current?.focus()
      ref.current?.toggleList('bullet')
    })
    await waitFor(() => expect(ref.current?.getHtml()).toMatch(/<ul[^>]*><li[^>]*>[^]*Item one/))
    expect(onFormat).toHaveBeenLastCalledWith({ list: 'bullet', color: null })
    act(() => ref.current?.toggleList('number'))
    await waitFor(() => expect(ref.current?.getHtml()).toMatch(/<ol[^>]*><li[^>]*>[^]*Item one/))
    act(() => ref.current?.toggleList('number'))
    await waitFor(() => expect(ref.current?.getHtml()).not.toMatch(/<ol|<ul/))

    act(() => ref.current?.setHtml('<p>Paint me</p>'))
    // Rejected values never reach the text.
    act(() => ref.current?.setTextColor('red;background:url(x)'))
    expect(ref.current?.getHtml()).not.toContain('url(')
  })

  it('gives the AI tables as markdown and inserts new tables', async () => {
    const { ref } = await mount('<p>Hi Sam,</p><table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table>')
    expect(ref.current?.getMarkdown()).toBe('Hi Sam,\n\n| A | B |\n| --- | --- |\n| 1 | 2 |')

    act(() => ref.current?.setHtml(''))
    act(() => {
      ref.current?.focus()
      ref.current?.insertTable(2, 3)
    })
    await waitFor(() => expect((ref.current?.getHtml().match(/<td|<th/g) ?? []).length).toBe(6))
  })

  it('pastes a copied image as the image itself, but keeps tables and text as HTML', () => {
    const png = new File([new Uint8Array([1])], 'image.png', { type: 'image/png' })
    const clip = (html: string, text = '') => ({ files: [png] as unknown as FileList, getData: (type: string) => (type === 'text/html' ? html : text) })
    // Screenshot, copied web image, image file copied in Finder.
    expect(clipboardImageFiles(clip(''))).toEqual([png])
    expect(clipboardImageFiles(clip('<meta charset="utf-8"><img src="http://x/a.png">'))).toEqual([png])
    expect(clipboardImageFiles(clip('', 'image.png'))).toEqual([png])
    // Excel/Docs also put a picture of the selection on the clipboard: the HTML wins.
    expect(clipboardImageFiles(clip('<table><tr><td>Clicks</td></tr></table>'))).toBeNull()
    expect(clipboardImageFiles({ files: [] as unknown as FileList, getData: () => '' })).toBeNull()
  })

  it('inserts images inline at the cursor and resizes them', async () => {
    const { ref } = await mount('<p>Before after</p>')
    act(() => {
      ref.current?.focus()
      ref.current?.insertImage(`data:image/png;base64,${PNG}`, 'shot', 300)
    })
    await waitFor(() => expect(ref.current?.getHtml()).toMatch(/<p[^>]*>[^]*<img[^>]*width="300"/))
    expect(clampImageWidth(10, 500)).toBe(MIN_IMAGE_WIDTH)
    expect(clampImageWidth(900, 500)).toBe(500)
    expect(clampImageWidth(250.4, 500)).toBe(250)
    // Right corners grow when dragged right, left corners when dragged left.
    expect(resizedImageWidth(300, 50, 'se', 600)).toBe(350)
    expect(resizedImageWidth(300, 50, 'ne', 600)).toBe(350)
    expect(resizedImageWidth(300, -50, 'nw', 600)).toBe(350)
    expect(resizedImageWidth(300, 50, 'sw', 600)).toBe(250)
    expect(resizedImageWidth(300, 900, 'se', 600)).toBe(600)

    // Clicking the image selects it and shows a handle on every corner.
    const img = document.querySelector('img[alt="shot"]') as HTMLImageElement
    act(() => {
      img.click()
    })
    await waitFor(() => expect(document.querySelectorAll('[data-corner]')).toHaveLength(4))
  })
})
