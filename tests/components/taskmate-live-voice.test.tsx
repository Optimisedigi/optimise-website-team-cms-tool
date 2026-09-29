import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import TaskMateLiveVoice from '@/components/TaskMateLiveVoice'

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

const tracks = [{ stop: vi.fn(), enabled: true }]
let peer: FakePeer

beforeEach(() => {
  peer = new FakePeer()
  tracks[0].stop.mockClear()
  tracks[0].enabled = true
  vi.stubGlobal('RTCPeerConnection', class extends FakePeer {
    constructor() { super(); peer = this }
  })
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: vi.fn(async () => ({ getTracks: () => tracks })) } })
})

describe('TaskMateLiveVoice', () => {
  it('captures both sides of a live call and releases the microphone on end', async () => {
    const fetchMock = vi.fn(async (url: string) => url.includes('realtime-secret')
      ? { ok: true, json: async () => ({ value: 'ek_test' }) }
      : { ok: true, text: async () => 'answer' })
    vi.stubGlobal('fetch', fetchMock)
    const onTurn = vi.fn()
    const onActiveChange = vi.fn()
    render(<TaskMateLiveVoice onTurn={onTurn} onActiveChange={onActiveChange} />)

    fireEvent.click(screen.getByRole('button', { name: 'Start GPT Live with TaskMate' }))
    await waitFor(() => expect(peer.setRemoteDescription).toHaveBeenCalledWith({ type: 'answer', sdp: 'answer' }))
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ mode: 'taskmate' })
    peer.channel.emit({ type: 'input_audio_buffer.committed', item_id: 'one' })
    peer.channel.emit({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'one', transcript: 'Schedule an SEO audit.' })
    peer.channel.emit({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'one', transcript: 'Schedule an SEO audit.' })
    peer.channel.emit({ type: 'response.output_audio_transcript.delta', delta: 'Which ' })
    peer.channel.emit({ type: 'response.output_audio_transcript.delta', delta: 'client?' })
    peer.channel.emit({ type: 'response.done' })
    expect(onTurn.mock.calls).toEqual([['user', 'Schedule an SEO audit.'], ['assistant', 'Which client?']])

    fireEvent.click(screen.getByRole('button', { name: 'End GPT Live call' }))
    expect(peer.close).not.toHaveBeenCalled()
    expect(onActiveChange).toHaveBeenLastCalledWith(true)
    expect(tracks[0].enabled).toBe(false)
    expect(JSON.parse(peer.channel.send.mock.calls[0][0])).toMatchObject({ type: 'input_audio_buffer.commit' })
    act(() => { peer.channel.emit({ type: 'input_audio_buffer.committed', item_id: 'last' }) })
    expect(peer.close).not.toHaveBeenCalled()
    act(() => { peer.channel.emit({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'last', transcript: 'And a PPC check.' }) })
    expect(onTurn).toHaveBeenLastCalledWith('user', 'And a PPC check.')
    expect(peer.close).toHaveBeenCalledOnce()
    expect(tracks[0].stop).toHaveBeenCalledOnce()
    expect(onActiveChange).toHaveBeenLastCalledWith(false)
  })

  it('waits for an earlier pending transcript when the final audio buffer is empty', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => url.includes('realtime-secret')
      ? { ok: true, json: async () => ({ value: 'ek_test' }) }
      : { ok: true, text: async () => 'answer' }))
    const onTurn = vi.fn()
    const onActiveChange = vi.fn()
    render(<TaskMateLiveVoice onTurn={onTurn} onActiveChange={onActiveChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Start GPT Live with TaskMate' }))
    await waitFor(() => expect(peer.setRemoteDescription).toHaveBeenCalled())
    act(() => { peer.channel.emit({ type: 'input_audio_buffer.committed', item_id: 'pending' }) })
    fireEvent.click(screen.getByRole('button', { name: 'End GPT Live call' }))
    act(() => { peer.channel.emit({ type: 'error', error: { event_id: 'taskmate-end-1', message: 'Buffer too small' } }) })
    expect(peer.close).not.toHaveBeenCalled()
    act(() => { peer.channel.emit({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'pending', transcript: 'One last task.' }) })
    expect(onTurn).toHaveBeenCalledWith('user', 'One last task.')
    expect(peer.close).toHaveBeenCalledOnce()
    expect(onActiveChange).toHaveBeenLastCalledWith(false)
  })
})
