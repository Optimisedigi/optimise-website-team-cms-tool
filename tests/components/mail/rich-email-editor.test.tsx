import React, { createRef } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { act, render, waitFor } from '@testing-library/react'
import RichEmailEditor, { type RichEmailEditorHandle } from '@/components/mail/RichEmailEditor'

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

async function mount(initialHtml: string) {
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
})
