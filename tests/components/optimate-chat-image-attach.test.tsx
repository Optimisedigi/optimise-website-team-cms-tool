import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import OptiMateChatCore from '@/components/OptiMateChatCore'

vi.mock('@/lib/realtime/token-provider', () => ({
  isVoiceEnabled: () => false,
}))

vi.mock('@/components/OptiMateVoice', () => ({ default: () => null }))
vi.mock('@/components/OptiMateTranscribe', () => ({ default: () => null }))
vi.mock('@/components/EmailAttachPicker', () => ({ default: () => null }))
vi.mock('@/components/OptiMateToolsHelp', () => ({ default: () => null }))
vi.mock('@/components/OptiMateProposalCard', () => ({ default: () => null }))
vi.mock('@/components/OptiMateConfirmBubble', () => ({ default: () => null }))

function jsonResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as Response
}

function pngFile(name = 'image.png') {
  return new File([new Uint8Array([137, 80, 78, 71])], name, { type: 'image/png' })
}

/** jsdom has no ClipboardEvent/DataTransfer, so fake the shape the handler reads. */
function pasteEvent(files: File[]) {
  const event = new Event('paste', { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'clipboardData', {
    value: { files, items: [] },
  })
  return event
}

function dropEvent(type: string, files: File[]) {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'dataTransfer', {
    value: { types: ['Files'], files, dropEffect: 'none' },
  })
  return event
}

describe('OptiMateChatCore image attachments', () => {
  beforeEach(() => {
    window.sessionStorage.clear()

    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    })

    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn(),
    })

    // jsdom returns an empty rect list for every element; the visibility guard
    // only needs "this subtree is on screen".
    Object.defineProperty(HTMLElement.prototype, 'getClientRects', {
      configurable: true,
      value: () => [{ width: 100, height: 100 }],
    })

    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input)
        if (url.startsWith('/api/agent-approval-queue')) return Promise.resolve(jsonResponse({ docs: [] }))
        return Promise.resolve(jsonResponse({}))
      }),
    )
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('attaches a pasted screenshot and shows the attachment indicator', async () => {
    render(<OptiMateChatCore auditId="audit-1" customerId="customer-1" />)

    fireEvent(window, pasteEvent([pngFile()]))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^Remove pasted-screenshot/ })).toBeInTheDocument()
    })
    expect(
      screen.getByRole('button', { name: 'Attach image screenshot. 1 attached.' }),
    ).toBeInTheDocument()
  })

  it('attaches a dropped screenshot', async () => {
    render(<OptiMateChatCore auditId="audit-1" customerId="customer-1" />)

    fireEvent(window, dropEvent('dragenter', [pngFile('dropped.png')]))
    expect(screen.getByText(/Drop images to attach/)).toBeInTheDocument()

    fireEvent(window, dropEvent('drop', [pngFile('dropped.png')]))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Remove dropped.png' })).toBeInTheDocument()
    })
  })

  it('leaves pastes aimed at another editor on the page alone', async () => {
    const otherEditor = document.createElement('textarea')
    document.body.appendChild(otherEditor)

    render(<OptiMateChatCore auditId="audit-1" customerId="customer-1" />)

    const event = pasteEvent([pngFile('blog-image.png')])
    otherEditor.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(false)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Attach image screenshot' })).toBeInTheDocument()
    })
    expect(screen.queryByRole('button', { name: 'Remove blog-image.png' })).not.toBeInTheDocument()

    otherEditor.remove()
  })

  it('ignores pastes that carry no image', async () => {
    render(<OptiMateChatCore auditId="audit-1" customerId="customer-1" />)

    const event = pasteEvent([])
    fireEvent(window, event)

    expect(event.defaultPrevented).toBe(false)
    expect(
      screen.getByRole('button', { name: 'Attach image screenshot' }),
    ).toBeInTheDocument()
  })
})
