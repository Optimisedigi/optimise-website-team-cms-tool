'use client'

/**
 * OptiMateVoice — live OpenAI Realtime voice for an OptiMate audit.
 *
 * Flow (mirrors Brah's working WebRTC renderer, plan §2.5):
 *   1. Fetch the voice session config (instructions + full OptiMate tool defs)
 *      from /api/optimate/realtime-session (server-built, prompt stays ours).
 *   2. Mint an ephemeral secret via the token provider (local Electron helper
 *      bridge on 127.0.0.1).
 *   3. Open a WebRTC peer: mic track out, remote audio in, an `oai-events`
 *      data channel. POST the SDP offer to api.openai.com/v1/realtime/calls
 *      with the ephemeral secret; set the answer.
 *   4. On a model `function_call`, POST it to /api/optimate/realtime-tool
 *      (server runs the read tool), then send function_call_output +
 *      response.create back over the data channel.
 *
 * The single-in-flight `response.create` coordinator is ported from Brah's
 * realtime-response-queue so we never trip
 * `conversation_already_has_active_response`.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { getTokenProvider } from '@/lib/realtime/token-provider'

interface OptiMateVoiceProps {
  auditId: string | number
  businessName?: string
  /** Push/stream a spoken turn into the host chat thread. Same voiceId =
   *  update that message in place (used for streaming assistant deltas). */
  onTurn?: (voiceId: string, role: 'user' | 'assistant', text: string) => void
  /** Append a non-streaming assistant message, used for tool result cards/links. */
  onAssistantMessage?: (text: string) => void
  /** Report the live call status for the host to show (e.g. "Listening…"),
   *  or null when idle. */
  onStatusChange?: (status: string | null) => void
  /** When active, the call controls (stop / mute / waveform) are portalled
   *  into this element (e.g. the empty strip under the account name) instead
   *  of rendering inline next to the Send button. */
  controlsContainer?: HTMLElement | null
  /** Diameter (px) of the idle round mic trigger. Defaults to 40. */
  triggerSize?: number
  /** Optional Gmail message id attached as reference context for this voice call. */
  attachedEmailMessageId?: string | null
}

type VoiceState = 'idle' | 'checking' | 'connecting' | 'connected' | 'error'

interface HelperStatus {
  reachable: boolean
  connected: boolean
}

// --- response.create coordinator (ported from Brah) ---------------------------

interface ResponseCoordinator {
  requestCreate: (event: RealtimeOutboundEvent) => RealtimeOutboundEvent | null
  observe: (event: { type?: string }) => RealtimeOutboundEvent | null
  noteActiveResponseConflict: () => void
  reset: () => void
}

type RealtimeOutboundEvent = Record<string, unknown> & { type: string }

function createResponseCoordinator(): ResponseCoordinator {
  let activeResponse = false
  let pendingCreate: RealtimeOutboundEvent | null = null
  let lastSentCreate: RealtimeOutboundEvent | null = null
  return {
    requestCreate(event) {
      if (activeResponse) {
        pendingCreate = event
        return null
      }
      activeResponse = true
      pendingCreate = null
      lastSentCreate = event
      return event
    },
    observe(event) {
      switch (event?.type) {
        case 'response.created':
          activeResponse = true
          return null
        case 'response.done': {
          activeResponse = false
          const flush = pendingCreate
          pendingCreate = null
          return flush
        }
        default:
          return null
      }
    },
    noteActiveResponseConflict() {
      activeResponse = true
      if (pendingCreate === null) pendingCreate = lastSentCreate
    },
    reset() {
      activeResponse = false
      pendingCreate = null
      lastSentCreate = null
    },
  }
}

