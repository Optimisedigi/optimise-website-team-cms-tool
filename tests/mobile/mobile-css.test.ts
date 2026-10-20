import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { OPTIMATE_MODAL_CSS } from '@/components/optimate-modal-styles'

const read = (p: string) => readFileSync(p, 'utf8')

describe('mobile styles', () => {
  it('OptiMate panel goes full-screen on phones with safe-area padding and 16px inputs', () => {
    const phone = OPTIMATE_MODAL_CSS.slice(OPTIMATE_MODAL_CSS.indexOf('@media (max-width: 768px)'))
    expect(phone).toContain('100dvh')
    expect(phone).toContain('env(safe-area-inset-top)')
    expect(phone).toMatch(/font-size:\s*16px/)
  })
  it('mail reader slides in from the right and the reply bar respects the home indicator', () => {
    const css = read('src/components/mail/MailApp.module.css')
    expect(css).toContain('translateX(100%)')
    expect(css).toMatch(/\.readerOpen\s*\{[^}]*translateX\(0\)/)
    expect(css).toContain('env(safe-area-inset-bottom)')
  })
  it('viewport covers the notch so safe-area insets work in the home-screen app', () => {
    expect(read('src/components/ViewportMeta.tsx')).toContain('viewport-fit=cover')
  })
  it('tab bar is hidden by default and only shown on phones', () => {
    const scss = read('src/app/(payload)/custom.scss')
    expect(scss).toMatch(/\.mobile-tabbar\s*\{\s*display:\s*none;/)
  })
  it('OptiMate keeps its desktop controls on phones (pop-out stays, no hidden buttons)', () => {
    const phone = OPTIMATE_MODAL_CSS.slice(OPTIMATE_MODAL_CSS.indexOf('@media (max-width: 768px)'), OPTIMATE_MODAL_CSS.indexOf('@keyframes om-bob'))
    expect(phone).not.toContain('display: none')
  })
  it('compose keeps every AI/attach/send control on phones and only resizes them', () => {
    const css = read('src/components/mail/ComposeWindow.module.css')
    const phone = css.slice(css.indexOf('@media (max-width: 640px)'), css.indexOf('\n.threadToggle {'))
    // Only the scrollbar may be hidden; no control is.
    expect(phone.replace(/::-webkit-scrollbar\s*\{[^}]*\}/g, '')).not.toMatch(/display:\s*none/)
    expect(phone).toContain('.aiButton')
    expect(phone).toContain('.footer')
    expect(phone).toMatch(/\.footer\s*\{[^}]*flex-wrap:\s*nowrap/)
    // Icon-only attach/image buttons and the thread toggle (same row) stay thumb-sized.
    expect(phone).toMatch(/\.iconButton\s*\{[^}]*min-width:\s*44px/)
    expect(phone).toContain('.threadToggle')
    expect(phone).toContain('env(safe-area-inset-bottom)')
    expect(phone).toMatch(/\.prompt[\s\S]*font-size:\s*16px/)
  })
})
