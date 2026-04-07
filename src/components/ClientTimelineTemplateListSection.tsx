'use client'

import { useState, useEffect, useCallback } from 'react'

type Phase = {
  id?: string
  phaseName: string
  phaseOrder: number
  weekRange?: string
  phaseDescription?: string
  items: Array<{
    id?: string
    itemName: string
    itemOrder: number
    itemDescription?: string
    requiresApproval: boolean
    internalNotes?: string
  }>
}

type Template = {
  id: number
  name: string
  serviceType: string
  description?: string
  isDefault?: boolean
  isActive?: boolean
  phases: Phase[]
}

const SERVICE_OPTIONS = [
  { label: 'Google Ads', value: 'google_ads' },
  { label: 'SEO', value: 'seo' },
  { label: 'Meta Ads', value: 'meta_ads' },
  { label: 'CRO', value: 'cro' },
  { label: 'General', value: 'general' },
]

const SERVICE_LABELS: Record<string, string> = Object.fromEntries(SERVICE_OPTIONS.map(o => [o.value, o.label]))

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}

export default function ClientTimelineTemplateListSection() {
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(false)
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<number | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  // Form state
  const [formName, setFormName] = useState('')
  const [formService, setFormService] = useState('google_ads')
  const [formDesc, setFormDesc] = useState('')
  const [formPhases, setFormPhases] = useState<Phase[]>([])

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }, [])

  const loadTemplates = useCallback(async () => {
    try {
      const res = await fetch('/api/client-timeline-templates?depth=1&limit=50&sort=name', { credentials: 'include' })
      const d = await res.json()
      const docs: Template[] = d.docs ?? []

      // Auto-seed the Google Ads 90-Day Onboarding template if it doesn't exist
      const hasGadsTemplate = docs.some(t => t.name === 'Google Ads 90-Day Onboarding')
      if (!hasGadsTemplate) {
        try {
          const seedRes = await fetch('/api/client-timeline-templates/seed-google-ads', {
            method: 'POST', credentials: 'include',
          })
          if (seedRes.ok) {
            // Re-fetch to include the seeded template
            const res2 = await fetch('/api/client-timeline-templates?depth=1&limit=50&sort=name', { credentials: 'include' })
            const d2 = await res2.json()
            setTemplates(d2.docs ?? [])
            setLoading(false)
            return
          }
        } catch { /* ignore seed failure */ }
      }

      setTemplates(docs)
    } catch { /* ignore */ }
    setLoading(false)
  }, [])

  useEffect(() => { loadTemplates() }, [loadTemplates])

  const resetForm = () => {
    setFormName('')
    setFormService('google_ads')
    setFormDesc('')
    setFormPhases([])
    setCreating(false)
    setEditing(null)
  }

  const startCreate = () => {
    resetForm()
    setCreating(true)
    setExpanded(true)
  }

  const startEdit = (t: Template) => {
    setFormName(t.name)
    setFormService(t.serviceType)
    setFormDesc(t.description ?? '')
    setFormPhases(t.phases?.map(p => ({
      ...p,
      items: p.items?.map(i => ({ ...i })) ?? [],
    })) ?? [])
    setEditing(t.id)
    setCreating(false)
    setExpanded(true)
  }

  const addPhase = () => {
    setFormPhases(prev => [...prev, {
      id: uid(),
      phaseName: '',
      phaseOrder: prev.length + 1,
      weekRange: '',
      phaseDescription: '',
      items: [],
    }])
  }

  const removePhase = (idx: number) => {
    setFormPhases(prev => prev.filter((_, i) => i !== idx).map((p, i) => ({ ...p, phaseOrder: i + 1 })))
  }

  const updatePhase = (idx: number, field: string, value: string) => {
    setFormPhases(prev => prev.map((p, i) => i === idx ? { ...p, [field]: value } : p))
  }

  const addItem = (phaseIdx: number) => {
    setFormPhases(prev => prev.map((p, i) => i === phaseIdx ? {
      ...p,
      items: [...p.items, { id: uid(), itemName: '', itemOrder: p.items.length + 1, itemDescription: '', requiresApproval: false, internalNotes: '' }],
    } : p))
  }

  const removeItem = (phaseIdx: number, itemIdx: number) => {
    setFormPhases(prev => prev.map((p, i) => i === phaseIdx ? {
      ...p,
      items: p.items.filter((_, j) => j !== itemIdx).map((item, j) => ({ ...item, itemOrder: j + 1 })),
    } : p))
  }

  const updateItem = (phaseIdx: number, itemIdx: number, field: string, value: string | boolean) => {
    setFormPhases(prev => prev.map((p, i) => i === phaseIdx ? {
      ...p,
      items: p.items.map((item, j) => j === itemIdx ? { ...item, [field]: value } : item),
    } : p))
  }

  const saveTemplate = async () => {
    if (!formName.trim()) { showToast('Template name is required'); return }
    const body: any = {
      name: formName.trim(),
      serviceType: formService,
      description: formDesc.trim() || undefined,
      isActive: true,
      phases: formPhases.map((p, pi) => ({
        phaseName: p.phaseName,
        phaseOrder: pi + 1,
        weekRange: p.weekRange || undefined,
        phaseDescription: p.phaseDescription || undefined,
        items: p.items.map((item, ii) => ({
          itemName: item.itemName,
          itemOrder: ii + 1,
          itemDescription: item.itemDescription || undefined,
          requiresApproval: item.requiresApproval,
          internalNotes: item.internalNotes || undefined,
        })),
      })),
    }

    const url = editing ? `/api/client-timeline-templates/${editing}` : '/api/client-timeline-templates'
    const method = editing ? 'PATCH' : 'POST'

    try {
      const res = await fetch(url, {
        method,
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) { showToast('Failed to save template'); return }
      showToast(editing ? 'Template updated' : 'Template created')
      resetForm()
      loadTemplates()
    } catch {
      showToast('Failed to save template')
    }
  }

  const deleteTemplate = async (id: number) => {
    if (!confirm('Delete this template?')) return
    try {
      await fetch(`/api/client-timeline-templates/${id}`, { method: 'DELETE', credentials: 'include' })
      showToast('Template deleted')
      loadTemplates()
    } catch {
      showToast('Failed to delete')
    }
  }

  const inputStyle: React.CSSProperties = {
    padding: '6px 10px', borderRadius: 5, border: '1px solid #D1D5DB',
    fontSize: 13, width: '100%', boxSizing: 'border-box',
  }

  return (
    <div style={{ marginBottom: 24, fontFamily: 'Arial, sans-serif' }}>
      {toast && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, background: '#111827', color: '#fff', padding: '10px 18px', borderRadius: 8, fontSize: 14, zIndex: 9999, boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
          {toast}
        </div>
      )}

      <div
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', padding: '10px 14px', background: '#F9FAFB', borderRadius: 8, border: '1px solid #E5E7EB', marginBottom: expanded ? 12 : 0 }}
        onClick={() => { if (!creating && editing === null) setExpanded(e => !e) }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>
            Timeline Templates
          </span>
          <span style={{ fontSize: 12, color: '#6B7280' }}>
            {loading ? '' : `${templates.length} template${templates.length !== 1 ? 's' : ''}`}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            onClick={(e) => { e.stopPropagation(); startCreate() }}
            style={{ padding: '5px 12px', borderRadius: 5, fontSize: 12, fontWeight: 600, background: '#2563EB', color: '#fff', border: 'none', cursor: 'pointer' }}
          >
            + New Template
          </button>
          <span style={{ fontSize: 12, color: '#9CA3AF', transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 150ms' }}>
            &#9660;
          </span>
        </div>
      </div>

      {expanded && (
        <div style={{ border: '1px solid #E5E7EB', borderRadius: 8, padding: 16, background: '#fff' }}>
          {/* Create/Edit Form */}
          {(creating || editing !== null) && (
            <div style={{ marginBottom: 20, padding: 16, background: '#F9FAFB', borderRadius: 8, border: '1px solid #E5E7EB' }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12, color: '#111827' }}>
                {editing ? 'Edit Template' : 'New Template'}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: '#6B7280', display: 'block', marginBottom: 3 }}>Name *</label>
                  <input style={inputStyle} value={formName} onChange={e => setFormName(e.target.value)} placeholder="e.g. Google Ads 90-Day Onboarding" />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: '#6B7280', display: 'block', marginBottom: 3 }}>Service Type</label>
                  <select style={inputStyle} value={formService} onChange={e => setFormService(e.target.value)}>
                    {SERVICE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#6B7280', display: 'block', marginBottom: 3 }}>Description</label>
                <input style={inputStyle} value={formDesc} onChange={e => setFormDesc(e.target.value)} placeholder="Brief description of this template" />
              </div>

              {/* Phases */}
              <div style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#374151' }}>Phases ({formPhases.length})</span>
                  <button onClick={addPhase} style={{ padding: '3px 10px', fontSize: 12, fontWeight: 600, background: '#fff', border: '1px solid #D1D5DB', borderRadius: 5, cursor: 'pointer' }}>
                    + Add Phase
                  </button>
                </div>
                {formPhases.map((phase, pi) => (
                  <div key={phase.id ?? pi} style={{ border: '1px solid #E5E7EB', borderRadius: 6, padding: 12, marginBottom: 8, background: '#fff' }}>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'flex-end' }}>
                      <div style={{ flex: 2 }}>
                        <label style={{ fontSize: 10, fontWeight: 600, color: '#9CA3AF' }}>Phase Name</label>
                        <input style={inputStyle} value={phase.phaseName} onChange={e => updatePhase(pi, 'phaseName', e.target.value)} placeholder="e.g. Quick Wins" />
                      </div>
                      <div style={{ flex: 1 }}>
                        <label style={{ fontSize: 10, fontWeight: 600, color: '#9CA3AF' }}>Week Range</label>
                        <input style={inputStyle} value={phase.weekRange ?? ''} onChange={e => updatePhase(pi, 'weekRange', e.target.value)} placeholder="e.g. Week 1-2" />
                      </div>
                      <button onClick={() => removePhase(pi)} style={{ padding: '5px 8px', fontSize: 11, color: '#DC2626', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 5, cursor: 'pointer', flexShrink: 0 }}>
                        Remove
                      </button>
                    </div>
                    {/* Items */}
                    <div style={{ marginLeft: 12 }}>
                      {phase.items.map((item, ii) => (
                        <div key={item.id ?? ii} style={{ display: 'flex', gap: 6, marginBottom: 4, alignItems: 'center' }}>
                          <input style={{ ...inputStyle, flex: 2 }} value={item.itemName} onChange={e => updateItem(pi, ii, 'itemName', e.target.value)} placeholder="Item name" />
                          <label style={{ fontSize: 11, color: '#6B7280', display: 'flex', alignItems: 'center', gap: 3, whiteSpace: 'nowrap' }}>
                            <input type="checkbox" checked={item.requiresApproval} onChange={e => updateItem(pi, ii, 'requiresApproval', e.target.checked)} /> Approval
                          </label>
                          <button onClick={() => removeItem(pi, ii)} style={{ padding: '2px 6px', fontSize: 10, color: '#DC2626', background: 'none', border: 'none', cursor: 'pointer' }}>X</button>
                        </div>
                      ))}
                      <button onClick={() => addItem(pi)} style={{ padding: '2px 8px', fontSize: 11, color: '#2563EB', background: 'none', border: 'none', cursor: 'pointer' }}>
                        + Add Item
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={saveTemplate} style={{ padding: '7px 16px', borderRadius: 6, fontSize: 13, fontWeight: 600, background: '#2563EB', color: '#fff', border: 'none', cursor: 'pointer' }}>
                  {editing ? 'Update Template' : 'Create Template'}
                </button>
                <button onClick={resetForm} style={{ padding: '7px 16px', borderRadius: 6, fontSize: 13, fontWeight: 600, background: '#fff', color: '#374151', border: '1px solid #D1D5DB', cursor: 'pointer' }}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Template List */}
          {loading ? (
            <div style={{ padding: 16, textAlign: 'center', color: '#9CA3AF', fontSize: 13 }}>Loading...</div>
          ) : templates.length === 0 && !creating ? (
            <div style={{ padding: 20, textAlign: 'center', color: '#9CA3AF', fontSize: 13, border: '1px dashed #E5E7EB', borderRadius: 8 }}>
              No templates yet. Click "+ New Template" to create one.
            </div>
          ) : (
            <div>
              {templates.map(t => {
                const phaseCount = t.phases?.length ?? 0
                const itemCount = t.phases?.reduce((sum, p) => sum + (p.items?.length ?? 0), 0) ?? 0
                return (
                  <div key={t.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderBottom: '1px solid #F3F4F6' }}>
                    <div>
                      <span style={{ fontWeight: 600, fontSize: 13, color: '#111827' }}>{t.name}</span>
                      <span style={{ marginLeft: 8, fontSize: 11, color: '#6B7280', background: '#F3F4F6', padding: '1px 6px', borderRadius: 999, fontWeight: 600 }}>
                        {SERVICE_LABELS[t.serviceType] ?? t.serviceType}
                      </span>
                      <span style={{ marginLeft: 8, fontSize: 11, color: '#9CA3AF' }}>
                        {phaseCount} phase{phaseCount !== 1 ? 's' : ''} / {itemCount} item{itemCount !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => startEdit(t)} style={{ padding: '3px 10px', fontSize: 11, fontWeight: 600, background: '#fff', color: '#374151', border: '1px solid #D1D5DB', borderRadius: 5, cursor: 'pointer' }}>
                        Edit
                      </button>
                      <button onClick={() => deleteTemplate(t.id)} style={{ padding: '3px 10px', fontSize: 11, fontWeight: 600, background: '#fff', color: '#DC2626', border: '1px solid #FECACA', borderRadius: 5, cursor: 'pointer' }}>
                        Delete
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
