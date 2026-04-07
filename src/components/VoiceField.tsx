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
  const [isTranscribing, setIsTranscribing] = useState(false)
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])

  // Check for MediaRecorder support
  useEffect(() => {
    // Check if MediaRecorder is supported
    if (typeof MediaRecorder === 'undefined') {
      console.log('MediaRecorder not defined')
      setIsSupported(false)
      return
    }
    
    // Check if getUserMedia is available
    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
      console.log('getUserMedia not available')
      setIsSupported(false)
      return
    }
    
    console.log('MediaRecorder supported: true')
    setIsSupported(true)
  }, [])

  const startRecording = useCallback(async () => {
    try {
      // Stop any existing recording
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop()
      }

      // Request microphone permission
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      
      // Create MediaRecorder
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      })
      
      audioChunksRef.current = []

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
          console.log('Audio chunk received:', event.data.size, 'bytes, total chunks:', audioChunksRef.current.length)
        }
      }

      mediaRecorder.onstop = async () => {
        // Stop all tracks
        stream.getTracks().forEach(track => track.stop())
        
        if (audioChunksRef.current.length === 0) return

        setIsTranscribing(true)
        setRecordingState('processing')

        // Create audio blob
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
        console.log('Audio blob created:', audioBlob.size, 'bytes')
        
        // Convert to WAV for Whisper
        try {
          const wavBlob = await convertToWav(audioBlob)
          console.log('WAV blob created:', wavBlob.size, 'bytes')
          
          if (wavBlob.size < 100) {
            console.error('WAV blob too small, skipping transcription')
            setIsTranscribing(false)
            setRecordingState('idle')
            return
          }
          
          // Send to Whisper API
          const formData = new FormData()
          formData.append('file', wavBlob, 'audio.wav')

          const response = await fetch('/api/transcribe', {
            method: 'POST',
            body: formData,
          })

          const result = await response.json()
          console.log('Transcription result:', result)
          
          if (response.ok && result.text) {
            const transcribedText = result.text.trim()
            
            if (transcribedText) {
              // Append to existing value
              const newValue = value ? `${value} ${transcribedText}` : transcribedText
              onChange(newValue)
              setShowSuccess(true)
              setTimeout(() => setShowSuccess(false), 1500)
              onRecordingComplete?.()
            }
          } else {
            console.error('Transcription failed:', response.status, result.error)
          }
        } catch (error) {
          console.error('Audio conversion or transcription error:', error)
        }

        setIsTranscribing(false)
        setRecordingState('idle')
      }

      mediaRecorder.onerror = (event) => {
        console.error('MediaRecorder error:', event)
        stream.getTracks().forEach(track => track.stop())
        setRecordingState('idle')
        setIsTranscribing(false)
      }

      mediaRecorderRef.current = mediaRecorder
      mediaRecorder.start(100) // Collect data every 100ms
      setRecordingState('recording')

    } catch (error) {
      console.error('Failed to start recording:', error)
      if ((error as Error).name === 'NotAllowedError') {
        alert('Microphone access denied. Please allow microphone access to use voice input.')
      }
    }
  }, [value, onChange, onRecordingComplete])

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop()
    }
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop()
      }
    }
  }, [])

  const handleMicClick = () => {
    console.log('Mic clicked, disabled:', disabled, 'isSupported:', isSupported, 'recordingState:', recordingState)
    
    if (disabled) {
      console.log('Button disabled')
      return
    }

    if (recordingState === 'recording') {
      stopRecording()
    } else if (recordingState !== 'processing') {
      startRecording()
    }
  }

  const getMicIconClass = () => {
    if (showSuccess) return 'mic-icon success'
    if (recordingState === 'recording') return 'mic-icon recording'
    if (isTranscribing || recordingState === 'processing') return 'mic-icon processing'
    if (!isSupported) return 'mic-icon disabled'
    return 'mic-icon idle'
  }

  return (
    <div className={`voice-field ${className}`}>
      <label className="voice-field-label">
        {label}
        {!isSupported && (
          <span className="unsupported-badge">Recording not supported</span>
        )}
      </label>
      
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
          disabled={disabled || isTranscribing}
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
          ) : isTranscribing ? (
            <svg viewBox="0 0 24 24" fill="currentColor" className="mic-svg spinner-svg">
              <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.3" />
              <path d="M12 2a10 10 0 0 1 10 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
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
      
      {isTranscribing && (
        <p className="transcribing-text">Transcribing...</p>
      )}
    </div>
  )
}

// Convert webm audio to WAV format for Whisper
async function convertToWav(blob: Blob): Promise<Blob> {
  console.log('Converting blob to WAV, size:', blob.size)
  
  const arrayBuffer = await blob.arrayBuffer()
  console.log('Array buffer size:', arrayBuffer.byteLength)
  
  const audioContext = new AudioContext({ sampleRate: 16000 })
  
  try {
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)
    console.log('Audio decoded, duration:', audioBuffer.duration, 'samples:', audioBuffer.length)
    
    if (audioBuffer.length === 0) {
      console.error('Audio buffer is empty!')
    }
    
    // Get raw PCM data
    const wavBuffer = audioBufferToWav(audioBuffer)
    console.log('WAV buffer created, size:', wavBuffer.byteLength)
    return new Blob([wavBuffer], { type: 'audio/wav' })
  } catch (error) {
    console.error('Failed to decode audio:', error)
    throw error
  } finally {
    await audioContext.close()
  }
}

// Convert AudioBuffer to WAV format
function audioBufferToWav(buffer: AudioBuffer): ArrayBuffer {
  const numChannels = 1 // Mono
  const sampleRate = buffer.sampleRate
  const format = 1 // PCM
  const bitDepth = 16
  
  const bytesPerSample = bitDepth / 8
  const blockAlign = numChannels * bytesPerSample
  
  const samples = buffer.length
  const dataSize = samples * blockAlign
  const bufferSize = 44 + dataSize
  
  const arrayBuffer = new ArrayBuffer(bufferSize)
  const view = new DataView(arrayBuffer)
  
  // WAV header
  writeString(view, 0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeString(view, 8, 'WAVE')
  writeString(view, 12, 'fmt ')
  view.setUint32(16, 16, true) // fmt chunk size
  view.setUint16(20, format, true)
  view.setUint16(22, numChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * blockAlign, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, bitDepth, true)
  writeString(view, 36, 'data')
  view.setUint32(40, dataSize, true)
  
  // Write audio data
  const channelData = buffer.getChannelData(0)
  let offset = 44
  for (let i = 0; i < samples; i++) {
    const sample = Math.max(-1, Math.min(1, channelData[i]))
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true)
    offset += 2
  }
  
  return arrayBuffer
}

function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i))
  }
}
