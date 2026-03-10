'use client'

import { useDocumentInfo, useAllFormFields } from '@payloadcms/ui'
import { useEffect, useState } from 'react'

type Template = {
  id: string
  name: string
  retainerType: string | null
  description: string | null
  phaseCount: number
  stepCount: number
}

const retainerOptions = [
  { label: 'Google Ads Only', value: 'google_ads_only' },
  { label: 'Meta Ads Only', value: 'meta_ads_only' },
  { label: 'SEO Only', value: 'seo_only' },
  { label: 'Website Build Only', value: 'website_build_only' },
  { label: 'Website + SEO', value: 'website_seo' },
  { label: 'Website + SEO + Google Ads', value: 'website_seo_google_ads' },
  { label: 'Full Integration', value: 'full_integration' },
  { label: 'AI Automations', value: 'ai_automations' },
  { label: 'Custom', value: 'custom' },
]

const StartProcessFromLeadButton = () => {
  const { id } = useDocumentInfo()
  const [fields] = useAllFormFields()
  const [templates, setTemplates] = useState<Template[]>([])
  const [open, setOpen] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null)
  const [retainerOverride, setRetainerOverride] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const businessName = (fields?.businessName?.value as string) || ''
  const proposalValue = fields?.proposal?.value
  const proposalId = typeof proposalValue === 'object' && proposalValue !== null
    ? (proposalValue as any).id
    : proposalValue || undefined

  useEffect(() => {
    if (!open) return
    fetch('/api/client-processes/templates', { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => setTemplates(data.templates ?? []))
      .catch(() => setError('Failed to load templates'))
  }, [open])

  if (!id) return null

  const handleCreate = async () => {
    if (!selectedTemplate) return
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/client-processes/create-from-template', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateId: selectedTemplate.id,
          salesLeadId: id,
          proposalId: proposalId || undefined,
          clientName: businessName || 'Unnamed Lead',
          retainerType: retainerOverride || undefined,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || `Failed to create process (${res.status})`)
      }

      window.location.href = `/admin/collections/client-processes/${data.processId}`
    } catch (err: any) {
      setError(err.message || 'Something went wrong')
      setLoading(false)
    }
  }

  return (
    <div style={{ marginBottom: 20 }}>
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 20px',
            background: '#7c3aed',
            color: '#fff',
            borderRadius: 8,
            border: 'none',
            fontWeight: 600,
            fontSize: 14,
            cursor: 'pointer',
          }}
        >
          🚀 Start New Process
        </button>
      ) : (
        <div
          style={{
            padding: 16,
            background: '#f5f3ff',
            border: '1px solid #c4b5fd',
            borderRadius: 8,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#5b21b6' }}>
              Select a Process Template
            </p>
            <button
              type="button"
              onClick={() => { setOpen(false); setSelectedTemplate(null); setRetainerOverride(''); setError(null) }}
              style={{
                background: 'none',
                border: 'none',
                fontSize: 18,
                cursor: 'pointer',
                color: '#6b7280',
                lineHeight: 1,
              }}
            >
              ✕
            </button>
          </div>

          {templates.length === 0 && !error && (
            <p style={{ fontSize: 13, color: '#6b7280' }}>Loading templates…</p>
          )}

          {templates.length > 0 && (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                {templates.map((t) => (
                  <label
                    key={t.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '10px 12px',
                      background: selectedTemplate?.id === t.id ? '#ede9fe' : '#fff',
                      border: `1px solid ${selectedTemplate?.id === t.id ? '#8b5cf6' : '#e5e7eb'}`,
                      borderRadius: 6,
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="radio"
                      name="template"
                      checked={selectedTemplate?.id === t.id}
                      onChange={() => {
                        setSelectedTemplate(t)
                        setRetainerOverride(t.retainerType || '')
                      }}
                      style={{ accentColor: '#7c3aed' }}
                    />
                    <div>
                      <span style={{ fontWeight: 600, fontSize: 14 }}>{t.name}</span>
                      <span style={{ fontSize: 12, color: '#6b7280', marginLeft: 8 }}>
                        {t.phaseCount} phases · {t.stepCount} steps
                      </span>
                      {t.description && (
                        <p style={{ margin: '4px 0 0', fontSize: 12, color: '#6b7280' }}>{t.description}</p>
                      )}
                    </div>
                  </label>
                ))}
              </div>

              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4, color: '#374151' }}>
                  Retainer Type (optional override)
                </label>
                <select
                  value={retainerOverride}
                  onChange={(e) => setRetainerOverride(e.target.value)}
                  style={{
                    padding: '8px 10px',
                    fontSize: 13,
                    border: '1px solid #d1d5db',
                    borderRadius: 4,
                    background: '#fff',
                    color: '#111',
                    width: '100%',
                    maxWidth: 300,
                  }}
                >
                  <option value="">Use template default</option>
                  {retainerOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                onClick={handleCreate}
                disabled={!selectedTemplate || loading}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '10px 20px',
                  background: loading ? '#6b7280' : !selectedTemplate ? '#9ca3af' : '#7c3aed',
                  color: '#fff',
                  borderRadius: 8,
                  border: 'none',
                  fontWeight: 600,
                  fontSize: 14,
                  cursor: loading || !selectedTemplate ? 'not-allowed' : 'pointer',
                }}
              >
                {loading ? 'Creating Process…' : 'Create Process'}
              </button>
            </>
          )}

          {error && (
            <p style={{ marginTop: 8, fontSize: 13, color: '#dc2626' }}>{error}</p>
          )}
        </div>
      )}
    </div>
  )
}

export default StartProcessFromLeadButton
