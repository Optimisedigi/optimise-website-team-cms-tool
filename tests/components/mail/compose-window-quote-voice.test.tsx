import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { LocalVoiceSession } from '@/components/OptiMateVoice'

// Capture what the compose window hands the voice agent (no WebRTC in tests).
const voice: { session: LocalVoiceSession | null; mode: string | undefined } = { session: null, mode: undefined }
vi.mock('@/components/OptiMateVoice', () => ({
  default: (props: { localSession?: LocalVoiceSession; mode?: string }) => {
    voice.session = props.localSession ?? null
    voice.mode = props.mode
    return <button type="button" aria-label="Start voice" />
  },
}))

const { default: ComposeWindow, UNDO_SEND_MS } = await import('@/components/mail/ComposeWindow')
type ComposeState = import('@/components/mail/ComposeWindow').ComposeState

const REPLY: ComposeState = {
  mode: 'reply',
  replyTo: {
    messageId: 'msg1',
    from: 'Carli <carli@x.com>',
    subject: 'Hi',
    client: { id: 4, name: 'Carli Co' },
    quote: { from: 'Carli <carli@x.com>', date: 'Mon, 20 Oct 2026 09:00:00 +1100', html: '', text: 'Can you do Thursday?' },
  },
  to: 'carli@x.com',
  cc: '',
  subject: 'Re: Hi',
  html: '<p>Thursday works.</p>',
  attachments: [],
}

function mount(initial: ComposeState = REPLY) {
  const onSend = vi.fn().mockResolvedValue(undefined)
  const onSaveDraft = vi.fn().mockResolvedValue('draft1')
  render(
    <ComposeWindow
      initial={initial}
      title="Reply"
      onClose={vi.fn()}
      onSend={onSend}
      onSchedule={vi.fn()}
      onSaveDraft={onSaveDraft}
      onDeleteDraft={vi.fn()}
      signatureHtml=""
    />,
  )
  return { onSend, onSaveDraft }
}

async function send() {
  await waitFor(() => expect(screen.getByRole('button', { name: 'Send' })).toHaveProperty('disabled', false))
  vi.useFakeTimers()
  fireEvent.click(screen.getByRole('button', { name: 'Send' }))
  await act(async () => {
    vi.advanceTimersByTime(UNDO_SEND_MS)
  })
  vi.useRealTimers()
}

afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.useRealTimers()
  vi.restoreAllMocks()
  voice.session = null
})

describe('ComposeWindow "Remind me if no reply"', () => {
  it('is Off by default, even when replying to a client', async () => {
    const { onSend } = mount()
    expect((screen.getByLabelText('Remind me if no reply') as HTMLSelectElement).value).toBe('0')
    await send()
    expect(onSend.mock.calls[0]?.[0]).toMatchObject({ followUpDays: 0 })
  })
})

