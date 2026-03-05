'use client'

import { useEffect, useState } from 'react'

type Template = { id: string; contractTitle: string }

const CreateFromTemplateButton = () => {
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/contracts?where[isTemplate][equals]=true&limit=50&sort=contractTitle')
      .then((res) => res.json())
      .then((data) => setTemplates(data.docs ?? []))
      .catch(() => {})
  }, [])

  if (templates.length === 0) return null

  const handleCreate = async (templateId: string) => {
    setLoading(templateId)
    setError(null)

    try {
      const res = await fetch(`/api/contracts/${templateId}/duplicate`, {
        method: 'POST',
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to create from template')
      }

      window.location.href = `/admin/collections/contracts/${data.id}`
    } catch (e: any) {
      setError(e.message)
      setLoading(null)
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
      <label style={{ fontSize: 14, fontWeight: 500, whiteSpace: 'nowrap' }}>
        Create from Template:
      </label>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {templates.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => handleCreate(t.id)}
            disabled={loading !== null}
            style={{
              padding: '8px 16px',
              fontSize: 13,
              fontWeight: 600,
              border: 'none',
              borderRadius: 6,
              background: '#7c3aed',
              color: '#fff',
              cursor: loading ? 'wait' : 'pointer',
              opacity: loading && loading !== t.id ? 0.5 : 1,
            }}
          >
            {loading === t.id ? 'Creating...' : t.contractTitle}
          </button>
        ))}
      </div>
      {error && <p style={{ margin: 0, fontSize: 13, color: '#dc2626' }}>{error}</p>}
    </div>
  )
}

export default CreateFromTemplateButton
