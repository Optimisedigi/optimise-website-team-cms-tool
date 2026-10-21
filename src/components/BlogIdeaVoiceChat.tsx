'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiCreditsNotice } from './ApiCreditsNotice'
import {
  BLOG_IDEA_FIELDS,
  BLOG_IDEA_VOICE_INSTRUCTIONS,
  BLOG_IDEA_VOICE_TOOLS,
  PROPOSE_BLOG_IDEA_TOOL,
  SAVE_BLOG_IDEA_TOOL,
  validateBlogIdeaDraft,
  type BlogIdeaDraft,
} from '@/lib/contentmate/blog-idea'

/**
 * Blog Prompter "AI suggest" helper: GPT Realtime voice (same
 * /api/optimate/realtime-secret stack as TaskMate/mail voice) plus a typed chat
 * fallback. The assistant can only propose a plan; `onConfirm` runs only when
 * the user presses Confirm. The ContentMate agent (ContentMateChat) reuses
 * `BlogIdeaLiveVoice` with its own session that can also save.
 */

type VoiceState = 'idle' | 'connecting' | 'connected'

interface VoiceEvent {
  type?: string
  item_id?: string
  transcript?: string
  delta?: string
  name?: string
  call_id?: string
  arguments?: string
  error?: { message?: string }
}

interface ChatMessage { role: 'user' | 'assistant'; content: string }

export interface BlogIdeaVoiceChatProps {
  /** The client already chosen in the Blog Prompter form. */
  clientName?: string
  confirmLabel?: string
  onConfirm: (draft: BlogIdeaDraft) => Promise<string | void> | string | void
  /** Extra actions rendered in the panel toolbar (e.g. "Suggest for me"). */
  extraActions?: React.ReactNode
}