describe('ComposeWindow quoted email ("•••")', () => {
  it('shows the email being replied to under the reply, editable, and sends it with the notes', async () => {
    const { onSend } = mount()
    expect(screen.queryByLabelText(/Email you are replying to/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Show the email you are replying to' }))
    const quote = await screen.findByLabelText('Email you are replying to (add your notes here)')
    await waitFor(() => expect(quote.textContent).toContain('Can you do Thursday?'))
    expect(screen.getByText(/Carli <carli@x\.com> wrote:/)).toBeTruthy()
    await send()
    const content = onSend.mock.calls[0]?.[1] as { html: string }
    expect(content.html).toContain('Thursday works.')
    expect(content.html).toMatch(/wrote:<\/div><blockquote style="[^"]*border-left[^"]*">/)
    expect(content.html).toContain('Can you do Thursday?')
    // The reply comes first, the quote after it.
    expect(content.html.indexOf('Thursday works.')).toBeLessThan(content.html.indexOf('Can you do Thursday?'))
  })

  it('leaves the quote out again when it is hidden', async () => {
    const { onSend } = mount()
    fireEvent.click(screen.getByRole('button', { name: 'Show the email you are replying to' }))
    await screen.findByLabelText('Email you are replying to (add your notes here)')
    fireEvent.click(screen.getByRole('button', { name: 'Hide the email you are replying to' }))
    await send()
    expect((onSend.mock.calls[0]?.[1] as { html: string }).html).not.toContain('Can you do Thursday?')
  })

  it('has no "•••" when there is no email to quote (new email)', () => {
    mount({ mode: 'new', replyTo: null, to: '', cc: '', subject: '', html: '', attachments: [] })
    expect(screen.queryByRole('button', { name: 'Show the email you are replying to' })).toBeNull()
  })
})

describe('ComposeWindow voice drafting', () => {
  it('offers the agent only draft and read tools, drafts straight into the editor, and never sends', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ text: 'Hi Carli,\n\nThursday at 2pm is perfect.' }), { status: 200 }),
    )
    const { onSend } = mount({ ...REPLY, html: '', account: 'sales@od.com' })
    expect(voice.mode).toBe('mail')
    const session = voice.session
    expect(session?.tools.map((tool) => tool.name)).toEqual(['write_email_draft', 'read_current_draft'])

    let result: Awaited<ReturnType<LocalVoiceSession['executeTool']>> | undefined
    await act(async () => {
      result = await session?.executeTool('write_email_draft', { instruction: 'Say Thursday 2pm is perfect' })
    })
    expect(result).toMatchObject({ ok: true, data: { drafted: true, draft: 'Hi Carli,\n\nThursday at 2pm is perfect.' } })
    const [url, init] = fetchMock.mock.calls[0] ?? []
    expect(url).toBe('/api/mail/ai')
    expect(JSON.parse(String(init?.body))).toMatchObject({ action: 'reply', gmailMessageId: 'msg1', instruction: 'Say Thursday 2pm is perfect' })
    // The request is for the account this email is written in.
    expect((init?.headers as Record<string, string>)['x-mail-account']).toBe('sales@od.com')
    await waitFor(() => expect(screen.getByLabelText('Email body').textContent).toContain('Thursday at 2pm is perfect.'))

    // Read back what is in the editor now.
    const read = await session?.executeTool('read_current_draft', {})
    expect(read).toMatchObject({ ok: true, data: { to: 'carli@x.com', subject: 'Re: Hi', hasDraft: true } })
    expect(String((read?.data as { body: string }).body)).toContain('Thursday at 2pm is perfect.')

    // Anything else is refused, and nothing was sent.
    expect(await session?.executeTool('send_email', {})).toMatchObject({ ok: false })
    expect(onSend).not.toHaveBeenCalled()
    expect(fetchMock.mock.calls.every(([target]) => target === '/api/mail/ai')).toBe(true)
  })
})

// Lexical scrolls the caret into view after an edit; jsdom has no layout for ranges.
if (typeof Range.prototype.getBoundingClientRect !== 'function') {
  Object.defineProperty(Range.prototype, 'getBoundingClientRect', { configurable: true, value: () => new DOMRect(0, 0, 0, 0) })
}

