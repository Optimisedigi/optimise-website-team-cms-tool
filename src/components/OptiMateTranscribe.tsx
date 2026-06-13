'use client'

/**
 * OptiMateTranscribe — mobile speech-to-text for the OptiMate chat input.
 *
 * Unlike `OptiMateVoice` (a full OpenAI Realtime WebRTC voice *call* that needs
 * the local helper app), this is a lightweight dictation button. It uses the
 * browser's built-in `SpeechRecognition` API — on iOS/macOS Safari that is
 * Apple's on-device voice transcription (`webkitSpeechRecognition`) — to turn
 * speech into text and feed it into the chat textbox. No helper, no network
 * session, so it works on phones where the Realtime call button is hidden.
 *
 * Tap to start, tap again to stop. While listening the button pulses red.
 * Final transcripts are appended to the current input via `onTranscript`.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

interface OptiMateTranscribeProps {
  /** Append finalised transcript text to the host chat input. */
  onTranscript: (text: string) => void
  /** Diameter (px) of the round trigger. Defaults to 29 to match Send. */
  triggerSize?: number
  /** Disable while the chat is sending. */
  disabled?: boolean
}

// Minimal typings for the Web Speech API, which lacks lib.dom types.
interface SpeechRecognitionResultLike {
  readonly isFinal: boolean
  readonly length: number
  item(index: number): { transcript: string }
  [index: number]: { transcript: string }
}

interface SpeechRecognitionEventLike {
  readonly resultIndex: number
  readonly results: {
    readonly length: number
    item(index: number): SpeechRecognitionResultLike
    [index: number]: SpeechRecognitionResultLike
  }
}

interface SpeechRecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  start(): void
  stop(): void
  abort(): void
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onerror: ((event: { error: string }) => void) | null
  onend: (() => void) | null
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike

function getRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor
    webkitSpeechRecognition?: SpeechRecognitionCtor
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

/** True when the current browser exposes the Web Speech API. */
export function isTranscribeSupported(): boolean {
  return getRecognitionCtor() !== null
}

export default function OptiMateTranscribe({
  onTranscript,
  triggerSize = 29,
  disabled = false,
}: OptiMateTranscribeProps): React.ReactElement | null {
  const [listening, setListening] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const onTranscriptRef = useRef(onTranscript)
  onTranscriptRef.current = onTranscript

  // Tear down any live recognition on unmount.
  useEffect(() => {
    return () => {
      recognitionRef.current?.abort()
      recognitionRef.current = null
    }
  }, [])

  const stop = useCallback(() => {
    recognitionRef.current?.stop()
  }, [])

  const start = useCallback(() => {
    const Ctor = getRecognitionCtor()
    if (!Ctor) {
      setError('Voice transcription is not supported in this browser.')
      return
    }
    setError(null)
    const recognition = new Ctor()
    recognition.lang = typeof navigator !== 'undefined' ? navigator.language || 'en-US' : 'en-US'
    // Keep the session open across pauses; surface interim words for feedback
    // but only commit final results to the input.
    recognition.continuous = true
    recognition.interimResults = true

    recognition.onresult = (event) => {
      let finalText = ''
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i]
        if (result?.isFinal) {
          finalText += result[0]?.transcript ?? ''
        }
      }
      const trimmed = finalText.trim()
      if (trimmed) onTranscriptRef.current(trimmed)
    }

    recognition.onerror = (event) => {
      // `no-speech`/`aborted` are benign stop signals, not real errors.
      if (event.error !== 'no-speech' && event.error !== 'aborted') {
        setError(
          event.error === 'not-allowed'
            ? 'Microphone access was blocked.'
            : 'Could not transcribe audio.',
        )
      }
      setListening(false)
    }

    recognition.onend = () => {
      setListening(false)
      recognitionRef.current = null
    }

    recognitionRef.current = recognition
    try {
      recognition.start()
      setListening(true)
    } catch {
      setError('Could not start voice transcription.')
      setListening(false)
    }
  }, [])

  if (!isTranscribeSupported()) return null

  return (
    <div style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          if (listening) stop()
          else start()
        }}
        disabled={disabled}
        title={listening ? 'Stop dictation' : 'Dictate with voice'}
        aria-label={listening ? 'Stop dictation' : 'Dictate with voice'}
        aria-pressed={listening}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: triggerSize,
          height: triggerSize,
          borderRadius: '50%',
          border: 'none',
          background: listening ? '#dc2626' : '#111827',
          color: '#fff',
          cursor: disabled ? 'not-allowed' : 'pointer',
          flexShrink: 0,
          animation: listening ? 'optimate-transcribe-pulse 1.2s ease-in-out infinite' : undefined,
        }}
      >
        <MicIcon />
        <style>{`
          @keyframes optimate-transcribe-pulse {
            0%, 100% { box-shadow: 0 0 0 0 rgba(220, 38, 38, 0.45); }
            50% { box-shadow: 0 0 0 6px rgba(220, 38, 38, 0); }
          }
        `}</style>
      </button>
      {error && (
        <div
          role="alert"
          style={{
            position: 'absolute',
            bottom: 'calc(100% + 6px)',
            right: 0,
            width: 200,
            fontSize: 11,
            color: '#dc2626',
            background: 'var(--theme-input-bg, #fff)',
            border: '1px solid #fecaca',
            borderRadius: 6,
            padding: '6px 8px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
          }}
        >
          {error}
        </div>
      )}
    </div>
  )
}

function MicIcon(): React.ReactElement {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  )
}