function parseToolArguments(raw: unknown): Record<string, unknown> {
  if (typeof raw !== 'string' || !raw.trim()) return {}
  try {
    const parsed = JSON.parse(raw)
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

// Belt-and-braces cleanup of any tool/function notation the model occasionally
// leaks into the transcript (e.g. "((get_weekly_metric_table))" or a bare
// snake_case function token). The instructions tell it not to; this guarantees
// the displayed chat stays clean even if it slips.
const NON_ENGLISH_SCRIPT = /[\u0080-\u024f\u0370-\u03ff\u0400-\u052f\u0590-\u05ff\u0600-\u06ff\u0900-\u097f\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff\uac00-\ud7af]/

function sanitizeVoiceTranscript(text: string): string {
  return (
    text
      // (( tool_name )) or ( tool_name ) wrappers around a snake_case token
      .replace(/\(+\s*[a-z][a-z0-9]*(?:_[a-z0-9]+)+\s*\)+/gi, '')
      // bare snake_case function-style tokens (two+ segments), word-bounded
      .replace(/\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/gi, '')
      // Strip transcript chunks in other scripts/languages. Voice mode is
      // English-only for OptiMate, so music/TV snippets like 安倍晉三 or German
      // fragments should never appear in the chat thread.
      .replace(NON_ENGLISH_SCRIPT, '')
      // tidy whitespace/punctuation left behind
      .replace(/\s{2,}/g, ' ')
      .replace(/\s+([.,!?;:])/g, '$1')
      .trim()
  )
}

const VOICE_INTENT_KEYWORDS = /\b(account|ad|ads|audit|budget|campaign|cpa|cpc|ctr|conversion|conversions|draft|email|google|keyword|keywords|negative|pacing|report|search|spend|term|terms|waste|wasting)\b/i
const COMMON_BACKGROUND_FRAGMENTS = /^(aber nicht|abe shinzo)[.!?。\s]*$/i

function isLikelyIntentionalVoiceInput(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed) return false
  if (COMMON_BACKGROUND_FRAGMENTS.test(trimmed)) return false
  if (NON_ENGLISH_SCRIPT.test(trimmed)) return false

  const words = trimmed.match(/[A-Za-z0-9$£€%]+/g) ?? []
  if (words.length >= 3) return true
  if (/[?]/.test(trimmed) && words.length >= 1) return true
  return VOICE_INTENT_KEYWORDS.test(trimmed) && words.length >= 1
}

// Standard microphone glyph used across most chat UIs (rounded capsule mic on
// a stand). When muted, a diagonal slash is drawn through it.
function MicIcon({ muted = false }: { muted?: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="9" y="2" width="6" height="11" rx="3" fill="currentColor" />
      <path
        d="M5 11a7 7 0 0 0 14 0"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
      <path d="M12 18v3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      {muted && <path d="M4 3l16 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />}
    </svg>
  )
}

// --- audio level monitor (ported from Brah's renderer waveform) --------------

interface AnalyserBundle {
  analyser: AnalyserNode
  data: Uint8Array<ArrayBuffer>
  freq: Uint8Array<ArrayBuffer>
}

function createAnalyser(ctx: AudioContext, stream: MediaStream): AnalyserBundle {
  const analyser = ctx.createAnalyser()
  analyser.fftSize = 512
  analyser.smoothingTimeConstant = 0.55
  ctx.createMediaStreamSource(stream).connect(analyser)
  return {
    analyser,
    data: new Uint8Array(new ArrayBuffer(analyser.fftSize)),
    freq: new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount)),
  }
}

function readLevel({ analyser, data }: AnalyserBundle): number {
  analyser.getByteTimeDomainData(data)
  let sum = 0
  for (const v of data) {
    const centered = (v - 128) / 128
    sum += centered * centered
  }
  const rms = Math.sqrt(sum / data.length)
  return Math.min(1, Math.max(0, (rms - 0.015) * 8))
}

/**
 * ChatGPT-style connected voice orb. The glow gently breathes while connected
 * and reacts to the louder of mic or assistant audio so it feels alive without
 * taking over the compact OptiMate header.
 */
function VoiceConnectionOrb({
  micStream,
  remoteStream,
  active,
  muted,
}: {
  micStream: MediaStream | null
  remoteStream: MediaStream | null
  active: boolean
  muted: boolean
}) {
  const [level, setLevel] = useState(0)

  useEffect(() => {
    if (!active || muted || !micStream) {
      setLevel(0)
      return
    }

    const AudioCtx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new AudioCtx()
    const mic = createAnalyser(ctx, micStream)
    let remote: AnalyserBundle | null = null
    try {
      if (remoteStream) remote = createAnalyser(ctx, remoteStream)
    } catch {
      remote = null
    }

    let smoothed = 0
    let raf = 0
    const tick = () => {
      const micLevel = readLevel(mic)
      const remoteLevel = remote ? readLevel(remote) : 0
      smoothed = smoothed * 0.78 + Math.max(micLevel, remoteLevel * 1.15) * 0.22
      setLevel(smoothed)
      raf = requestAnimationFrame(tick)
    }
    tick()

    return () => {
      cancelAnimationFrame(raf)
      void ctx.close()
    }
  }, [active, micStream, muted, remoteStream])

  const scale = 1 + Math.min(0.18, level * 0.3)

  return (
    <span
      aria-hidden="true"
      style={{
        width: 28,
        height: 28,
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        opacity: muted ? 0.5 : 1,
      }}
    >
      <span
        style={{
          position: 'absolute',
          inset: 2,
          borderRadius: '50%',
          border: '2px solid #059669',
          opacity: muted ? 0.35 : 0.9,
          animation: muted ? undefined : 'optimateVoicePulse 1.5s ease-in-out infinite',
        }}
      />
      <span
        style={{
          width: 12,
          height: 12,
          borderRadius: '50%',
          background: '#047857',
          boxShadow: muted ? undefined : '0 0 12px rgba(5,150,105,0.55)',
          transform: `scale(${scale})`,
          transition: 'transform 90ms linear, opacity 160ms ease',
        }}
      />
    </span>
  )
}

