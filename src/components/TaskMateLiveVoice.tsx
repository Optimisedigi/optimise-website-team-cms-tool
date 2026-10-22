'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiCreditsNotice } from './ApiCreditsNotice'

type VoiceEvent = {
  type?: string
  item_id?: string
  transcript?: string
  delta?: string
  error?: { message?: string; event_id?: string }
}

type VoiceState = 'idle' | 'connecting' | 'connected' | 'finishing'
/** What the call is doing while connected, shown next to the mic so silence never looks like nothing is happening. */
type VoiceActivity = 'listening' | 'hearing' | 'thinking' | 'speaking'

const ACTIVITY_LABEL: Record<VoiceActivity, string> = {
  listening: 'GPT Live · listening',
  hearing: 'GPT Live · hearing you…',
  thinking: 'GPT Live · thinking…',
  speaking: 'GPT Live · speaking',
}

/** Opening turn, as the other OptiMate voice agents do, so the call clearly starts. */
export const TASKMATE_VOICE_GREETING =
  "Greet the admin in one short sentence: say you're TaskMate and ask which week and which client work they want to plan. Do not plan anything yet. Then stop and wait for them to speak."

interface TaskMateLiveVoiceProps {
  disabled?: boolean
  onTurn: (role: 'user' | 'assistant', text: string) => void
  onActiveChange: (active: boolean) => void
}