describe('ComposeWindow Revise and Undo', () => {
  it('changes only the part the request touches, and Undo puts the email back, one AI change at a time', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            text: 'Hi Carli,\n\nThursday works at 2pm.\n\nSee you then.',
            edits: [{ op: 'replace', block: 2, text: 'Thursday works at 2pm.' }],
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            text: 'Hi Carli,\n\nThursday works at 2pm.\n\nSee you then.\n\nBring the report.',
            edits: [{ op: 'insert_after', block: 3, text: 'Bring the report.' }],
          }),
          { status: 200 },
        ),
      )
    mount({ ...REPLY, html: '<p>Hi Carli,</p><p><br></p><p>Thursday <b>works</b>.</p><p><br></p><p><b>See you then.</b></p>' })
    const body = screen.getByLabelText('Email body')
    await waitFor(() => expect(body.textContent).toContain('See you then.'))
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull()

    const revise = async (instruction: string) => {
      fireEvent.change(screen.getByLabelText('Instruction for the AI'), { target: { value: instruction } })
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Revise' }))
      })
      await waitFor(() => expect(screen.getByRole('button', { name: 'Revise' })).toHaveProperty('disabled', false))
    }

    await revise('say 2pm')
    // The model got the draft as blocks; only block 2 changed, and the bold sign-off line is untouched.
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({
      instruction: 'say 2pm',
      currentBlocks: ['Hi Carli,', 'Thursday works.', 'See you then.'],
    })
    await waitFor(() => expect(body.textContent).toContain('Thursday works at 2pm.'))
    expect(body.querySelector('strong')?.textContent).toBe('See you then.')

    await revise('ask for the report')
    await waitFor(() => expect(body.textContent).toContain('Bring the report.'))
    // The next revision builds on the earlier request.
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body)).history).toEqual([
      { instruction: 'say 2pm', draft: 'Hi Carli,\n\nThursday works at 2pm.\n\nSee you then.' },
    ])

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(body.textContent).not.toContain('Bring the report.'))
    expect(body.textContent).toContain('Thursday works at 2pm.')

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(body.textContent).toContain('Thursday works.'))
    expect(body.textContent).not.toContain('2pm')
    // Back to the original bold word, and nothing left to undo.
    expect(Array.from(body.querySelectorAll('strong')).map((node) => node.textContent)).toEqual(['works', 'See you then.'])
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull()
  })

  it('leaves the email alone and says so when the AI finds nothing to change', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ text: 'Thursday works.', edits: [] }), { status: 200 }))
    mount()
    await waitFor(() => expect(screen.getByLabelText('Email body').textContent).toContain('Thursday works.'))
    fireEvent.change(screen.getByLabelText('Instruction for the AI'), { target: { value: 'fix typos' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Revise' }))
    })
    await waitFor(() => expect(screen.getByText(/found nothing to change/)).toBeTruthy())
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull()
  })
})

describe('ComposeWindow Revise with no instruction', () => {
  it('tidies the layout without the AI, sends the column widths, and Undo puts it back', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
    const { onSend } = mount({
      ...REPLY,
      html: '<p>Hi Carli,</p><p>Numbers below.</p><p><b>Overview</b></p><table><tr><th>Metric</th><th>Total</th></tr><tr><td>Impressions</td><td>170,763</td></tr></table><p>Thanks for the chat.</p>',
    })
    const body = screen.getByLabelText('Email body')
    await waitFor(() => expect(body.textContent).toContain('Impressions'))
    const lines = () => Array.from(body.children).map((node) => (node.tagName === 'TABLE' ? '[table]' : node.textContent))
    expect(lines()).toEqual(['Hi Carli,', 'Numbers below.', 'Overview', '[table]', 'Thanks for the chat.'])

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Revise' }))
    })
    expect(lines()).toEqual(['Hi Carli,', '', 'Numbers below.', '', 'Overview', '[table]', '', 'Thanks for the chat.'])
    // No AI call for a tidy.
    expect(fetchMock.mock.calls.some(([url]) => url === '/api/mail/ai')).toBe(false)

    // Pressing again finds nothing more to do.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Revise' }))
    })
    expect(screen.getByText(/already tidy/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(lines()).toEqual(['Hi Carli,', 'Numbers below.', 'Overview', '[table]', 'Thanks for the chat.']))
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull()

    // Tidy again and send: every cell goes out with its column's width, not Lexical's fixed 75px.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Revise' }))
    })
    await send()
    const content = onSend.mock.calls[0]?.[1] as { html: string } | undefined
    // What the server sends to Gmail after cleaning the editor's HTML.
    const { parseMailComposeContent } = await import('@/lib/mail/compose-content')
    const sent = parseMailComposeContent({ html: content?.html ?? '' })
    const html = sent.ok ? sent.value.html : ''
    expect(html).toMatch(/<td style="[^"]*width: 101px[^"]*"><p><span[^>]*>Impressions/)
    expect(html).toMatch(/<td style="[^"]*width: 66px[^"]*"><p><span[^>]*>170,763/)
    expect(html).not.toContain('width: 75px')
  })
})
