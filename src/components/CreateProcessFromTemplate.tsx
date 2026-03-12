'use client'

import { useState, useEffect } from 'react'

type Template = {
  id: number
  name: string
  retainerType: string
}

const RETAINER_LABELS: Record<string, string> = {
  google_ads_only: 'Google Ads Only',
  meta_ads_only: 'Meta Ads Only',
  seo_only: 'SEO Only',
  website_build_only: 'Website Build',
  website_seo: 'Website + SEO',
  website_seo_google_ads: 'Website + SEO + Google Ads',
  full_integration: 'Full Integration',
  ai_automations: 'AI Automations',
  custom: 'Custom',
}

function CreateProcessFromTemplate() {
  const [templates, setTemplates] = useState<Template[]>([])
  const [showForm, setShowForm] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState<string>('')
  const [clientName, setClientName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/client-processes/templates', { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data.templates)) {
          setTemplates(data.templates)
        }
      })
      .catch(() => {})
  }, [])

  if (templates.length === 0) return null

  const handleCreate = async () => {
    if (!selectedTemplate || !clientName.trim()) {
      setError('Please select a template and enter a client name')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/client-processes/create-from-template', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateId: selectedTemplate,
          clientName: clientName.trim(),
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to create process')
      }

      // Navigate to the new process
      window.location.href = `/admin/collections/client-processes/${data.processId}`
    } catch (e: any) {
      setError(e.message)
      setLoading(false)
    }
  }

  if (!showForm) {
    return (
      <div style={{ marginBottom: 16 }}>
        <button
          type="button"
          onClick={() => setShowForm(true)}
          style={{
            padding: '10px 20px',
            fontSize: 13,
            fontWeight: 600,
            border: 'none',
            borderRadius: 6,
            background: '#7c3aed',
            color: '#fff',
            cursor: 'pointer',
          }}
        >
          + Create from Template
        </button>
      </div>
    )
  }

  return (
    <div
      style={{
        marginBottom: 16,
        padding: 16,
        border: '1px solid var(--theme-elevation-150)',
        borderRadius: 8,
        background: 'var(--theme-elevation-50)',
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>
        Create Process from Template
      </div>

      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <label
            style={{
              display: 'block',
              fontSize: 12,
              fontWeight: 600,
              marginBottom: 4,
              color: 'var(--theme-elevation-600)',
            }}
          >
            Template
          </label>
          <select
            value={selectedTemplate}
            onChange={(e) => setSelectedTemplate(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 10px',
              fontSize: 13,
              border: '1px solid var(--theme-elevation-150)',
              borderRadius: 6,
              background: 'var(--theme-elevation-0)',
              color: 'var(--theme-elevation-800)',
            }}
          >
            <option value="">Select a template...</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({RETAINER_LABELS[t.retainerType] || t.retainerType})
              </option>
            ))}
          </select>
        </div>

        <div style={{ flex: 1, minWidth: 200 }}>
          <label
            style={{
              display: 'block',
              fontSize: 12,
              fontWeight: 600,
              marginBottom: 4,
              color: 'var(--theme-elevation-600)',
            }}
          >
            Client Name
          </label>
          <input
            type="text"
            value={clientName}
            onChange={(e) => setClientName(e.target.value)}
            placeholder="e.g. Acme Corp"
            style={{
              width: '100%',
              padding: '8px 10px',
              fontSize: 13,
              border: '1px solid var(--theme-elevation-150)',
              borderRadius: 6,
              background: 'var(--theme-elevation-0)',
              color: 'var(--theme-elevation-800)',
            }}
          />
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            onClick={handleCreate}
            disabled={loading}
            style={{
              padding: '8px 20px',
              fontSize: 13,
              fontWeight: 600,
              border: 'none',
              borderRadius: 6,
              background: '#10B981',
              color: '#fff',
              cursor: loading ? 'wait' : 'pointer',
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? 'Creating...' : 'Create'}
          </button>
          <button
            type="button"
            onClick={() => {
              setShowForm(false)
              setError(null)
            }}
            style={{
              padding: '8px 16px',
              fontSize: 13,
              fontWeight: 600,
              border: '1px solid var(--theme-elevation-150)',
              borderRadius: 6,
              background: 'transparent',
              color: 'var(--theme-elevation-600)',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
        </div>
      </div>

      {error && (
        <p style={{ margin: '8px 0 0', fontSize: 13, color: '#dc2626' }}>{error}</p>
      )}
    </div>
  )
}

export default CreateProcessFromTemplate