export default function BlogIdeaVoiceChat({ clientName, confirmLabel = 'Confirm', onConfirm, extraActions }: BlogIdeaVoiceChatProps): React.ReactElement {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [proposal, setProposal] = useState<BlogIdeaDraft | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')

  const addTurn = useCallback((role: 'user' | 'assistant', content: string) => {
    setMessages((current) => [...current, { role, content }])
  }, [])

  const acceptProposal = useCallback((next: BlogIdeaDraft) => {
    setProposal(next)
    setStatus('')
  }, [])

  const send = async (): Promise<void> => {
    const message = draft.trim()
    if (!message || sending) return
    setDraft('')
    setError('')
    setSending(true)
    addTurn('user', message)
    try {
      const response = await fetch('/api/optimate/contentmate/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, history: messages, ...(clientName ? { clientName } : {}) }),
      })
      const json: unknown = await response.json()
      if (!response.ok || !isRecord(json)) throw new Error(isRecord(json) && typeof json.error === 'string' ? json.error : 'ContentMate could not reply')
      addTurn('assistant', typeof json.reply === 'string' && json.reply ? json.reply : 'Review the summary below.')
      if (json.proposal !== undefined) {
        const parsed = validateBlogIdeaDraft(json.proposal)
        if (parsed.ok) acceptProposal(parsed.value)
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'ContentMate could not reply')
    } finally {
      setSending(false)
    }
  }

  const confirm = async (): Promise<void> => {
    if (!proposal) return
    setConfirming(true)
    setError('')
    try {
      const result = await onConfirm(proposal)
      setStatus(typeof result === 'string' ? result : 'Done.')
      setProposal(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not apply the blog idea')
    } finally {
      setConfirming(false)
    }
  }

  return (
    <div className="blog-idea-helper" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
        <BlogIdeaLiveVoice onTurn={addTurn} onProposal={acceptProposal} />
        <span style={{ fontSize: 12, color: '#68727b' }}>Talk or type your blog idea. Nothing is filled in until you confirm.</span>
        {extraActions}
      </div>
      {messages.length > 0 && (
        <div aria-label="Blog idea conversation" style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 260, overflowY: 'auto' }}>
          {messages.map((m, index) => (
            <div key={index} style={{ ...bubbleStyle, alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', background: m.role === 'user' ? '#12232e' : '#eef3f2', color: m.role === 'user' ? '#fff' : '#12232e' }}>
              {m.content}
            </div>
          ))}
        </div>
      )}
      {proposal && (
        <section aria-label="Proposed blog idea" style={{ border: '1px solid #cfd8d6', borderRadius: 10, padding: 12, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
          <strong>Proposed blog idea</strong>
          {BLOG_IDEA_FIELDS.filter(({ key }) => proposal[key]).map(({ key, label }) => (
            <div key={key} style={{ whiteSpace: 'pre-wrap' }}><b>{label}:</b> {proposal[key]}</div>
          ))}
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={() => void confirm()} disabled={confirming} style={primaryButtonStyle}>{confirming ? 'Working…' : confirmLabel}</button>
            <button type="button" onClick={() => setProposal(null)} disabled={confirming} style={ghostButtonStyle}>Discard</button>
          </div>
        </section>
      )}
      <form onSubmit={(e) => { e.preventDefault(); void send() }} style={{ display: 'flex', gap: 8 }}>
        <input
          type="text"
          aria-label="Message ContentMate"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Or type your blog idea…"
          maxLength={6000}
          style={inputStyle}
        />
        <button type="submit" disabled={sending || !draft.trim()} style={primaryButtonStyle}>{sending ? '…' : 'Send'}</button>
      </form>
      {error && <div role="alert" style={{ fontSize: 12, color: '#b42318' }}>{error}</div>}
      {status && <div role="status" style={{ fontSize: 12, color: '#327766' }}>{status}</div>}
    </div>
  )
}

interface BlogIdeaLiveVoiceProps {
  onTurn: (role: 'user' | 'assistant', text: string) => void
  onProposal: (draft: BlogIdeaDraft) => void
  /** Session for the call (read when the call starts). Default: Blog Prompter, propose only. */
  getSession?: () => { instructions: string; tools: unknown[] }
  /**
   * ContentMate: runs a `save_blog_idea` call (raw model arguments) and returns
   * the text reported back to the model. Without it, save calls are refused.
   */
  onSaveRequest?: (args: unknown) => Promise<string>
  /** Contrast for the mic button: dark OptiMate panel or light page. */
  tone?: 'light' | 'dark'
}

/** GPT Realtime voice session: proposes on screen and, for ContentMate, saves the final plan. */
export function BlogIdeaLiveVoice({ onTurn, onProposal, getSession, onSaveRequest, tone = 'light' }: BlogIdeaLiveVoiceProps): React.ReactElement {
  const [state, setState] = useState<VoiceState>('idle')
  const [error, setError] = useState('')
  const [usingApiCredits, setUsingApiCredits] = useState(false)
  const peerRef = useRef<RTCPeerConnection | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const generationRef = useRef(0)
  const audioRef = useRef<HTMLAudioElement>(null)
  const onTurnRef = useRef(onTurn)
  const onProposalRef = useRef(onProposal)
  const onSaveRequestRef = useRef(onSaveRequest)
  const getSessionRef = useRef(getSession)
  onTurnRef.current = onTurn
  onProposalRef.current = onProposal
  onSaveRequestRef.current = onSaveRequest
  getSessionRef.current = getSession

  const stop = useCallback(() => {
    generationRef.current += 1
    peerRef.current?.close()
    peerRef.current = null
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    if (audioRef.current) audioRef.current.srcObject = null
    setUsingApiCredits(false)
    setState('idle')
  }, [])

  useEffect(() => () => {
    generationRef.current += 1
    peerRef.current?.close()
    streamRef.current?.getTracks().forEach((track) => track.stop())
  }, [])

  const start = async (): Promise<void> => {
    if (state !== 'idle') return
    const generation = ++generationRef.current
    setError('')
    setState('connecting')
    try {
      const secretResponse = await fetch('/api/optimate/realtime-secret', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'contentmate', session: getSessionRef.current?.() ?? { instructions: BLOG_IDEA_VOICE_INSTRUCTIONS, tools: BLOG_IDEA_VOICE_TOOLS } }),
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
          void audioRef.current.play().catch(() => setError('Tap the audio player to hear ContentMate.'))
        }
      }
      peer.onconnectionstatechange = () => {
        if (generation !== generationRef.current) return
        if (peer.connectionState === 'connected') setState('connected')
        if (peer.connectionState === 'failed' || peer.connectionState === 'disconnected') {
          setError('Live voice disconnected.')
          stop()
        }
      }
      const channel = peer.createDataChannel('oai-events')
      const seenUserItems = new Set<string>()
      let assistantText = ''
      channel.onmessage = (event: MessageEvent<string>) => {
        let message: VoiceEvent
        try { message = JSON.parse(event.data) as VoiceEvent } catch { return }
        if (message.type === 'error') setError(message.error?.message || 'Live voice encountered an error.')
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
        if (message.type === 'response.function_call_arguments.done' && typeof message.call_id === 'string') {
          const callId = message.call_id
          let args: unknown = null
          try { args = JSON.parse(message.arguments ?? '') } catch { args = null }
          const reply = (output: string): void => {
            if (generation !== generationRef.current) return
            channel.send(JSON.stringify({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: callId, output } }))
            channel.send(JSON.stringify({ type: 'response.create' }))
          }
          if (message.name === PROPOSE_BLOG_IDEA_TOOL) {
            const parsed = validateBlogIdeaDraft(args)
            if (parsed.ok) {
              onProposalRef.current(parsed.value)
              reply(onSaveRequestRef.current
                ? 'Shown on screen. Nothing is saved until the user says the plan is final.'
                : 'Shown to the user. Ask them to review it and press Confirm on screen. Nothing has been filled in or saved yet.')
            } else {
              reply(`Invalid proposal: ${parsed.error}`)
            }
          } else if (message.name === SAVE_BLOG_IDEA_TOOL && onSaveRequestRef.current) {
            void onSaveRequestRef.current(args).then(reply, (cause: unknown) => reply(`Not saved: ${cause instanceof Error ? cause.message : 'save failed'}`))
          } else {
            reply('Unknown tool.')
          }
        }
        if (message.type === 'response.done') {
          if (assistantText.trim()) onTurnRef.current('assistant', assistantText.trim())
          assistantText = ''
        }
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
        onClick={() => { if (state === 'idle') void start(); else stop() }}
        aria-label={state === 'idle' ? 'Start GPT Live blog idea call' : 'End GPT Live call'}
        aria-pressed={state !== 'idle'}
        style={{
          width: tone === 'dark' ? 44 : 36,
          height: tone === 'dark' ? 44 : 36,
          borderRadius: '50%',
          border: tone === 'dark' && state === 'idle' ? '1px solid #3b82f6' : 0,
          background: state !== 'idle' ? '#dc2626' : tone === 'dark' ? '#1e3a5f' : '#12232e',
          color: tone === 'dark' && state === 'idle' ? '#bfdbfe' : '#fff',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          flex: '0 0 auto',
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3zM19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8" />
        </svg>
      </button>
      {state !== 'idle' && <span role="status" style={{ fontSize: 12 }}>{state === 'connecting' ? 'Connecting…' : 'GPT Live · listening'}</span>}
      {state !== 'idle' && usingApiCredits && <ApiCreditsNotice />}
      {error && <span role="alert" style={{ fontSize: 12, color: '#b42318', maxWidth: 220 }}>{error}</span>}
      <audio ref={audioRef} autoPlay controls style={{ display: error.includes('audio player') ? 'block' : 'none', maxWidth: 160 }} aria-label="ContentMate live audio" />
    </div>
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const inputStyle: React.CSSProperties = { flex: 1, minWidth: 0, boxSizing: 'border-box', border: '1px solid #cfd8d6', borderRadius: 8, padding: '8px 10px', background: '#fff', color: '#12232e', font: 'inherit', fontSize: 14 }
const primaryButtonStyle: React.CSSProperties = { border: 0, borderRadius: 8, padding: '8px 12px', background: '#327766', color: '#fff', fontWeight: 600, cursor: 'pointer' }
const ghostButtonStyle: React.CSSProperties = { border: '1px solid #cfd8d6', borderRadius: 8, padding: '8px 12px', background: 'transparent', color: '#12232e', cursor: 'pointer' }
const bubbleStyle: React.CSSProperties = { maxWidth: '88%', borderRadius: 12, padding: '8px 11px', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: 13, lineHeight: 1.45 }
