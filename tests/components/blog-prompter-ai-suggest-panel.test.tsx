import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import BlogPrompterPage from '@/components/BlogPrompterPage'

vi.mock('@/components/VoiceField', () => ({
  default: ({ value, onChange, ariaLabel }: { value: string; onChange: (v: string) => void; ariaLabel?: string }) => (
    <textarea aria-label={ariaLabel ?? 'field'} value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}))

class FakeChannel {
  onmessage: ((event: MessageEvent<string>) => void) | null = null
  readyState = 'open'
  send = vi.fn()
  emit(value: unknown): void { this.onmessage?.({ data: JSON.stringify(value) } as MessageEvent<string>) }
}

class FakePeer {
  channel = new FakeChannel()
  connectionState = 'new'
  ontrack: ((event: RTCTrackEvent) => void) | null = null
  onconnectionstatechange: (() => void) | null = null
  close = vi.fn()
  addTrack = vi.fn()
  createDataChannel = vi.fn(() => this.channel)
  createOffer = vi.fn(async () => ({ sdp: 'offer' }))
  setLocalDescription = vi.fn(async () => {})
  setRemoteDescription = vi.fn(async () => {})
}

let peer: FakePeer
let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.stubGlobal('RTCPeerConnection', class extends FakePeer { constructor() { super(); peer = this } })
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: vi.fn(async () => ({ getTracks: () => [{ stop: vi.fn(), enabled: true }] })) } })
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.startsWith('/api/clients/list')) return { ok: true, json: async () => [] }
    if (url.startsWith('/api/blog-settings')) return { ok: true, json: async () => ({ globalBlogRules: '', globalMarkdownRules: '' }) }
    if (url.includes('realtime-secret')) return { ok: true, json: async () => ({ value: 'ek_test', body: init?.body }) }
    if (url.startsWith('/api/optimate/contentmate/chat')) {
      return { ok: true, json: async () => ({ reply: 'Here is the summary.', proposal: { blogIdea: 'Typed idea summary', titleIdea: 'Typed title' } }) }
    }
    return { ok: true, text: async () => 'answer' }
  })
  vi.stubGlobal('fetch', fetchMock)
})

async function renderPage() {
  render(<BlogPrompterPage />)
  await act(async () => { await Promise.resolve() })
}

describe('Blog Prompter AI suggest panel', () => {
  it('renders AI suggest in the Brief details header and the client hint under the Client select', async () => {
    await renderPage()
    const header = screen.getByRole('heading', { name: 'Brief details' }).parentElement as HTMLElement
    expect(within(header).getByRole('button', { name: 'AI suggest' })).toBeTruthy()
    const clientControl = (screen.getByLabelText('Client') as HTMLElement).parentElement as HTMLElement
    expect(within(clientControl).getByText('Select a client before saving')).toBeTruthy()
  })

  it('fills fields from a voice proposal only after the user confirms', async () => {
    await renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'AI suggest' }))
    fireEvent.click(screen.getByRole('button', { name: 'Start GPT Live blog idea call' }))
    await waitFor(() => expect(peer.setRemoteDescription).toHaveBeenCalled())
    const secretCall = fetchMock.mock.calls.find(([url]) => String(url).includes('realtime-secret'))
    expect(JSON.parse(String(secretCall?.[1]?.body)).mode).toBe('contentmate')

    act(() => {
      peer.channel.emit({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'u1', transcript: 'A post on page speed for plumbers' })
      peer.channel.emit({
        type: 'response.function_call_arguments.done',
        name: 'propose_blog_idea',
        call_id: 'call_1',
        arguments: JSON.stringify({ blogIdea: 'Why page speed wins plumbing leads', titleIdea: 'Page speed for plumbers', targetAudience: 'Plumbing business owners' }),
      })
    })

    expect(screen.getByRole('region', { name: 'Proposed blog idea' })).toBeTruthy()
    expect((screen.getByLabelText('Blog idea') as HTMLTextAreaElement).value).toBe('')
    expect(peer.channel.send).toHaveBeenCalledWith(expect.stringContaining('function_call_output'))

    fireEvent.click(screen.getByRole('button', { name: 'Confirm & fill brief' }))
    await waitFor(() => expect((screen.getByLabelText('Blog idea') as HTMLTextAreaElement).value).toBe('Why page speed wins plumbing leads'))
    expect((screen.getByLabelText('Title idea') as HTMLTextAreaElement).value).toBe('Page speed for plumbers')
    expect((screen.getByLabelText('Target audience') as HTMLTextAreaElement).value).toBe('Plumbing business owners')
  })

  it('typed chat proposals can be discarded without touching the brief', async () => {
    await renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'AI suggest' }))
    fireEvent.change(screen.getByLabelText('Message ContentMate'), { target: { value: 'An idea about Core Web Vitals' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await screen.findByRole('region', { name: 'Proposed blog idea' })
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }))
    expect(screen.queryByRole('region', { name: 'Proposed blog idea' })).toBeNull()
    expect((screen.getByLabelText('Blog idea') as HTMLTextAreaElement).value).toBe('')
  })
})