// -----------------------------------------------------------------------------

export default function OptiMateVoice({
  auditId,
  businessName,
  onTurn,
  onStatusChange,
  onAssistantMessage,
  controlsContainer,
  triggerSize = 40,
  attachedEmailMessageId,
}: OptiMateVoiceProps) {
  const [state, setState] = useState<VoiceState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [helper, setHelper] = useState<HelperStatus>({ reachable: false, connected: false })
  const [muted, setMuted] = useState(false)
  // Streams driving the waveform; kept in state so the canvas re-mounts on them.
  const [micStream, setMicStream] = useState<MediaStream | null>(null)
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null)

  const pcRef = useRef<RTCPeerConnection | null>(null)
  const dcRef = useRef<RTCDataChannel | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  // Accumulated text of the streaming assistant reply (for in-place updates).
  const replyTextRef = useRef<string>('')
  // id of the assistant turn currently streaming, so deltas append to one bubble.
  const activeReplyIdRef = useRef<string | null>(null)
  const coordinatorRef = useRef<ResponseCoordinator>(createResponseCoordinator())
  const handledToolCallIds = useRef<Set<string>>(new Set())
  const pendingGmailDraftRef = useRef<{ gmailUrl: string; subject?: string; to?: string } | null>(
    null,
  )
  const gmailDraftConfirmationReplyIdRef = useRef<string | null>(null)

  const provider = getTokenProvider()

  const refreshHelperStatus = useCallback(async () => {
    const status = await provider.getStatus()
    setHelper(status)
    return status
  }, [provider])

  useEffect(() => {
    void refreshHelperStatus()
  }, [refreshHelperStatus])

  const sendEvent = useCallback((event: RealtimeOutboundEvent) => {
    const dc = dcRef.current
    if (dc && dc.readyState === 'open') {
      dc.send(JSON.stringify(event))
    }
  }, [])

  // Request a response.create through the coordinator (single in-flight).
  const requestResponse = useCallback(
    (event: RealtimeOutboundEvent) => {
      const toSend = coordinatorRef.current.requestCreate(event)
      if (toSend) sendEvent(toSend)
    },
    [sendEvent],
  )

  const executeToolCall = useCallback(
    async (callId: string, name: string, rawArgs: unknown) => {
      if (handledToolCallIds.current.has(callId)) return
      handledToolCallIds.current.add(callId)
      const args = parseToolArguments(rawArgs)

      let result: { ok: boolean; data?: unknown; error?: string }
      try {
        const res = await fetch('/api/optimate/realtime-tool', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ auditId, name, arguments: args }),
        })
        result = (await res.json()) as { ok: boolean; data?: unknown; error?: string }
      } catch (err) {
        result = { ok: false, error: err instanceof Error ? err.message : 'Tool call failed' }
      }

      const isGmailDraftTool = name === 'create_gmail_draft'
      const gmailDraftData = result.data as
        | { gmailUrl?: unknown; subject?: unknown; to?: unknown }
        | undefined

      if (isGmailDraftTool && result.ok && typeof gmailDraftData?.gmailUrl === 'string') {
        pendingGmailDraftRef.current = {
          gmailUrl: gmailDraftData.gmailUrl,
          subject:
            typeof gmailDraftData.subject === 'string' && gmailDraftData.subject
              ? gmailDraftData.subject
              : undefined,
          to: typeof gmailDraftData.to === 'string' && gmailDraftData.to ? gmailDraftData.to : undefined,
        }
      }

      const output =
        isGmailDraftTool && result.ok
          ? {
              ok: true,
              draftCreated: true,
              subject: pendingGmailDraftRef.current?.subject ?? null,
              to: pendingGmailDraftRef.current?.to ?? null,
              note: 'The Gmail draft link is available in the UI. Do not read or say the URL aloud.',
            }
          : result.ok
            ? (result.data ?? { ok: true })
            : { error: result.error }

      sendEvent({
        type: 'conversation.item.create',
        item: {
          type: 'function_call_output',
          call_id: callId,
          output: JSON.stringify(output),
        },
      })
      requestResponse(
        isGmailDraftTool
          ? {
              type: 'response.create',
              response: {
                output_modalities: ['audio'],
                instructions:
                  'Confirm the Gmail draft was saved in one short sentence. Do not say, spell, or mention the Gmail URL. Do not repeat the full email contents. The chat UI will show the subject and Open in Gmail link silently.',
              },
            }
          : { type: 'response.create' },
      )
    },
    [auditId, sendEvent, requestResponse],
  )

  const handleRealtimeEvent = useCallback(
    (event: {
      type?: string
      item?: Record<string, unknown>
      transcript?: string
      delta?: string
      error?: { code?: string; message?: string }
    }) => {
      // Flush a queued response.create when the active response ends.
      const flush = coordinatorRef.current.observe(event)
      if (flush) sendEvent(flush)

      if (event.type === 'error') {
        const code = event.error?.code ?? ''
        if (
          code === 'conversation_already_has_active_response' ||
          /already has an? active response/i.test(event.error?.message ?? '')
        ) {
          coordinatorRef.current.noteActiveResponseConflict()
        }
        return
      }

      // Final transcript of the user's speech → push a user turn into the host
      // chat thread, but only answer if it looks like a deliberate OptiMate
      // request. Background audio/music can transcribe as short foreign-language
      // fragments; those should not trigger tool calls or assistant replies.
      if (
        event.type === 'conversation.item.input_audio_transcription.completed' &&
        typeof event.transcript === 'string' &&
        event.transcript.trim()
      ) {
        const text = sanitizeVoiceTranscript(event.transcript.trim())
        if (text && isLikelyIntentionalVoiceInput(text)) {
          onTurn?.(`u_${Date.now()}`, 'user', text)
        }
      }

      // A new assistant response is starting → open a fresh streaming turn.
      if (event.type === 'response.created') {
        const replyId = `a_${Date.now()}`
        activeReplyIdRef.current = replyId
        replyTextRef.current = ''
        if (pendingGmailDraftRef.current) {
          gmailDraftConfirmationReplyIdRef.current = replyId
        }
      }
      // Stream output audio transcript deltas into that turn (update in place).
      if (
        (event.type === 'response.output_audio_transcript.delta' ||
          event.type === 'response.audio_transcript.delta') &&
        typeof event.delta === 'string'
      ) {
        const id = activeReplyIdRef.current
        if (id) {
          replyTextRef.current += event.delta
          onTurn?.(id, 'assistant', sanitizeVoiceTranscript(replyTextRef.current))
        }
      }
      if (event.type === 'response.done') {
        const id = activeReplyIdRef.current
        const draft = pendingGmailDraftRef.current
        if (id && draft && gmailDraftConfirmationReplyIdRef.current === id) {
          const extras = [
            draft.subject ? `Subject: ${draft.subject}` : '',
            draft.to ? `To: ${draft.to}` : '',
            `[Open draft in Gmail](${draft.gmailUrl})`,
          ]
            .filter(Boolean)
            .join('\n')
          const current = replyTextRef.current.trim() || 'Draft saved in Gmail.'
          onTurn?.(id, 'assistant', `${current}\n\n${extras}`)
          pendingGmailDraftRef.current = null
          gmailDraftConfirmationReplyIdRef.current = null
        }
        activeReplyIdRef.current = null
      }

      // A finalized function call to execute server-side.
      if (event.type === 'response.output_item.done' && event.item?.type === 'function_call') {
        if (event.item.status === 'incomplete') return
        const callId = event.item.call_id
        const name = event.item.name
        if (typeof callId === 'string' && typeof name === 'string') {
          void executeToolCall(callId, name, event.item.arguments)
        }
      }
    },
    [sendEvent, executeToolCall, onTurn],
  )

  const stop = useCallback(() => {
    dcRef.current?.close()
    dcRef.current = null
    pcRef.current?.close()
    pcRef.current = null
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) track.stop()
      streamRef.current = null
    }
    coordinatorRef.current.reset()
    handledToolCallIds.current.clear()
    activeReplyIdRef.current = null
    pendingGmailDraftRef.current = null
    gmailDraftConfirmationReplyIdRef.current = null
    setState('idle')
    setMicStream(null)
    setRemoteStream(null)
  }, [])

  useEffect(() => stop, [stop])

  // Report live call status to the host (shown left of History in the header).
  useEffect(() => {
    if (!onStatusChange) return
    if (state === 'checking') onStatusChange('Checking helper…')
    else if (state === 'connecting') onStatusChange('Connecting…')
    else if (state === 'connected') onStatusChange(muted ? 'Muted' : 'Listening…')
    else onStatusChange(null)
  }, [state, muted, onStatusChange])

  const start = useCallback(async () => {
    setError(null)
    setState('checking')
    try {
      const status = await refreshHelperStatus()
      if (!status.reachable) {
        throw new Error(
          'Voice helper is not running. Launch the OptiMate Voice Helper app, then try again.',
        )
      }
      if (!status.connected) {
        throw new Error('Voice helper is running but not signed in. Open it and sign in to OpenAI.')
      }

      // 1. Server-built session config (instructions + full OptiMate tools).
      const sessionUrl = new URL('/api/optimate/realtime-session', window.location.origin)
      sessionUrl.searchParams.set('auditId', String(auditId))
      if (attachedEmailMessageId) {
        sessionUrl.searchParams.set('attachedEmailMessageId', attachedEmailMessageId)
      }
      const sessionRes = await fetch(sessionUrl.toString())
      if (!sessionRes.ok) {
        const body = (await sessionRes.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error ?? `Could not build voice session (${sessionRes.status}).`)
      }
      const session = (await sessionRes.json()) as {
        instructions: string
        tools: unknown[]
      }

      setState('connecting')

      // 2. Mint the ephemeral secret right before the offer. Use a slower
      //    server-side VAD so natural pauses do not end the user's turn too soon.
      //    Realtime owns response creation for spoken turns; we only create the
      //    controlled opening greeting and post-tool follow-up responses.
      const secret = await provider.getSecret({
        auditId: String(auditId),
        session: {
          instructions: session.instructions,
          tools: session.tools,
          // Let Realtime wait longer before ending a user turn, and let it own
          // response creation. Manually creating a response as soon as the
          // transcript completed made tool turns unreliable (the model could say
          // it created a Gmail draft without the function call completing) and
          // made pauses feel like interruptions.
          turnDetection: {
            type: 'server_vad',
            threshold: 0.65,
            prefix_padding_ms: 500,
            silence_duration_ms: 1400,
            create_response: true,
            interrupt_response: false,
          },
        },
      })

      // 3. WebRTC peer.
      const pc = new RTCPeerConnection()
      pcRef.current = pc
      pc.ontrack = (e) => {
        if (audioRef.current) audioRef.current.srcObject = e.streams[0]
        setRemoteStream(e.streams[0] ?? null)
      }
      pc.onconnectionstatechange = () => {
        const cs = pc.connectionState
        if (cs === 'connected') setState('connected')
        if (cs === 'closed' || cs === 'disconnected' || cs === 'failed') stop()
      }

      const dc = pc.createDataChannel('oai-events')
      dcRef.current = dc
      dc.addEventListener('open', () => {
        // Controlled opening turn: greet briefly and then wait. Without this the
        // eager VAD would auto-generate an unsolicited overview on connect.
        const greeting = coordinatorRef.current.requestCreate({
          type: 'response.create',
          response: {
            output_modalities: ['audio'],
            instructions:
              "Greet the user in one short sentence: say you're OptiMate and ask how you can help. Do NOT give any overview, summary, or data yet. Then stop and wait for their question.",
          },
        })
        if (greeting) dc.send(JSON.stringify(greeting))
      })
      dc.addEventListener('message', (e) => {
        try {
          handleRealtimeEvent(JSON.parse(e.data))
        } catch {
          // ignore malformed event frames
        }
      })

      // Match Brah's mic constraints: browser-level echo cancellation, noise
      // suppression, and auto gain. Without these the raw mic feeds every
      // background sound to the VAD, which then fires on noise / partial sounds.
      // Echo cancellation also stops the mic hearing the assistant's own audio
      // through the speakers and treating it as a new user turn.
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })
      streamRef.current = stream
      setMicStream(stream)
      for (const track of stream.getTracks()) pc.addTrack(track, stream)

      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)

      // The model is bound to the ephemeral secret's session, so the calls
      // endpoint needs no model param (matches Brah's working client).
      const sdpRes = await fetch('https://api.openai.com/v1/realtime/calls', {
        method: 'POST',
        body: offer.sdp,
        headers: {
          Authorization: `Bearer ${secret.value}`,
          'Content-Type': 'application/sdp',
        },
      })
      if (!sdpRes.ok) {
        throw new Error(`Realtime call failed (${sdpRes.status}): ${await sdpRes.text()}`)
      }
      await pc.setRemoteDescription({ type: 'answer', sdp: await sdpRes.text() })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setState('error')
      stop()
    }
  }, [auditId, attachedEmailMessageId, provider, refreshHelperStatus, handleRealtimeEvent, stop])

  const toggleMute = useCallback(() => {
    const stream = streamRef.current
    if (!stream) return
    const next = !muted
    for (const track of stream.getAudioTracks()) track.enabled = !next
    setMuted(next)
  }, [muted])

  const active = state === 'connecting' || state === 'connected' || state === 'checking'

  // Active call controls: compact ChatGPT-style orb plus mute/end controls.
  // Rendered into the host-provided container (under the account name) when one
  // is given, otherwise inline as a fallback.
  const controls = active ? (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 8 }}>
      <style>{`
        @keyframes optimateVoicePulse {
          0%, 100% { transform: scale(0.92); opacity: 0.9; }
          50% { transform: scale(1.18); opacity: 0.35; }
        }
      `}</style>
      <VoiceConnectionOrb
        micStream={micStream}
        remoteStream={remoteStream}
        active={state === 'connected'}
        muted={muted}
      />
      {(state !== 'connected' || muted) && (
        <span style={{ fontSize: 11, color: muted ? '#9ca3af' : '#4b5563', whiteSpace: 'nowrap' }}>
          {state === 'connected' ? 'Muted' : 'Connecting…'}
        </span>
      )}
      <button
        type="button"
        onClick={toggleMute}
        disabled={state !== 'connected'}
        title={muted ? 'Unmute' : 'Mute'}
        aria-label={muted ? 'Unmute' : 'Mute'}
        style={iconButtonStyle(muted ? '#9ca3af' : '#6b7280')}
      >
        <MicIcon muted={muted} />
      </button>
      <button
        type="button"
        onClick={stop}
        title="End call"
        aria-label="End call"
        style={iconButtonStyle('#dc2626')}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          <rect x="2" y="2" width="8" height="8" rx="1.5" fill="currentColor" />
        </svg>
      </button>
    </div>
  ) : null

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        alignItems: 'flex-end',
        position: 'relative',
      }}
    >
      {/* Hidden element that plays the model's voice. */}
      {/* biome-ignore lint/a11y/useMediaCaption: realtime model audio has no caption track */}
      <audio ref={audioRef} autoPlay style={{ display: 'none' }} />

      {/* Idle: the round mic trigger lives here (next to Send). Active controls
          are portalled into the host container under the account name. */}
      {!active && (
        <button
          type="button"
          onClick={start}
          title={`Start a voice call about ${businessName ?? 'this account'}`}
          aria-label="Start voice"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: triggerSize,
            height: triggerSize,
            borderRadius: '50%',
            border: 'none',
            background: '#111827',
            color: '#fff',
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          <MicIcon />
        </button>
      )}

      {controls && (controlsContainer ? createPortal(controls, controlsContainer) : controls)}

      {error && (
        <div style={{ fontSize: 12, color: '#dc2626' }}>
          {error}
          {!helper.reachable && (
            <>
              {' '}
              <span style={{ color: '#6b7280' }}>
                (The OptiMate Voice Helper app must be open on this machine.)
              </span>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function voiceButtonStyle(bg: string): React.CSSProperties {
  return {
    padding: '5px 12px',
    borderRadius: 8,
    border: 'none',
    background: bg,
    color: '#fff',
    fontSize: 13,
    cursor: 'pointer',
  }
}

// Subtle, compact icon-only control (End / Mute) shown during a call.
function iconButtonStyle(color: string): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 26,
    height: 26,
    padding: 0,
    borderRadius: 6,
    border: '1px solid var(--theme-border-color, #e5e7eb)',
    background: 'transparent',
    color,
    fontSize: 13,
    lineHeight: 1,
    cursor: 'pointer',
  }
}
