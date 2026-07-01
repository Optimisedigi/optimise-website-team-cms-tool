import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import OptiMateChatCore from '@/components/OptiMateChatCore'
import { DEFAULT_CHAT_MODEL } from '@/lib/agents/_shared/llm/registry'
import type { AttachedEmailMeta } from '@/components/EmailAttachPicker'

const fakeAttachedEmail: AttachedEmailMeta = {
  messageId: 'gmail-msg-123',
  subject: 'Need help with spend',
  from: 'client@example.com',
  date: '2026-06-30T10:00:00.000Z',
  snippet: 'Can you check the account before the meeting?',
}

let latestVoiceProps: Record<string, unknown> | null = null
let latestBuiltPayload: unknown = null

vi.mock('@/lib/realtime/token-provider', () => ({
  isVoiceEnabled: () => true,
}))

vi.mock('@/components/OptiMateVoice', () => ({
  default: (props: Record<string, unknown>) => {
    latestVoiceProps = props
    return (
      <button
        type="button"
        onClick={() => {
          const buildTypedChatRequest = props.buildTypedChatRequest as ((text: string) => unknown) | undefined
          latestBuiltPayload = buildTypedChatRequest?.('Can you review the selected accounts?')
        }}
      >
        Build typed voice payload
      </button>
    )
  },
}))

vi.mock('@/components/OptiMateTranscribe', () => ({
  default: () => null,
}))

vi.mock('@/components/EmailAttachPicker', () => ({
  default: ({ open, onSelect }: { open: boolean; onSelect: (meta: AttachedEmailMeta) => void }) =>
    open ? (
      <button type="button" onClick={() => onSelect(fakeAttachedEmail)}>
        Attach fake email
      </button>
    ) : null,
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

describe('OptiMate voice typed-backend handoff', () => {
  beforeEach(() => {
    latestVoiceProps = null
    latestBuiltPayload = null
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
        value: vi.fn(() => 'generated-session-id'),
      })
    }

    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn(),
    })

    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input)
        if (url === '/api/optimate/default-model') {
          return Promise.resolve(
            jsonResponse({
              defaultChatModel: DEFAULT_CHAT_MODEL,
              googleMateStarterQuestions: [],
              googleMatePortfolioStarterQuestions: [],
            }),
          )
        }
        if (url === '/api/optimate-chat-history?sessionId=session-123') {
          return Promise.resolve(
            jsonResponse({
              sessionId: 'session-123',
              turns: [
                { role: 'user', content: 'How did account A perform last week?' },
                { role: 'assistant', content: 'Account A spent $420 and drove 12 leads.' },
              ],
            }),
          )
        }
        if (url.startsWith('/api/agent-approval-queue')) {
          return Promise.resolve(jsonResponse({ docs: [] }))
        }
        return Promise.resolve(jsonResponse({}))
      }),
    )
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('forwards typed chat session, history, selected account context, and attached email metadata into the voice handoff payload', async () => {
    const { rerender } = render(
      <OptiMateChatCore
        mode="portfolio"
        auditId="audit-1"
        customerId="customer-1"
        businessName="Demo Co"
        selectedAccountRefs={['acct-1', 'acct-2']}
        initialSessionId="session-123"
      />,
    )

    await waitFor(() => {
      expect((latestVoiceProps?.typedChatContext as { history?: unknown[] } | undefined)?.history).toEqual([
        { role: 'user', content: 'How did account A perform last week?' },
        { role: 'assistant', content: 'Account A spent $420 and drove 12 leads.' },
      ])
    })

    fireEvent.click(screen.getByRole('button', { name: 'Browse Gmail inbox' }))
    fireEvent.click(screen.getByRole('button', { name: 'Attach fake email' }))

    await waitFor(() => {
      expect(latestVoiceProps?.attachedEmailMessageId).toBe('gmail-msg-123')
    })

    rerender(
      <OptiMateChatCore
        mode="portfolio"
        auditId="audit-1"
        customerId="customer-1"
        businessName="Demo Co"
        selectedAccountRefs={['acct-1', 'acct-2']}
        initialSessionId="session-123"
        hideInput
      />,
    )

    await waitFor(() => {
      expect(latestVoiceProps?.attachedEmailMessageId).toBe('gmail-msg-123')
    })

    fireEvent.click(screen.getByRole('button', { name: 'Build typed voice payload' }))

    expect(latestVoiceProps?.typedChatContext).toMatchObject({
      sessionId: 'session-123',
      history: [
        { role: 'user', content: 'How did account A perform last week?' },
        { role: 'assistant', content: 'Account A spent $420 and drove 12 leads.' },
      ],
      attachedEmail: fakeAttachedEmail,
    })

    expect(latestBuiltPayload).toMatchObject({
      message: 'Can you review the selected accounts?',
      displayMessage: 'Can you review the selected accounts?',
      sessionId: 'session-123',
      history: [
        { role: 'user', content: 'How did account A perform last week?' },
        { role: 'assistant', content: 'Account A spent $420 and drove 12 leads.' },
      ],
      model: DEFAULT_CHAT_MODEL,
      selectedAccountRefs: ['acct-1', 'acct-2'],
      attachedEmail: {
        messageId: 'gmail-msg-123',
        subject: 'Need help with spend',
        from: 'client@example.com',
        date: '2026-06-30T10:00:00.000Z',
      },
    })
  })
})
