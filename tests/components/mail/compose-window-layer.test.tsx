import React from 'react'
import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import ComposeWindow from '@/components/mail/ComposeWindow'

// Regression: inside the admin layout the compose window's z-index was capped by
// an ancestor stacking context, so the OptiMate orb and client-email alert covered it.
describe('ComposeWindow layering', () => {
  it('renders on <body>, outside any page wrapper', () => {
    render(
      <div data-testid="wrapper" style={{ position: 'relative', zIndex: 1 }}>
        <ComposeWindow
          initial={{ mode: 'new', replyTo: null, to: '', cc: '', subject: '', html: '', attachments: [] }}
          title="New message"
          onClose={vi.fn()}
          onSend={vi.fn()}
          onSchedule={vi.fn()}
          onSaveDraft={vi.fn()}
          onDeleteDraft={vi.fn()}
          signatureHtml=""
        />
      </div>,
    )
    const dialog = screen.getByRole('dialog', { name: 'New message' })
    expect(dialog.parentElement).toBe(document.body)
    expect(screen.getByTestId('wrapper').contains(dialog)).toBe(false)
  })

  it('stacks above the OptiMate launcher (99998) and client-email alert (99999)', () => {
    const css = readFileSync('src/components/mail/ComposeWindow.module.css', 'utf8')
    const zIndex = Number(/\.window\s*\{[^}]*z-index:\s*(\d+)/.exec(css)?.[1])
    expect(zIndex).toBeGreaterThan(99999)
  })

  // Regression: the admin's global `ul { list-style: none }` hid every bullet in the body.
  it('shows list markers in the body despite the admin reset, with a small indent', () => {
    const css = readFileSync('src/components/mail/ComposeWindow.module.css', 'utf8')
    expect(css).toMatch(/\.editorList\s*\{[^}]*list-style:\s*disc/)
    expect(css).toMatch(/\.editorListNumber\s*\{[^}]*list-style:\s*decimal/)
    expect(css).toMatch(/\.editorListItem\s*\{[^}]*display:\s*list-item/)
  })

  it('is 22% larger than the original 560 x 640 window', () => {
    const css = readFileSync('src/components/mail/ComposeWindow.module.css', 'utf8')
    const block = /\.window\s*\{[^}]*\}/.exec(css)?.[0] ?? ''
    expect(block).toContain('width: min(683px')
    expect(block).toContain('height: min(781px')
  })
})
