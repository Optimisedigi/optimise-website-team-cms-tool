'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import './VoiceField.css'

// Web Speech API type declarations
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList
  resultIndex: number
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string
}

interface SpeechRecognitionResultList {
  length: number
  item(index: number): SpeechRecognitionResult
  [index: number]: SpeechRecognitionResult
}

interface SpeechRecognitionResult {
  isFinal: boolean
  length: number
  item(index: number): SpeechRecognitionAlternative
  [index: number]: SpeechRecognitionAlternative
}

interface SpeechRecognitionAlternative {
  transcript: string
  confidence: number
}

interface VoiceFieldProps {
  label?: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  multiline?: boolean
  disabled?: boolean
  className?: string
  onRecordingComplete?: () => void
  /**
   * When true, renders a textarea that grows to fit its content (no inner
   * scrollbar) instead of a fixed single line. Implies multiline behaviour.
   */
  autoGrow?: boolean
}

type RecordingState = 'idle' | 'recording'

export default function VoiceField({
  label,
  value,
  onChange,
  placeholder,
  multiline = false,
  disabled = false,
  className = '',
  onRecordingComplete,
  autoGrow = false,
}: VoiceFieldProps) {
  const autoGrowRef = useRef<HTMLTextAreaElement | null>(null)
  const [recordingState, setRecordingState] = useState<RecordingState>('idle')
  const [showSuccess, setShowSuccess] = useState(false)
  const [isSupported, setIsSupported] = useState(false)
  
  // Web Speech API refs
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null)
  const finalTranscriptRef = useRef('')
  const isManualStopRef = useRef(false)
  const restartCountRef = useRef(0)
  const speechGotResultRef = useRef(false)
  const MAX_RESTARTS = 5

  // Use native browser speech recognition only. On iPhone, this uses the
  // device's built-in dictation service and never uploads recorded audio.
  useEffect(() => {
    if (typeof window === 'undefined') return

    const hasAPI = 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window
    console.log('Web Speech API supported:', hasAPI)
    setIsSupported(hasAPI)
  }, [])

  const startRecording = useCallback(() => {
    // Stop any existing recognition
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop()
      } catch (e) {
        // Ignore
      }
    }

    isManualStopRef.current = false
    finalTranscriptRef.current = value
    restartCountRef.current = 0
    speechGotResultRef.current = false

    // Start the native browser speech recogniser.
    const SpeechRecognitionAPI = (window as typeof window & { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown }).SpeechRecognition || 
                                 (window as typeof window & { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown }).webkitSpeechRecognition
    
    if (SpeechRecognitionAPI) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const recognition = new (SpeechRecognitionAPI as any)()
      recognition.continuous = true
      recognition.interimResults = true
      recognition.lang = 'en-AU' // Australian English
      recognition.maxAlternatives = 1

      recognition.onstart = () => {
        console.log('Web Speech started')
      }

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        speechGotResultRef.current = true
        let interimTranscript = ''
        let newFinalTranscript = ''
        
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const resultItem = event.results[i]
          const transcript = resultItem[0].transcript
          if (resultItem.isFinal) {
            newFinalTranscript += (newFinalTranscript ? ' ' : '') + transcript
          } else {
            interimTranscript += transcript
          }
        }
        
        if (newFinalTranscript) {
          finalTranscriptRef.current += (finalTranscriptRef.current ? ' ' : '') + newFinalTranscript
          restartCountRef.current = 0
        }
        
        onChange(finalTranscriptRef.current + (interimTranscript ? ' ' + interimTranscript : ''))
      }

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        console.log('Speech recognition error:', event.error)
        
        // Auto-restart on no-speech errors (not on manual stop)
        if (!isManualStopRef.current && event.error === 'no-speech') {
          setTimeout(() => {
            if (!isManualStopRef.current && recognitionRef.current === recognition) {
              try { recognition.start() } catch (e) { /* ignore */ }
            }
          }, 100)
          return
        }
        
        if (event.error === 'not-allowed') {
          alert('Microphone access denied. Please allow microphone access to use voice input.')
          setRecordingState('idle')
        }
      }

      recognition.onend = () => {
        if (isManualStopRef.current) return

        // Auto-restart if we haven't exceeded max restarts
        if (restartCountRef.current < MAX_RESTARTS && recognitionRef.current === recognition) {
          restartCountRef.current++
          console.log(`Recognition ended unexpectedly, restarting (${restartCountRef.current}/${MAX_RESTARTS})...`)
          setTimeout(() => {
            if (!isManualStopRef.current && recognitionRef.current === recognition) {
              try { recognition.start() } catch (e) { /* ignore */ }
            }
          }, 100)
        }
      }

      recognitionRef.current = recognition
      try {
        recognition.start()
      } catch (e) {
        console.error('Failed to start recognition:', e)
      }
    }

    setRecordingState('recording')
  }, [value, onChange])

  const stopRecording = useCallback(() => {
    isManualStopRef.current = true
    
    // Stop Web Speech API
    if (recognitionRef.current) {
      try { recognitionRef.current.stop() } catch (e) { /* ignore */ }
      recognitionRef.current = null
    }

    // Check if Web Speech produced any results
    const speechWorked = speechGotResultRef.current
    const hasNewTranscript = finalTranscriptRef.current.trim() !== (value || '').trim() && finalTranscriptRef.current.trim().length > (value || '').trim().length

    if (speechWorked && hasNewTranscript) {
      // Web Speech worked — use its results (free)
      console.log('Using Web Speech API results')
      setRecordingState('idle')
      setShowSuccess(true)
      setTimeout(() => setShowSuccess(false), 1500)
      onRecordingComplete?.()
      return
    }

    setRecordingState('idle')
  }, [value, onRecordingComplete])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop()
        } catch (e) {
          // Ignore
        }
      }
    }
  }, [])

  const handleMicClick = () => {
    if (disabled) return

    if (recordingState === 'recording') {
      stopRecording()
    } else {
      startRecording()
    }
  }

  // Grow the auto-grow textarea to fit its content whenever the value changes.
  useEffect(() => {
    if (!autoGrow) return
    const el = autoGrowRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [autoGrow, value])

  const canRecord = isSupported

  const getMicIconClass = () => {
    if (showSuccess) return 'mic-icon success'
    if (recordingState === 'recording') return 'mic-icon recording'
    if (!canRecord) return 'mic-icon disabled'
    return 'mic-icon idle'
  }

  return (
    <div className={`voice-field ${className}`}>
      {label && (
        <label className="voice-field-label">
          {label}
          {!canRecord && (
            <span className="unsupported-badge">Voice not supported</span>
          )}
        </label>
      )}
      
      <div className="voice-field-input-wrapper">
        {autoGrow ? (
          <textarea
            ref={autoGrowRef}
            className="voice-field-input voice-field-textarea voice-field-autogrow"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            disabled={disabled}
            rows={1}
          />
        ) : multiline ? (
          <textarea
            className="voice-field-input voice-field-textarea"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            disabled={disabled}
            rows={4}
          />
        ) : (
          <input
            type="text"
            className="voice-field-input"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            disabled={disabled}
          />
        )}
        
        <button
          type="button"
          className={getMicIconClass()}
          onClick={handleMicClick}
          disabled={disabled || !canRecord}
          aria-label={recordingState === 'recording' ? 'Stop recording' : 'Start recording'}
          title={recordingState === 'recording' ? 'Click to stop recording' : 'Click to start recording'}
        >
          {recordingState === 'recording' ? (
            <svg viewBox="0 0 24 24" fill="currentColor" className="mic-svg">
              <rect x="6" y="6" width="12" height="12" rx="2" />
            </svg>
          ) : showSuccess ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="mic-svg">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="currentColor" className="mic-svg">
              <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
              <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
            </svg>
          )}
          
          {recordingState === 'recording' && <span className="recording-pulse" />}
        </button>

      </div>
    </div>
  )
}
