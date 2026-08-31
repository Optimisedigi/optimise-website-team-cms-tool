import { beforeEach, describe, expect, it, vi } from 'vitest'
import { applyLinkShortcut, safeLinkHref } from '@/lib/rich-text-links'

const keyEvent = (key: string, mods: { metaKey?: boolean; ctrlKey?: boolean } = {}) => ({
  key,
  metaKey: Boolean(mods.metaKey),
  ctrlKey: Boolean(mods.ctrlKey),
  preventDefault: vi.fn(),
})

function selectTextIn(html: string): HTMLElement {
  document.body.innerHTML = `<div contenteditable id="editor">${html}</div>`
  const editor = document.getElementById('editor') as HTMLElement
  const range = document.createRange()
  range.selectNodeContents(editor)
  const selection = window.getSelection()!
  selection.removeAllRanges()
  selection.addRange(range)
  return editor
}

describe('safeLinkHref', () => {
  it('adds https to bare domains', () => {
    expect(safeLinkHref('optimisedigital.online')).toBe('https://optimisedigital.online/')
  })

  it('keeps http, https and mailto links', () => {
    expect(safeLinkHref('http://a.com/x')).toBe('http://a.com/x')
    expect(safeLinkHref('mailto:peter@optimisedigital.online')).toBe('mailto:peter@optimisedigital.online')
  })

  it('rejects script and data urls', () => {
    expect(safeLinkHref('javascript:alert(1)')).toBeNull()
    expect(safeLinkHref('JaVaScRiPt:alert(1)')).toBeNull()
    expect(safeLinkHref('data:text/html,<script>alert(1)</script>')).toBeNull()
    expect(safeLinkHref('   ')).toBeNull()
  })
})

describe('applyLinkShortcut', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    vi.restoreAllMocks()
  })

  it('ignores keys other than cmd/ctrl+K', () => {
    const plainK = keyEvent('k')
    expect(applyLinkShortcut(plainK, () => 'https://a.com')).toBe(false)
    expect(plainK.preventDefault).not.toHaveBeenCalled()
    expect(applyLinkShortcut(keyEvent('b', { metaKey: true }), () => 'https://a.com')).toBe(false)
  })

  it('wraps the selected text in a link instead of showing the url', () => {
    const editor = selectTextIn('Read the audit')
    const event = keyEvent('k', { metaKey: true })

    expect(applyLinkShortcut(event, () => 'optimisedigital.online/audit')).toBe(true)
    expect(event.preventDefault).toHaveBeenCalled()

    const anchor = editor.querySelector('a') as HTMLAnchorElement
    expect(anchor).toBeTruthy()
    expect(anchor.getAttribute('href')).toBe('https://optimisedigital.online/audit')
    expect(anchor.textContent).toBe('Read the audit')
    expect(anchor.getAttribute('target')).toBe('_blank')
    expect(anchor.getAttribute('rel')).toBe('noreferrer')
  })

  it('works with ctrl for windows users', () => {
    const editor = selectTextIn('docs')
    applyLinkShortcut(keyEvent('K', { ctrlKey: true }), () => 'https://a.com/docs')
    expect(editor.querySelector('a')?.getAttribute('href')).toBe('https://a.com/docs')
  })

  it('never creates a javascript link', () => {
    const editor = selectTextIn('click me')
    applyLinkShortcut(keyEvent('k', { metaKey: true }), () => 'javascript:alert(1)')
    expect(editor.querySelector('a')).toBeNull()
  })

  it('leaves the text untouched when the prompt is cancelled', () => {
    const editor = selectTextIn('unchanged')
    applyLinkShortcut(keyEvent('k', { metaKey: true }), () => null)
    expect(editor.querySelector('a')).toBeNull()
    expect(editor.textContent).toBe('unchanged')
  })

  it('removes the link when the url is cleared', () => {
    const editor = selectTextIn('<a href="https://a.com">linked</a>')
    applyLinkShortcut(keyEvent('k', { metaKey: true }), () => '')
    expect(editor.querySelector('a')).toBeNull()
    expect(editor.textContent).toBe('linked')
  })
})
