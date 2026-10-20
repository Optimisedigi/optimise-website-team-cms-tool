import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import ComposeWindow, { UNDO_SEND_MS, type ComposeState } from '@/components/mail/ComposeWindow'

const REPLY: ComposeState = {
  mode: 'reply',
  replyTo: { messageId: 'msg1', from: 'Carli <carli@x.com>', subject: 'Hi' },
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

async function waitForBody() {
  await waitFor(() => expect(screen.getByRole('button', { name: 'Send' })).toHaveProperty('disabled', false))
}

afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('ComposeWindow undo send', () => {
  it('waits 3.1 seconds with a loading Send button before sending', async () => {
    const { onSend } = mount()
    await waitForBody()
    vi.useFakeTimers()
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    const sending = screen.getByRole('button', { name: /Sending/ })
    expect(sending.getAttribute('aria-busy')).toBe('true')
    expect(screen.getByRole('button', { name: 'Undo' })).toBeTruthy()
    await act(async () => {
      vi.advanceTimersByTime(UNDO_SEND_MS - 100)
    })
    expect(onSend).not.toHaveBeenCalled()
    await act(async () => {
      vi.advanceTimersByTime(100)
    })
    expect(UNDO_SEND_MS).toBe(3100)
    expect(onSend).toHaveBeenCalledTimes(1)
    expect(onSend.mock.calls[0]?.[1].html).toContain('Thursday works.')
  })

  it('Undo during the wait stops the email', async () => {
    const { onSend } = mount()
    await waitForBody()
    vi.useFakeTimers()
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    await act(async () => {
      vi.advanceTimersByTime(UNDO_SEND_MS * 2)
    })
    expect(onSend).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Send' })).toHaveProperty('disabled', false)
    expect(screen.getByText('Sending undone.')).toBeTruthy()
  })
})

describe('ComposeWindow layout', () => {
  it('has icon-only attach and image buttons, no prompt history, and the thread toggle in the tool row', async () => {
    mount()
    await waitForBody()
    const attach = screen.getByRole('button', { name: 'Attach files' })
    expect(attach.textContent?.trim()).toBe('📎')
    expect(screen.getByRole('button', { name: 'Insert image' }).textContent?.trim()).toBe('🖼')
    expect(screen.queryByText('Undo last')).toBeNull()
    expect(screen.queryByLabelText('AI prompts so far')).toBeNull()
    const toggle = screen.getByText('Use whole thread').closest('label')
    expect(toggle?.parentElement).toBe(attach.parentElement?.parentElement)
    // Colour and list buttons share the row with Insert table.
    const toolbar = screen.getByRole('button', { name: /Insert table/ }).parentElement
    expect(toolbar?.contains(screen.getByRole('button', { name: 'Text colour' }))).toBe(true)
    expect(toolbar?.contains(screen.getByRole('button', { name: 'Bulleted list' }))).toBe(true)
    expect(toolbar?.contains(screen.getByRole('button', { name: 'Numbered list' }))).toBe(true)
  })

  it('shows Bcc with Cc and sends it', async () => {
    const { onSend } = mount()
    await waitForBody()
    expect(screen.queryByText('Bcc')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Cc' }))
    const bcc = screen.getByText('Bcc').closest('label')?.querySelector('input')
    expect(bcc).toBeTruthy()
    fireEvent.change(bcc as HTMLInputElement, { target: { value: 'boss@od.com' } })
    vi.useFakeTimers()
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await act(async () => {
      vi.advanceTimersByTime(UNDO_SEND_MS)
    })
    expect(onSend.mock.calls[0]?.[0]).toMatchObject({ bcc: 'boss@od.com' })
  })

  it('attaches files dropped on the window, images included', async () => {
    mount()
    await waitForBody()
    const dialog = screen.getByRole('dialog', { name: 'Reply' })
    const file = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'chart.png', { type: 'image/png' })
    const dataTransfer = { files: [file], types: ['Files'], dropEffect: 'none' }
    fireEvent.dragEnter(dialog, { dataTransfer })
    expect(screen.getByText('Drop files to attach')).toBeTruthy()
    fireEvent.drop(dialog, { dataTransfer })
    expect(await screen.findByText('chart.png')).toBeTruthy()
    expect(screen.queryByText('Drop files to attach')).toBeNull()
  })
})

describe('ComposeWindow AI subject', () => {
  it('fills an empty subject from the first AI draft of a new email', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ text: 'Hi Jo,\n\nFancy a call?', subject: 'Call next week?' }), { status: 200 }),
    )
    mount({ mode: 'new', replyTo: null, to: 'jo@x.com', cc: '', subject: '', html: '', attachments: [] })
    fireEvent.change(screen.getByLabelText('Instruction for the AI'), { target: { value: 'invite Jo to a call' } })
    fireEvent.click(screen.getByRole('button', { name: 'Write with AI' }))
    await waitFor(() => expect(screen.getByLabelText('Subject')).toHaveProperty('value', 'Call next week?'))
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))
    expect(body).toMatchObject({ action: 'draft', suggestSubject: true })
  })
})
