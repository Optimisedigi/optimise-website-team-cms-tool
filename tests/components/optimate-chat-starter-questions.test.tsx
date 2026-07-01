import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import OptiMateChatCore from '@/components/OptiMateChatCore'
import { DEFAULT_GOOGLE_MATE_STARTER_QUESTIONS } from '@/lib/agents/_shared/optimate-starter-questions'
import { DEFAULT_CHAT_MODEL } from '@/lib/agents/_shared/llm/registry'

vi.mock('@/lib/realtime/token-provider', () => ({
  isVoiceEnabled: () => false,
}))

vi.mock('@/components/OptiMateVoice', () => ({
  default: () => null,
}))

vi.mock('@/components/OptiMateTranscribe', () => ({
  default: () => null,
}))

vi.mock('@/components/EmailAttachPicker', () => ({
  default: () => null,
}))

vi.mock('@/components/OptiMateToolsHelp', () => ({
  default: () => null,
}))

vi.mock('@/components/OptiMateProposalCard', () => ({
  default: () => null,
}))

vi.mock('@/components/OptiMateConfirmBubble', () => ({
  default: () => null,
}))

function jsonResponse(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: async () => body,
  } as Response
}

describe('OptiMateChatCore Google Mate starter questions', () => {
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

    if (!globalThis.crypto.randomUUID) {
      Object.defineProperty(globalThis.crypto, 'randomUUID', {
        configurable: true,
        value: vi.fn(() => 'test-session-id'),
      })
    }

    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn(),
    })
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('starts without bundled fallback questions and renders only settings-loaded questions', async () => {
    let resolveSettings!: (response: Response) => void
    const settingsPromise = new Promise<Response>((resolve) => {
      resolveSettings = resolve
    })

    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input)
        if (url === '/api/optimate/default-model') return settingsPromise
        if (url.startsWith('/api/agent-approval-queue')) return Promise.resolve(jsonResponse({ docs: [] }))
        return Promise.resolve(jsonResponse({}))
      }),
    )

    render(<OptiMateChatCore auditId="audit-1" customerId="customer-1" />)

    for (const question of DEFAULT_GOOGLE_MATE_STARTER_QUESTIONS) {
      expect(screen.queryByRole('button', { name: question })).not.toBeInTheDocument()
    }

    resolveSettings(
      jsonResponse({
        defaultChatModel: DEFAULT_CHAT_MODEL,
        googleMateStarterQuestions: ['Settings-loaded Google Mate question'],
        googleMatePortfolioStarterQuestions: ['Settings-loaded portfolio question'],
      }),
    )

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Settings-loaded Google Mate question' }),
      ).toBeInTheDocument()
    })

    expect(
      screen.queryByRole('button', { name: 'Settings-loaded portfolio question' }),
    ).not.toBeInTheDocument()
    for (const question of DEFAULT_GOOGLE_MATE_STARTER_QUESTIONS) {
      expect(screen.queryByRole('button', { name: question })).not.toBeInTheDocument()
    }
  })
})
