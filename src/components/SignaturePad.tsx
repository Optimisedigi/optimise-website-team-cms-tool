'use client'

import { useRef, useState, useCallback } from 'react'
import SignatureCanvas from 'react-signature-canvas'

interface SignaturePadProps {
  onSave: (dataUrl: string) => void
  width?: number
  height?: number
  label?: string
}

const SignaturePad = ({ onSave, width = 400, height = 150, label = 'Sign below' }: SignaturePadProps) => {
  const sigRef = useRef<SignatureCanvas>(null)
  const [isEmpty, setIsEmpty] = useState(true)

  const handleClear = useCallback(() => {
    sigRef.current?.clear()
    setIsEmpty(true)
  }, [])

  const handleSave = useCallback(() => {
    if (sigRef.current && !sigRef.current.isEmpty()) {
      const dataUrl = sigRef.current.getTrimmedCanvas().toDataURL('image/png')
      onSave(dataUrl)
    }
  }, [onSave])

  return (
    <div style={{ marginBottom: 16 }}>
      <p style={{ margin: '0 0 8px', fontSize: 13, color: '#64748b' }}>{label}</p>
      <div
        style={{
          border: '1px solid #cbd5e1',
          borderRadius: 6,
          overflow: 'hidden',
          width,
          background: '#fff',
        }}
      >
        <SignatureCanvas
          ref={sigRef}
          canvasProps={{
            width,
            height,
            style: { display: 'block' },
          }}
          penColor="#1e293b"
          onBegin={() => setIsEmpty(false)}
        />
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button
          type="button"
          onClick={handleClear}
          style={{
            padding: '6px 16px',
            fontSize: 13,
            border: '1px solid #cbd5e1',
            borderRadius: 4,
            background: '#fff',
            color: '#64748b',
            cursor: 'pointer',
          }}
        >
          Clear
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={isEmpty}
          style={{
            padding: '6px 16px',
            fontSize: 13,
            border: 'none',
            borderRadius: 4,
            background: isEmpty ? '#94a3b8' : '#2563eb',
            color: '#fff',
            cursor: isEmpty ? 'not-allowed' : 'pointer',
          }}
        >
          Save Signature
        </button>
      </div>
    </div>
  )
}

export default SignaturePad
