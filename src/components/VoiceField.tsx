'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import './VoiceField.css'

interface VoiceFieldProps {
  label?: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  multiline?: boolean
  disabled?: boolean
  className?: string
  onRecordingComplete?: () => void
}

type RecordingState = 'idle' | 'recording' | 'processing'

export default function VoiceField({
  label,
  value,
  onChange,
  placeholder,
  multiline = false,
  disabled = false,
  className = '',
  onRecordingComplete,
}: VoiceFieldProps) {
  const [recordingState, setRecordingState] = useState<RecordingState>('idle')
  const [showSuccess, setShowSuccess] = useState(false)
  const [isSupported, setIsSupported] = useState(false)
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null)
  const finalTranscriptRef = useRef('')
  const isManualStopRef = useRef(false)

  // Check for Web Speech API support on client side only
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

    const SpeechRecognitionAPI = (window as typeof window & { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown }).SpeechRecognition || 
                                 (window as typeof window & { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown }).webkitSpeechRecognition
    
    if (!SpeechRecognitionAPI) {
      console.warn('Web Speech API is not supported in this browser')
      return
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recognition = new (SpeechRecognitionAPI as any)()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = 'en-AU' // Australian English
    recognition.maxAlternatives = 1

    isManualStopRef.current = false
    finalTranscriptRef.current = value

    recognition.onstart = () => {
      console.log('Recording started')
      setRecordingState('recording')
    }

    recognition.onresult = (event: SpeechRecognitionEvent) => {
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
      
      // Update final transcript
      if (newFinalTranscript) {
        finalTranscriptRef.current += (finalTranscriptRef.current ? ' ' : '') + newFinalTranscript
      }
      
      onChange(finalTranscriptRef.current + (interimTranscript ? ' ' + interimTranscript : ''))
    }

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.log('Speech recognition error:', event.error)
      
      // Auto-restart on no-speech errors (not on manual stop)
      if (!isManualStopRef.current && event.error === 'no-speech') {
        console.log('No speech detected, restarting...')
        setTimeout(() => {
          if (!isManualStopRef.current && recognitionRef.current === recognition) {
            try {
              recognition.start()
            } catch (e) {
              // Recognition might have been stopped
            }
          }
        }, 100)
        return
      }
      
      setRecordingState('idle')
      
      if (event.error === 'not-allowed') {
        alert('Microphone access denied. Please allow microphone access to use voice input.')
      }
    }

    recognition.onend = () => {
      // Only trigger completion if this wasn't a manual stop
      if (!isManualStopRef.current) {
        setRecordingState('idle')
        
        if (finalTranscriptRef.current.trim()) {
          setShowSuccess(true)
          setTimeout(() => setShowSuccess(false), 1500)
          onRecordingComplete?.()
        }
      }
    }

    recognitionRef.current = recognition
    
    try {
      recognition.start()
    } catch (e) {
      console.error('Failed to start recognition:', e)
    }
  }, [value, onChange, onRecordingComplete])

  const stopRecording = useCallback(() => {
    isManualStopRef.current = true
    
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop()
      } catch (e) {
        // Ignore
      }
      recognitionRef.current = null
    }
    
    setRecordingState('idle')
    
    // Trigger completion
    if (finalTranscriptRef.current.trim()) {
      setShowSuccess(true)
      setTimeout(() => setShowSuccess(false), 1500)
      onRecordingComplete?.()
    }
  }, [onRecordingComplete])

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
    } else if (recordingState !== 'processing') {
      startRecording()
    }
  }

  const getMicIconClass = () => {
    if (showSuccess) return 'mic-icon success'
    if (recordingState === 'recording') return 'mic-icon recording'
    if (recordingState === 'processing') return 'mic-icon processing'
    if (!isSupported) return 'mic-icon disabled'
    return 'mic-icon idle'
  }

  return (
    <div className={`voice-field ${className}`}>
      {label && (
        <label className="voice-field-label">
          {label}
          {!isSupported && (
            <span className="unsupported-badge">Voice not supported</span>
          )}
        </label>
      )}
      
      <div className="voice-field-input-wrapper">
        {multiline ? (
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
          disabled={disabled || !isSupported}
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
