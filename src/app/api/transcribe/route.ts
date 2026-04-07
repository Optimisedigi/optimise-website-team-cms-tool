import { NextRequest, NextResponse } from 'next/server'
import { writeFileSync } from 'fs'
import { join } from 'path'

const WHISPER_API_URL = 'http://127.0.0.1:49790/inference'

export async function POST(request: NextRequest) {
  try {
    // Get the audio file from the request
    const formData = await request.formData()
    const audioFile = formData.get('file') as File | null

    if (!audioFile) {
      return NextResponse.json({ error: 'No audio file provided' }, { status: 400 })
    }

    console.log('Transcribing audio file:', audioFile.name, 'size:', audioFile.size, 'type:', audioFile.type)

    // Read the audio data
    const audioBuffer = await audioFile.arrayBuffer()
    const audioData = new Uint8Array(audioBuffer)
    
    // Check WAV header
    const header = Buffer.from(audioData.slice(0, 44))
    console.log('WAV Header check:', {
      riff: header.slice(0, 4).toString(),
      wave: header.slice(8, 12).toString(),
      channels: header.readUInt16LE(22),
      sampleRate: header.readUInt32LE(24),
      bitsPerSample: header.readUInt16LE(34),
      dataSize: header.readUInt32LE(40)
    })

    // Save a copy for debugging (only in development)
    if (process.env.NODE_ENV === 'development') {
      try {
        const debugPath = join(process.cwd(), 'debug_audio.wav')
        writeFileSync(debugPath, Buffer.from(audioData))
        console.log('Saved debug audio to:', debugPath)
      } catch (e) {
        console.log('Could not save debug audio:', e)
      }
    }

    // Forward to Whisper server
    const whisperFormData = new FormData()
    whisperFormData.append('file', audioFile, audioFile.name)

    const response = await fetch(WHISPER_API_URL, {
      method: 'POST',
      body: whisperFormData,
    })

    const responseText = await response.text()
    console.log('Whisper response:', response.status, responseText.substring(0, 500))

    if (!response.ok) {
      console.error('Whisper API error:', response.status, responseText)
      return NextResponse.json(
        { error: 'Transcription failed: ' + responseText },
        { status: response.status }
      )
    }

    // Try to parse as JSON
    let text = ''
    try {
      const result = JSON.parse(responseText)
      text = result.text || ''
    } catch {
      // If not JSON, use the raw text (strip any quotes)
      text = responseText.replace(/^["']|["']$/g, '').trim()
    }
    
    console.log('Transcribed text:', text)

    return NextResponse.json({ text })

  } catch (error) {
    console.error('Transcription API error:', error)
    return NextResponse.json(
      { error: 'Internal server error: ' + String(error) },
      { status: 500 }
    )
  }
}
