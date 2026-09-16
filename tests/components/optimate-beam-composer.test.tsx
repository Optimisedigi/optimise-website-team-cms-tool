import React from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import OptiMateBeamComposer from '../../src/components/OptiMateBeamComposer'
import OptiMateChatCore from '../../src/components/OptiMateChatCore'

const originalMatchMedia = window.matchMedia
const originalScrollIntoView = HTMLElement.prototype.scrollIntoView

function installMatchMedia(): void {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string): MediaQueryList => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }),
  })
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: originalMatchMedia,
  })
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: originalScrollIntoView,
  })
})

function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  } as Response
}

describe('OptiMateBeamComposer', () => {
  it('wraps the input, tools, send control, and selectors in one active beam', () => {
    installMatchMedia()

    const { container } = render(
      <OptiMateBeamComposer>
        <textarea aria-label="Message" />
        <button type="button" aria-label="Attach">Attach</button>
        <button type="button" aria-label="Send">Send</button>
        <select aria-label="Reasoning"><option>Reasoning off</option></select>
        <select aria-label="Model"><option>Claude</option></select>
      </OptiMateBeamComposer>,
    )

    const beam = container.querySelector('[data-beam]') as HTMLElement | null
    expect(beam).not.toBeNull()
    expect(beam?.hasAttribute('data-active')).toBe(true)
    expect(beam?.style.getPropertyValue('--beam-strength')).toBe('1')
    expect(beam?.contains(screen.getByLabelText('Message'))).toBe(true)
    expect(beam?.contains(screen.getByLabelText('Attach'))).toBe(true)
    expect(beam?.contains(screen.getByLabelText('Send'))).toBe(true)
    expect(beam?.contains(screen.getByLabelText('Reasoning'))).toBe(true)
    expect(beam?.contains(screen.getByLabelText('Model'))).toBe(true)
    expect(container.querySelector('style')?.textContent).toContain('beam-spin-')
  })

  it('keeps the real chat tools and selectors inside the composer beam', () => {
    installMatchMedia()
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn(),
    })
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input)
        if (url.startsWith('/api/agent-approval-queue')) return Promise.resolve(jsonResponse({ docs: [] }))
        if (url === '/api/optimate/default-model') {
          return Promise.resolve(jsonResponse({ defaultChatModel: 'claude-sonnet-5' }))
        }
        return Promise.resolve(jsonResponse({}))
      }),
    )

    const { container } = render(<OptiMateChatCore auditId="audit-1" customerId="customer-1" />)
    const beam = container.querySelector('[data-beam]')
    const input = screen.getByPlaceholderText('Feel free to ask')
    const email = screen.getByRole('button', { name: 'Browse Gmail inbox' })
    const attachment = screen.getByRole('button', { name: 'Attach image screenshot' })
    const microphone = screen.getByRole('button', { name: 'Start voice' })
    const send = screen.getByRole('button', { name: 'Send' })
    const selectors = container.querySelectorAll('[data-optimate-select]')

    expect(beam).not.toBeNull()
    expect(beam?.contains(input)).toBe(true)
    expect(beam?.contains(email)).toBe(true)
    expect(beam?.contains(attachment)).toBe(true)
    expect(beam?.contains(microphone)).toBe(true)
    expect(beam?.contains(send)).toBe(true)
    expect(send.closest('.metal-fx-root, .metal-fx-fallback')).not.toBeNull()
    expect(selectors).toHaveLength(2)
    expect(Array.from(selectors).every((selector) => beam?.contains(selector))).toBe(true)
  })
})
