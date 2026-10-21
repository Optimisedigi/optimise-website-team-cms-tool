import { afterEach, describe, expect, it, vi } from 'vitest'
import { handleTeamTaskPaste, pastedHtmlInBlack, TEAM_TASK_PASTE_COLOR } from '@/lib/team-task-paste'

const BLACK = `color:${TEAM_TASK_PASTE_COLOR}`

afterEach(() => {
  document.body.innerHTML = ''
})

describe('pastedHtmlInBlack', () => {
  it('turns white and coloured text black, keeping bold, italic, underline and lists', () => {
    const html = pastedHtmlInBlack({
      html:
        '<p><span style="color:#ffffff;font-family:Georgia;font-size:30px;background:#000">White</span> ' +
        '<font color="red"><b>bold</b></font> <i style="color:rgb(255,255,255)">it</i> <u>under</u></p>' +
        '<ul><li style="color:white">One</li></ul><ol><li>Two</li></ol>',
      text: 'White bold it under\nOne\nTwo',
    })

    expect(html).not.toMatch(/#ffffff|rgb\(255|color:\s*white|color=|red\b|Georgia|font-size|background/i)
    expect(html).toContain(`<span style="${BLACK}">White</span>`)
    expect(html).toContain(`<b><span style="${BLACK}">bold</span></b>`)
    expect(html).toContain(`<i><span style="${BLACK}">it</span></i>`)
    expect(html).toContain(`<u><span style="${BLACK}">under</span></u>`)
    expect(html).toContain(`<ul><li><span style="${BLACK}">One</span></li></ul>`)
    expect(html).toContain(`<ol><li><span style="${BLACK}">Two</span></li></ol>`)
  })

  it('keeps Google Docs style bold and italic but not its normal-weight wrapper', () => {
    const html = pastedHtmlInBlack({
      html: '<b style="font-weight:normal"><span style="font-weight:700;color:#fff">Heavy</span> <span style="font-style:italic">slant</span> plain</b>',
      text: 'Heavy slant plain',
    })
    expect(html).toBe(`<b><span style="${BLACK}">Heavy</span></b><span style="${BLACK}"> </span><i><span style="${BLACK}">slant</span></i><span style="${BLACK}"> plain</span>`)
  })

  it('keeps safe links blue and drops unsafe markup', () => {
    const html = pastedHtmlInBlack({
      html: '<a href="https://example.com" style="color:white">Site</a><a href="javascript:alert(1)">bad</a><script>alert(1)</script><img src=x onerror=alert(1)><span onclick="x()">ok</span>',
      text: 'Site bad ok',
    })
    expect(html).toContain('<a href="https://example.com/" target="_blank" rel="noreferrer noopener" style="color:#2563eb;text-decoration:underline;">Site</a>')
    expect(html).not.toMatch(/javascript:|<script|<img|onclick|onerror/)
    expect(html).toContain(`<span style="${BLACK}">bad</span>`)
    expect(html).toContain(`<span style="${BLACK}">ok</span>`)
  })

  it('pastes plain text in black with escaped markup and line breaks', () => {
    expect(pastedHtmlInBlack({ html: '', text: 'a <b>\nsecond' })).toBe(`<span style="${BLACK}">a &lt;b&gt;</span><br /><span style="${BLACK}">second</span>`)
  })
})

describe('handleTeamTaskPaste', () => {
  it('inserts the black version at the caret instead of the original', () => {
    const box = document.createElement('div')
    box.contentEditable = 'true'
    box.innerHTML = 'Before '
    document.body.appendChild(box)
    const range = document.createRange()
    range.selectNodeContents(box)
    range.collapse(false)
    window.getSelection()?.removeAllRanges()
    window.getSelection()?.addRange(range)

    const preventDefault = vi.fn()
    handleTeamTaskPaste({
      clipboardData: { getData: (type: string) => (type === 'text/html' ? '<span style="color:#fff">pasted</span>' : 'pasted') },
      preventDefault,
    })

    expect(preventDefault).toHaveBeenCalled()
    expect(box.innerHTML).toBe(`Before <span style="${BLACK}">pasted</span>`)
  })

  it('leaves image-only pastes to the browser', () => {
    const preventDefault = vi.fn()
    handleTeamTaskPaste({ clipboardData: { getData: () => '' }, preventDefault })
    expect(preventDefault).not.toHaveBeenCalled()
  })
})
