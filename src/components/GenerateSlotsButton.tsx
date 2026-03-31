'use client'

import { useState } from 'react'
import { useDocumentInfo } from '@payloadcms/ui'

export default function GenerateSlotsButton() {
  const { id } = useDocumentInfo()
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  const handleGenerate = async () => {
    if (!id) return
    setLoading(true)
    setResult(null)
    try {
      const res = await fetch(`/api/meeting-schedulers/${id}/generate-slots`, {
        method: 'POST',
      })
      const data = await res.json()
      if (res.ok) {
        setResult(`Generated ${data.slotCount} available slots`)
        setTimeout(() => window.location.reload(), 1500)
      } else {
        setResult(data.error || 'Failed to generate slots')
      }
    } catch {
      setResult('Network error')
    } finally {
      setLoading(false)
    }
  }

  if (!id) return null

  return (
    <div style={{ marginTop: 12, marginBottom: 12 }}>
      <button
        onClick={handleGenerate}
        disabled={loading}
        type="button"
        style={{
          padding: '8px 16px',
          background: 'var(--theme-elevation-150)',
          color: 'var(--theme-text)',
          border: 'none',
          borderRadius: 4,
          cursor: loading ? 'wait' : 'pointer',
          fontSize: 13,
          fontWeight: 500,
        }}
      >
        {loading ? 'Checking calendar...' : 'Generate Available Slots'}
      </button>
      {result && (
        <span style={{ marginLeft: 12, fontSize: 13, color: 'var(--theme-elevation-500)' }}>
          {result}
        </span>
      )}
    </div>
  )
}
