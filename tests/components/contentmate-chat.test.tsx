import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import ContentMateChat from '@/components/ContentMateChat'

class FakeChannel {
  onmessage: ((event: MessageEvent<string>) => void) | null = null
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
let nextId = 100
const saves: Array<Record<string, unknown>> = []

beforeEach(() => {
  nextId = 100
  saves.length = 0
  vi.stubGlobal('RTCPeerConnection', class extends FakePeer { constructor() { super(); peer = this } })
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: vi.fn(async () => ({ getTracks: () => [{ stop: vi.fn() }] })) } })
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/optimate/contentmate/chat' && !init?.method) {
      return { ok: true, json: async () => ({ clients: [{ id: '1', name: 'Acme Plumbing' }, { id: '2', name: 'Beta Dental' }] }) }
    }
    if (url.includes('realtime-secret')) return { ok: true, json: async () => ({ value: 'ek_test' }) }
    if (url.startsWith('https://api.openai.com')) return { ok: true, text: async () => 'answer' }
    if (url === '/api/optimate/contentmate/save') {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>
      saves.push(body)
      const id = body.ideaId ?? nextId++
      return { ok: true, json: async () => ({ ok: true, saved: { id, updated: Boolean(body.ideaId) } }) }
    }
    if (url === '/api/optimate/contentmate/chat') {
      return {
        ok: true,
        json: async () => ({
          reply: 'Updated.',
          saveRequest: { action: 'update_current', draft: { blogIdea: 'Speed for plumbers', primaryKeywords: 'plumber seo', clientId: '1' } },
        }),
      }
    }
    throw new Error(`unexpected fetch ${url}`)
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

async function startCall() {
  render(<ContentMateChat />)
  await screen.findByRole('option', { name: 'Beta Dental' })
  fireEvent.click(screen.getByRole('button', { name: 'Start GPT Live blog idea call' }))
  await waitFor(() => expect(peer.setRemoteDescription).toHaveBeenCalled())
}

function voiceSave(callId: string, args: Record<string, unknown>) {
  act(() => {
    peer.channel.emit({ type: 'response.function_call_arguments.done', name: 'save_blog_idea', call_id: callId, arguments: JSON.stringify(args) })
  })
}

const fieldValue = (label: string) => (screen.getByLabelText(label) as HTMLInputElement).value

describe('ContentMate', () => {
  it('voice session carries the client list and both tools', async () => {
    await startCall()
    const secretCall = fetchMock.mock.calls.find(([url]) => String(url).includes('realtime-secret'))
    const body = JSON.parse(String(secretCall?.[1]?.body)) as { session: { instructions: string; tools: Array<{ name: string }> } }
    expect(body.session.tools.map((t) => t.name)).toEqual(['propose_blog_idea', 'save_blog_idea'])
    expect(body.session.instructions).toContain('Beta Dental')
  })

  it('a final plan fills every field and saves under the named client; changes update that idea; the next idea is new', async () => {
    await startCall()

    voiceSave('c1', { blogIdea: 'Why speed matters', mainPoint: 'Fast sites win', keyPoints: 'Core Web Vitals', clientId: '2', ideaAction: 'new_idea' })
    await waitFor(() => expect(saves).toHaveLength(1))
    expect(saves[0]).toMatchObject({ confirmed: true, draft: { blogIdea: 'Why speed matters', mainPoint: 'Fast sites win', clientId: '2', clientName: 'Beta Dental' } })
    expect(saves[0]).not.toHaveProperty('ideaId')
    await screen.findByText(/Editing the saved idea for/)
    expect(fieldValue('Main point')).toBe('Fast sites win')
    expect((screen.getByLabelText('ContentMate client') as HTMLSelectElement).value).toBe('2')
    // The result is reported back to the model.
    await waitFor(() => expect(peer.channel.send.mock.calls.some(([raw]) => String(raw).includes('Saved a new blog idea for Beta Dental'))).toBe(true))

    // A change: same idea is updated, untouched fields are kept.
    voiceSave('c2', { blogIdea: 'Why speed matters for dentists', clientId: '2', ideaAction: 'update_current' })
    await waitFor(() => expect(saves).toHaveLength(2))
    expect(saves[1]).toMatchObject({ ideaId: '100', draft: { blogIdea: 'Why speed matters for dentists', mainPoint: 'Fast sites win', keyPoints: 'Core Web Vitals' } })

    // Moving on: a new record, fields start fresh.
    voiceSave('c3', { blogIdea: 'Teeth whitening myths', clientId: '2', ideaAction: 'new_idea' })
    await waitFor(() => expect(saves).toHaveLength(3))
    expect(saves[2]).not.toHaveProperty('ideaId')
    expect(saves[2]).toMatchObject({ draft: { blogIdea: 'Teeth whitening myths', mainPoint: '' } })
    await waitFor(() => expect(fieldValue('Main point')).toBe(''))
  })

  it('asks for the client instead of saving when none was named', async () => {
    await startCall()
    voiceSave('c1', { blogIdea: 'Idea', ideaAction: 'new_idea' })
    await waitFor(() => expect(peer.channel.send.mock.calls.some(([raw]) => String(raw).includes('Not saved'))).toBe(true))
    expect(saves).toHaveLength(0)
  })

  it('typed changes go to the saved idea; Start next idea makes the next save a new one', async () => {
    await startCall()
    voiceSave('c1', { blogIdea: 'Speed', clientId: '1', ideaAction: 'new_idea' })
    await waitFor(() => expect(saves).toHaveLength(1))

    fireEvent.change(screen.getByLabelText('Message ContentMate'), { target: { value: 'Make it about plumbers' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() => expect(saves).toHaveLength(2))
    const chatCall = fetchMock.mock.calls.find(([url, init]) => url === '/api/optimate/contentmate/chat' && init?.method === 'POST')
    expect(JSON.parse(String(chatCall?.[1]?.body))).toMatchObject({ currentIdea: { id: '100', clientName: 'Acme Plumbing' } })
    expect(saves[1]).toMatchObject({ ideaId: '100', draft: { blogIdea: 'Speed for plumbers', primaryKeywords: 'plumber seo' } })

    fireEvent.click(screen.getByRole('button', { name: 'Start next idea' }))
    fireEvent.change(screen.getByLabelText('Blog idea'), { target: { value: 'Blocked drains guide' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save to Blog Prompter' }))
    await waitFor(() => expect(saves).toHaveLength(3))
    expect(saves[2]).not.toHaveProperty('ideaId')
    expect(saves[2]).toMatchObject({ draft: { blogIdea: 'Blocked drains guide', clientId: '1' } })
  })
})
