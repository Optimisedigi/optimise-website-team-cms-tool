'use client'

import { useDocumentInfo, useAllFormFields, useForm } from '@payloadcms/ui'
import { useState, useEffect, useCallback } from 'react'
import { ErrorBoundary } from './ErrorBoundary'

type Template = {
  id: number
  name: string
  serviceType: string
  description?: string
  phases: Array<{
    id: string
    phaseName: string
    phaseOrder: number
    weekRange?: string
    phaseDescription?: string
    items: Array<{
      id: string
      itemName: string
      itemOrder: number
      itemDescription?: string
      requiresApproval: boolean
      internalNotes?: string
    }>
  }>
}

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}

const SERVICE_LABELS: Record<string, string> = {
  google_ads: 'Google Ads',
  seo: 'SEO',
  meta_ads: 'Meta Ads',
  cro: 'CRO',
  general: 'General',
}

export default function ClientTimelineTemplateManager() {
  return (
    <ErrorBoundary>
      <TemplateManagerInner />
    </ErrorBoundary>
  );
}

function TemplateManagerInner() {
  const { id } = useDocumentInfo()
  const [fields, dispatchFields] = useAllFormFields()
  const { addFieldRow } = useForm()
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingTemplate, setLoadingTemplate] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const phasesPath = 'phases'

  // Load existing templates from DB
  useEffect(() => {
    if (!id) {
      // New document — still load templates for the dropdown
      fetch('/api/client-timeline-templates', { credentials: 'include' })
        .then(r => r.json())
        .then(d => {
          setTemplates(d.docs ?? [])
          setLoading(false)
        })
        .catch(() => setLoading(false))
      return
    }
    fetch('/api/client-timeline-templates', { credentials: 'include' })
      .then(r => r.json())
      .then(d => {
        setTemplates(d.docs ?? [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [id])

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }, [])

  const clearAllPhases = useCallback(() => {
    // Remove all phases one by one — fetch current state first
    fetch(`/api/client-timelines/${id}?depth=1`, { credentials: 'include' })
      .then(r => r.json())
      .then(doc => {
        if (doc.phases && Array.isArray(doc.phases)) {
          // Reverse order to remove from end to start without index shifting
          const sorted = [...doc.phases].sort((a: any, b: any) => b._order - a._order)
          sorted.forEach((_: any, idx: number) => {
            dispatchFields({ type: 'REMOVE', path: `${phasesPath}.${doc.phases.length - 1 - idx}` })
          })
        }
      })
      .catch(() => showToast('Failed to clear phases'))
  }, [id, dispatchFields, showToast])

  const loadTemplate = useCallback(async (template: Template) => {
    if (!id) {
      showToast('Save the timeline first before loading a template')
      return
    }
    setLoadingTemplate(template.id.toString())

    try {
      // Clear existing phases first
      const docRes = await fetch(`/api/client-timelines/${id}?depth=1`, { credentials: 'include' })
      const doc = await docRes.json()
      if (doc.phases && Array.isArray(doc.phases)) {
        const sorted = [...doc.phases].sort((a: any, b: any) => b._order - a._order)
        for (const _ of sorted) {
          const remaining = await fetch(`/api/client-timelines/${id}?depth=0`, { credentials: 'include' }).then(r => r.json())
          if (remaining.phases?.length) {
            dispatchFields({ type: 'REMOVE', path: `${phasesPath}.${remaining.phases.length - 1}` })
          }
        }
      }

      // Add phases from template
      for (const phase of template.phases) {
        await addFieldRow({ path: phasesPath, schemaPath: phasesPath, rowIndex: 9999 })
        // The field was just added, get its index (last one)
        const phaseCount = (await fetch(`/api/client-timelines/${id}?depth=0`, { credentials: 'include' }).then(r => r.json()))?.phases?.length ?? 0
        const phaseIdx = phaseCount - 1

        // Update phase fields
        dispatchFields({ type: 'UPDATE', path: `${phasesPath}.${phaseIdx}.phaseName`, value: phase.phaseName })
        dispatchFields({ type: 'UPDATE', path: `${phasesPath}.${phaseIdx}.weekRange`, value: phase.weekRange ?? '' })
        dispatchFields({ type: 'UPDATE', path: `${phasesPath}.${phaseIdx}.phaseDescription`, value: phase.phaseDescription ?? '' })

        // Add items
        for (const item of phase.items) {
          await addFieldRow({ path: `${phasesPath}.${phaseIdx}.items`, schemaPath: `${phasesPath}.items`, rowIndex: 9999 })
          const itemCount = (await fetch(`/api/client-timelines/${id}?depth=0`, { credentials: 'include' }).then(r => r.json()))?.phases?.[phaseIdx]?.items?.length ?? 0
          const itemIdx = itemCount - 1
          dispatchFields({ type: 'UPDATE', path: `${phasesPath}.${phaseIdx}.items.${itemIdx}.itemName`, value: item.itemName })
          dispatchFields({ type: 'UPDATE', path: `${phasesPath}.${phaseIdx}.items.${itemIdx}.itemDescription`, value: item.itemDescription ?? '' })
          dispatchFields({ type: 'UPDATE', path: `${phasesPath}.${phaseIdx}.items.${itemIdx}.requiresApproval`, value: item.requiresApproval })
          dispatchFields({ type: 'UPDATE', path: `${phasesPath}.${phaseIdx}.items.${itemIdx}.internalNotes`, value: item.internalNotes ?? '' })
          dispatchFields({ type: 'UPDATE', path: `${phasesPath}.${phaseIdx}.items.${itemIdx}.itemStatus`, value: 'not_started' })
          dispatchFields({ type: 'UPDATE', path: `${phasesPath}.${phaseIdx}.items.${itemIdx}.approvalStatus`, value: item.requiresApproval ? 'pending_approval' : 'not_needed' })
        }
      }

      showToast(`Loaded "${template.name}" — visit "Phases & Items" tab to review`)
    } catch {
      showToast('Failed to load template')
    }
    setLoadingTemplate(null)
  }, [id, addFieldRow, dispatchFields, showToast])

  // Check current phase count from form
  const phaseCount = (() => {
    let i = 0
    while (true) {
      const has = fields[`${phasesPath}.${i}.id`] !== undefined || fields[`${phasesPath}.${i}.phaseName`] !== undefined
      if (!has) break
      i++
    }
    return i
  })()

  // Count total items
  const totalItems = (() => {
    let total = 0
    let pi = 0
    while (true) {
      const hasPhase = fields[`${phasesPath}.${pi}.id`] !== undefined || fields[`${phasesPath}.${pi}.phaseName`] !== undefined
      if (!hasPhase) break
      let ii = 0
      while (true) {
        const hasItem = fields[`${phasesPath}.${pi}.items.${ii}.id`] !== undefined || fields[`${phasesPath}.${pi}.items.${ii}.itemName`] !== undefined
        if (!hasItem) break
        total++
        ii++
      }
      pi++
    }
    return total
  })()

  const hasContent = phaseCount > 0

  return (
    <div style={{ padding: '20px 4px 32px', fontFamily: 'Arial, sans-serif' }}>
      <style>{`
        .ltm-card {
          border: 1px solid #E5E7EB;
          border-radius: 8px;
          padding: 16px 20px;
          margin-bottom: 12px;
          background: #fff;
          transition: box-shadow 0.15s;
        }
        .ltm-card:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
        .ltm-btn {
          padding: 7px 16px;
          border-radius: 6px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          border: none;
          transition: background 0.15s;
        }
        .ltm-btn-primary { background: #2563EB; color: #fff; }
        .ltm-btn-primary:hover { background: #1D4ED8; }
        .ltm-btn-primary:disabled { background: #93C5FD; cursor: not-allowed; }
        .ltm-btn-outline { background: #fff; color: #374151; border: 1px solid #D1D5DB; }
        .ltm-btn-outline:hover { background: #F3F4F6; }
        .ltm-btn-danger { background: #fff; color: #DC2626; border: 1px solid #FECACA; }
        .ltm-btn-danger:hover { background: #FEF2F2; }
        .ltm-badge {
          display: inline-block;
          padding: 2px 8px;
          border-radius: 999px;
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.03em;
        }
      `}</style>

      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, background: '#111827', color: '#fff', padding: '10px 18px', borderRadius: 8, fontSize: 14, zIndex: 9999, boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
          {toast}
        </div>
      )}

      {/* Saved Templates — managed from the Client Timelines list view */}
      <div style={{ marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontWeight: 700, fontSize: 14, color: '#374151' }}>Load a Template</span>
        {hasContent && (
          <button
            className="ltm-btn ltm-btn-danger"
            onClick={() => {
              if (confirm(`Remove all ${phaseCount} phases and ${totalItems} items?`)) {
                clearAllPhases()
                showToast('Phases cleared')
              }
            }}
          >
            Clear all phases
          </button>
        )}
      </div>

      {loading ? (
        <div style={{ padding: 24, textAlign: 'center', color: '#9CA3AF', fontSize: 13 }}>Loading templates…</div>
      ) : templates.length === 0 ? (
        <div style={{ padding: 24, textAlign: 'center', color: '#9CA3AF', fontSize: 13, border: '1px dashed #E5E7EB', borderRadius: 8 }}>
          No saved templates yet. Create one via the Timeline Templates section.
        </div>
      ) : (
        templates.map(template => {
          const phaseCount = template.phases?.length ?? 0
          const itemCount = template.phases?.reduce((sum, p) => sum + (p.items?.length ?? 0), 0) ?? 0
          return (
            <div key={template.id} className="ltm-card">
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontWeight: 700, fontSize: 14 }}>{template.name}</span>
                    <span className="ltm-badge" style={{ background: '#F3F4F6', color: '#6B7280' }}>
                      {SERVICE_LABELS[template.serviceType] ?? template.serviceType}
                    </span>
                    {!template.description && (
                      <span style={{ fontSize: 11, color: '#9CA3AF' }}>{phaseCount} phases · {itemCount} items</span>
                    )}
                  </div>
                  {template.description && (
                    <p style={{ fontSize: 12, color: '#6B7280', margin: '0 0 8px' }}>{template.description}</p>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                  {!id ? (
                    <button className="ltm-btn ltm-btn-outline" disabled style={{ opacity: 0.6, fontSize: 12 }}>Save first</button>
                  ) : (
                    <button
                      className="ltm-btn ltm-btn-outline"
                      onClick={() => loadTemplate(template)}
                      disabled={!!loadingTemplate}
                      style={{ fontSize: 12 }}
                    >
                      {loadingTemplate === template.id.toString() ? 'Loading…' : 'Load'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })
      )}
    </div>
  )
}