export default function TaskMateLiveVoice({ disabled = false, onTurn, onActiveChange }: TaskMateLiveVoiceProps): React.ReactElement {
  const [state, setState] = useState<VoiceState>('idle')
  const [activity, setActivity] = useState<VoiceActivity>('listening')
  const [error, setError] = useState('')
  const [usingApiCredits, setUsingApiCredits] = useState(false)
  const peerRef = useRef<RTCPeerConnection | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const generationRef = useRef(0)
  const finishRef = useRef<(() => void) | null>(null)
  const audioRef = useRef<HTMLAudioElement>(null)
  const onTurnRef = useRef(onTurn)
  const onActiveChangeRef = useRef(onActiveChange)
  onTurnRef.current = onTurn
  onActiveChangeRef.current = onActiveChange

  const stop = useCallback(() => {
    generationRef.current += 1
    finishRef.current = null
    peerRef.current?.close()
    peerRef.current = null
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    if (audioRef.current) audioRef.current.srcObject = null
    setUsingApiCredits(false)
    setState('idle')
    setActivity('listening')
    onActiveChangeRef.current(false)
  }, [])

  useEffect(() => () => {
    generationRef.current += 1
    peerRef.current?.close()
    streamRef.current?.getTracks().forEach((track) => track.stop())
  }, [])

  const start = async (): Promise<void> => {
    if (state !== 'idle' || disabled) return
    const generation = ++generationRef.current
    setError('')
    setState('connecting')
    onActiveChangeRef.current(true)
    try {
      const secretResponse = await fetch('/api/optimate/realtime-secret', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'taskmate' }),
      })
      const secret: unknown = await secretResponse.json()
      if (generation !== generationRef.current) return
      if (!secretResponse.ok || !isRecord(secret) || typeof secret.value !== 'string') {
        throw new Error(isRecord(secret) && typeof secret.error === 'string' ? secret.error : 'Could not start live voice.')
      }
      setUsingApiCredits(secret.billing === 'api-key')

      const peer = new RTCPeerConnection()
      peerRef.current = peer
      peer.ontrack = (event) => {
        if (audioRef.current) {
          audioRef.current.srcObject = event.streams[0] ?? null
          void audioRef.current.play().catch(() => setError('Tap the audio player to hear TaskMate.'))
        }
      }
      peer.onconnectionstatechange = () => {
        if (generation !== generationRef.current) return
        if (peer.connectionState === 'connected') setState('connected')
        if (peer.connectionState === 'failed' || peer.connectionState === 'disconnected') {
          setError('Live voice disconnected. Check that your last spoken task appears before generating.')
          stop()
        }
      }
      const channel = peer.createDataChannel('oai-events')
      const seenUserItems = new Set<string>()
      const pendingItems = new Set<string>()
      let finishRequested = false
      let endCommitPending = false
      let assistantText = ''
      // TaskMate's voice is playing (between output_audio_buffer.started and stopped/cleared).
      let speaking = false
      channel.onopen = () => {
        if (generation !== generationRef.current) return
        channel.send(JSON.stringify({ type: 'response.create', response: { output_modalities: ['audio'], instructions: TASKMATE_VOICE_GREETING } }))
      }
      const finishIfReady = () => {
        if (generation === generationRef.current && finishRequested && !endCommitPending && pendingItems.size === 0) stop()
      }
      finishRef.current = () => {
        if (channel.readyState !== 'open') { stop(); return }
        finishRequested = true
        setState('finishing')
        streamRef.current?.getTracks().forEach((track) => { track.enabled = false })
        endCommitPending = true
        channel.send(JSON.stringify({ type: 'input_audio_buffer.commit', event_id: `taskmate-end-${generation}` }))
      }
      channel.onmessage = (event: MessageEvent<string>) => {
        let message: VoiceEvent
        try { message = JSON.parse(event.data) as VoiceEvent } catch { return }
        if (generation === generationRef.current) {
          if (message.type === 'input_audio_buffer.speech_started') setActivity('hearing')
          else if (message.type === 'input_audio_buffer.speech_stopped') setActivity('thinking')
          else if (message.type === 'output_audio_buffer.started') {
            speaking = true
            setActivity('speaking')
          } else if (message.type === 'output_audio_buffer.stopped' || message.type === 'output_audio_buffer.cleared') {
            speaking = false
            setActivity('listening')
          } else if (message.type === 'response.done' && !speaking) setActivity('listening')
        }
        if (message.type === 'error') {
          if (message.error?.event_id === `taskmate-end-${generation}`) {
            // An empty tail has nothing to commit; earlier committed turns may still be transcribing.
            endCommitPending = false
          } else {
            setError(message.error?.message || 'Live voice encountered an error.')
          }
        }
        if (message.type === 'input_audio_buffer.committed' && message.item_id) {
          pendingItems.add(message.item_id)
          if (finishRequested && endCommitPending) endCommitPending = false
        }
        if ((message.type === 'conversation.item.input_audio_transcription.completed' || message.type === 'conversation.item.input_audio_transcription.failed') && message.item_id) {
          pendingItems.delete(message.item_id)
        }
        if (message.type === 'conversation.item.input_audio_transcription.failed') {
          setError('A spoken turn could not be transcribed. Check the conversation before generating tasks.')
        }
        if (message.type === 'conversation.item.input_audio_transcription.completed' && typeof message.transcript === 'string') {
          const text = message.transcript.trim()
          if (text && (!message.item_id || !seenUserItems.has(message.item_id))) {
            if (message.item_id) seenUserItems.add(message.item_id)
            onTurnRef.current('user', text)
          }
        }
        if ((message.type === 'response.output_audio_transcript.delta' || message.type === 'response.audio_transcript.delta') && typeof message.delta === 'string') {
          assistantText += message.delta
        }
        if (message.type === 'response.done') {
          if (assistantText.trim()) onTurnRef.current('assistant', assistantText.trim())
          assistantText = ''
        }
        finishIfReady()
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
      if (generation !== generationRef.current) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }
      streamRef.current = stream
      for (const track of stream.getTracks()) peer.addTrack(track, stream)
      const offer = await peer.createOffer()
      await peer.setLocalDescription(offer)
      if (generation !== generationRef.current) return
      const answer = await fetch('https://api.openai.com/v1/realtime/calls', {
        method: 'POST',
        headers: { Authorization: `Bearer ${secret.value}`, 'Content-Type': 'application/sdp' },
        body: offer.sdp,
      })
      if (!answer.ok) throw new Error(`Live voice connection failed (${answer.status}).`)
      const sdp = await answer.text()
      if (generation !== generationRef.current) return
      await peer.setRemoteDescription({ type: 'answer', sdp })
    } catch (cause) {
      if (generation !== generationRef.current) return
      setError(cause instanceof Error ? cause.message : 'Could not start live voice.')
      stop()
    }
  }

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <button
        type="button"
        onClick={() => {
          if (state === 'idle') void start()
          else if (state === 'finishing') {
            setError('The last spoken task may not have been captured. Check the conversation before generating.')
            stop()
          } else finishRef.current?.()
        }}
        disabled={disabled && state === 'idle'}
        aria-label={state === 'idle' ? 'Start GPT Live with TaskMate' : state === 'finishing' ? 'Stop waiting for final transcript' : 'End GPT Live call'}
        title={state === 'idle' ? 'Talk with TaskMate using GPT Live' : state === 'finishing' ? 'Stop waiting (last task may be lost)' : 'End live call'}
        aria-pressed={state !== 'idle'}
        aria-describedby="taskmate-live-notice"
        data-optimate-tool=""
        style={{ width: 36, height: 36, borderRadius: '50%', border: 0, background: state === 'idle' ? '#111827' : '#dc2626', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3zM19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8" />
        </svg>
      </button>
      {state !== 'idle' && <span role="status" style={{ fontSize: 12 }}>{state === 'connecting' ? 'Connecting…' : state === 'finishing' ? 'Finishing transcript…' : ACTIVITY_LABEL[activity]}</span>}
      {state !== 'idle' && usingApiCredits && <ApiCreditsNotice />}
      {error && <span role="alert" style={{ fontSize: 12, color: '#b91c1c', maxWidth: 180 }}>{error}</span>}
      <audio ref={audioRef} autoPlay controls style={{ display: error.includes('audio player') ? 'block' : 'none', maxWidth: 160 }} aria-label="TaskMate live audio" />
    </div>
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
