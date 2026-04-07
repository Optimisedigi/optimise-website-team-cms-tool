'use client'

import { useAllFormFields, useForm, useDocumentInfo } from '@payloadcms/ui'
import { useCallback, useMemo, useState, useEffect } from 'react'
import { ErrorBoundary } from './ErrorBoundary'

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

type ItemData = {
  itemName: string
  itemDescription: string
  itemStatus: string
  completedAt: string
  estimatedHours: number | null
  requiresApproval: boolean
  approvalStatus: string
  clientApprovedAt: string
  internalNotes: string
}

type PhaseData = {
  phaseName: string
  weekRange: string
  phaseDescription: string
  items: ItemData[]
}

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */

const ITEM_STATUSES = [
  { label: 'Not Started', value: 'not_started' },
  { label: 'In Progress', value: 'in_progress' },
  { label: 'Completed', value: 'completed' },
  { label: 'Skipped', value: 'skipped' },
]

const APPROVAL_STATUSES = [
  { label: 'Not needed', value: 'not_needed' },
  { label: 'In progress', value: 'in_progress' },
  { label: 'Action required', value: 'action_required' },
  { label: 'Awaiting approval', value: 'awaiting_approval' },
  { label: 'Pending (old)', value: 'pending_approval' },
  { label: 'Approved', value: 'approved' },
]

const STATUS_COLORS: Record<string, { bg: string; text: string; rowBg: string }> = {
  not_started: { bg: '#F3F4F6', text: '#6B7280', rowBg: 'transparent' },
  in_progress: { bg: '#DBEAFE', text: '#1D4ED8', rowBg: 'rgba(59,130,246,0.04)' },
  completed: { bg: '#D1FAE5', text: '#065F46', rowBg: 'rgba(16,185,129,0.04)' },
  skipped: { bg: '#FEF3C7', text: '#92400E', rowBg: 'rgba(156,163,175,0.04)' },
}

const APPROVAL_COLORS: Record<string, { bg: string; text: string }> = {
  not_needed: { bg: '#F3F4F6', text: '#9CA3AF' },
  in_progress: { bg: '#DBEAFE', text: '#1D4ED8' },
  action_required: { bg: '#FEE2E2', text: '#991B1B' },
  awaiting_approval: { bg: '#FEF3C7', text: '#92400E' },
  pending_approval: { bg: '#FEF3C7', text: '#92400E' },
  approved: { bg: '#D1FAE5', text: '#065F46' },
}

// Grid: # | Item | Description | Est. Hrs | Status | Approval | Notes
const GRID_COLS = '50px 2fr 1.5fr 60px 120px 110px 1.2fr 50px'

/* ------------------------------------------------------------------ */
/* Extract phases from flat form field map                             */
/* ------------------------------------------------------------------ */

function extractPhases(fields: Record<string, any>, basePath: string): PhaseData[] {
  const phases: PhaseData[] = []
  let i = 0
  while (true) {
    const has = fields[`${basePath}.${i}.phaseName`] !== undefined || fields[`${basePath}.${i}.id`] !== undefined
    if (!has) break
    const phase: PhaseData = {
      phaseName: fields[`${basePath}.${i}.phaseName`]?.value ?? '',
      weekRange: fields[`${basePath}.${i}.weekRange`]?.value ?? '',
      phaseDescription: fields[`${basePath}.${i}.phaseDescription`]?.value ?? '',
      items: [],
    }
    let j = 0
    while (true) {
      const hasItem = fields[`${basePath}.${i}.items.${j}.itemName`] !== undefined || fields[`${basePath}.${i}.items.${j}.id`] !== undefined
      if (!hasItem) break
      phase.items.push({
        itemName: fields[`${basePath}.${i}.items.${j}.itemName`]?.value ?? '',
        itemDescription: fields[`${basePath}.${i}.items.${j}.itemDescription`]?.value ?? '',
        itemStatus: fields[`${basePath}.${i}.items.${j}.itemStatus`]?.value ?? 'not_started',
        completedAt: fields[`${basePath}.${i}.items.${j}.completedAt`]?.value ?? '',
        estimatedHours: fields[`${basePath}.${i}.items.${j}.estimatedHours`]?.value ?? null,
        requiresApproval: !!fields[`${basePath}.${i}.items.${j}.requiresApproval`]?.value,
        approvalStatus: fields[`${basePath}.${i}.items.${j}.approvalStatus`]?.value ?? 'not_needed',
        clientApprovedAt: fields[`${basePath}.${i}.items.${j}.clientApprovedAt`]?.value ?? '',
        internalNotes: fields[`${basePath}.${i}.items.${j}.internalNotes`]?.value ?? '',
      })
      j++
    }
    phases.push(phase)
    i++
  }
  return phases
}

/* ------------------------------------------------------------------ */
/* Editable Text Cell                                                  */
/* ------------------------------------------------------------------ */

function EditableCell({ value, onSave, placeholder, style }: {
  value: string
  onSave: (v: string) => void
  placeholder?: string
  style?: React.CSSProperties
}) {
  const [local, setLocal] = useState(value)
  const [focused, setFocused] = useState(false)

  useEffect(() => {
    if (!focused) setLocal(value)
  }, [value, focused])

  return (
    <input
      type="text"
      className="ltw-input"
      style={style}
      value={local}
      placeholder={placeholder}
      onChange={(e) => setLocal(e.target.value)}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false)
        if (local !== value) onSave(local)
      }}
    />
  )
}

/* ------------------------------------------------------------------ */
/* Main Worksheet Component                                            */
/* ------------------------------------------------------------------ */

export default function ClientTimelineWorksheetWrapper(props: any) {
  return (
    <ErrorBoundary>
      <ClientTimelineWorksheetInner {...props} />
    </ErrorBoundary>
  );
}

function ClientTimelineWorksheetInner(props: any) {
  const path = props?.path || 'phases'
  const schemaPath = props?.schemaPath || 'phases'
  const [fields, dispatchFields] = useAllFormFields()
  const { addFieldRow, removeFieldRow, moveFieldRow } = useForm()
  const [fullscreen, setFullscreen] = useState(false)

  useEffect(() => {
    if (!fullscreen) return
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setFullscreen(false) }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [fullscreen])

  useEffect(() => {
    document.body.style.overflow = fullscreen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [fullscreen])

  const phases = useMemo(() => extractPhases(fields, path), [fields, path])

  const updateValue = useCallback(
    (fieldPath: string, value: any) => {
      dispatchFields({ type: 'UPDATE', path: fieldPath, value })
    },
    [dispatchFields],
  )

  const handleAddPhase = useCallback(() => {
    addFieldRow({ path, schemaPath, rowIndex: phases.length })
  }, [addFieldRow, path, schemaPath, phases.length])

  const handleRemovePhase = useCallback(
    (index: number) => {
      if (!confirm('Remove this phase and all its items?')) return
      removeFieldRow({ path, rowIndex: index })
    },
    [removeFieldRow, path],
  )

  const handleAddItem = useCallback(
    (phaseIndex: number) => {
      const itemsPath = `${path}.${phaseIndex}.items`
      const itemsSchemaPath = `${schemaPath}.items`
      const itemCount = phases[phaseIndex]?.items?.length || 0
      addFieldRow({ path: itemsPath, schemaPath: itemsSchemaPath, rowIndex: itemCount })
    },
    [addFieldRow, path, schemaPath, phases],
  )

  const handleMovePhase = useCallback(
    (fromIndex: number, direction: 'up' | 'down') => {
      const toIndex = direction === 'up' ? fromIndex - 1 : fromIndex + 1
      if (toIndex < 0 || toIndex >= phases.length) return
      moveFieldRow({ path, moveFromIndex: fromIndex, moveToIndex: toIndex })
    },
    [moveFieldRow, path, phases.length],
  )

  const handleRemoveItem = useCallback(
    (phaseIndex: number, itemIndex: number) => {
      removeFieldRow({ path: `${path}.${phaseIndex}.items`, rowIndex: itemIndex })
    },
    [removeFieldRow, path],
  )

  const handleMoveItem = useCallback(
    (phaseIndex: number, fromIndex: number, direction: 'up' | 'down') => {
      const itemsPath = `${path}.${phaseIndex}.items`
      const toIndex = direction === 'up' ? fromIndex - 1 : fromIndex + 1
      const items = phases[phaseIndex]?.items || []
      if (toIndex < 0 || toIndex >= items.length) return
      moveFieldRow({ path: itemsPath, moveFromIndex: fromIndex, moveToIndex: toIndex })
    },
    [moveFieldRow, path, phases],
  )

  const handleItemStatusChange = useCallback(
    async (pi: number, ii: number, newStatus: string) => {
      // Get item ID from form fields
      const itemIdField = fields[`${path}.${pi}.items.${ii}.id`]
      const itemId = itemIdField?.value as string | undefined

      // Update local form state immediately
      updateValue(`${path}.${pi}.items.${ii}.itemStatus`, newStatus)
      if (newStatus === 'completed') {
        updateValue(`${path}.${pi}.items.${ii}.completedAt`, new Date().toISOString())
      }

      // Persist to DB via PATCH API if we have a document ID and item ID
      const docId = props?.id ?? props?.documentId
      if (docId && itemId) {
        try {
          const res = await fetch(`/api/client-timelines/${docId}/item`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phaseIndex: pi, itemId, itemStatus: newStatus }),
          })
          if (!res.ok) {
            console.error('[worksheet] Failed to persist item status:', await res.text())
          }
        } catch (e) {
          console.error('[worksheet] Error persisting item status:', e)
        }
      }
    },
    [updateValue, path, fields, props],
  )

  // Stats
  const stats = useMemo(() => {
    let total = 0, completed = 0, inProgress = 0
    for (const phase of phases) {
      for (const item of phase.items) {
        total++
        if (item.itemStatus === 'completed' || item.itemStatus === 'skipped') completed++
        else if (item.itemStatus === 'in_progress') inProgress++
      }
    }
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0
    return { total, completed, inProgress, pct }
  }, [phases])

  const containerStyle: React.CSSProperties = fullscreen
    ? { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10000, background: 'var(--theme-elevation-0, #fff)', padding: '20px 28px', overflow: 'auto' }
    : { margin: '20px 0' }

  return (
    <div style={containerStyle}>
      <style>{`
        .ltw-input {
          width: 100%;
          padding: 4px 6px;
          border: 1px solid transparent;
          border-radius: 3px;
          font-size: 12px;
          font-family: inherit;
          background: transparent;
          color: inherit;
          outline: none;
          transition: border-color 0.15s, box-shadow 0.15s;
          box-sizing: border-box;
        }
        .ltw-input:hover { border-color: var(--theme-elevation-200); }
        .ltw-input:focus {
          border-color: #3B82F6;
          box-shadow: 0 0 0 1px rgba(59,130,246,0.3);
          background: var(--theme-elevation-0);
        }
        .ltw-input-phase {
          font-weight: 600;
          color: #1E40AF;
        }
        .ltw-input-phase:hover { border-color: rgba(30,64,175,0.3); }
        .ltw-input-phase:focus {
          border-color: #1E40AF;
          background: rgba(255,255,255,0.5);
        }
        .ltw-select {
          width: 100%;
          padding: 3px 4px;
          border: 1px solid transparent;
          border-radius: 3px;
          font-size: 11px;
          font-family: inherit;
          background: transparent;
          outline: none;
          cursor: pointer;
          transition: border-color 0.15s;
          box-sizing: border-box;
        }
        .ltw-select:hover { border-color: var(--theme-elevation-200); }
        .ltw-select:focus { border-color: #3B82F6; box-shadow: 0 0 0 1px rgba(59,130,246,0.3); }
        .ltw-btn {
          padding: 2px 6px;
          border: none;
          background: transparent;
          cursor: pointer;
          font-size: 11px;
          color: var(--theme-elevation-400);
          border-radius: 3px;
          transition: background 0.15s, color 0.15s;
          line-height: 1;
        }
        .ltw-btn:hover { background: var(--theme-elevation-100); color: var(--theme-elevation-700); }
        .ltw-btn-danger:hover { background: #FEE2E2 !important; color: #DC2626 !important; }
        .ltw-btn-add:hover { background: #D1FAE5 !important; color: #059669 !important; }
        .ltw-item-row:hover { background: var(--theme-elevation-50) !important; }
        .ltw-approval-badge {
          display: inline-block;
          padding: 2px 7px;
          border-radius: 4px;
          font-size: 10px;
          font-weight: 600;
        }
      `}</style>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <label style={{ fontSize: fullscreen ? 16 : 13, fontWeight: 600, color: 'var(--theme-elevation-800)' }}>
            Phases &amp; Items
          </label>
          {stats.total > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 120, height: 6, background: 'var(--theme-elevation-150)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ width: `${stats.pct}%`, height: '100%', background: stats.pct === 100 ? '#10B981' : '#3B82F6', borderRadius: 3, transition: 'width 0.3s ease' }} />
              </div>
              <span style={{ fontSize: 11, color: 'var(--theme-elevation-500)', fontWeight: 600 }}>
                {stats.completed}/{stats.total} ({stats.pct}%)
              </span>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button type="button" onClick={handleAddPhase} style={{ padding: '6px 14px', fontSize: 12, fontWeight: 600, background: 'var(--theme-elevation-100)', border: '1px solid var(--theme-elevation-200)', borderRadius: 6, cursor: 'pointer', color: 'var(--theme-elevation-700)' }}>
            + Add Phase
          </button>
          <button type="button" onClick={() => setFullscreen(!fullscreen)} style={{ padding: '6px 12px', fontSize: 12, fontWeight: 600, background: fullscreen ? '#EF4444' : 'var(--theme-elevation-100)', border: fullscreen ? '1px solid #DC2626' : '1px solid var(--theme-elevation-200)', borderRadius: 6, cursor: 'pointer', color: fullscreen ? '#fff' : 'var(--theme-elevation-700)', display: 'flex', alignItems: 'center', gap: 4 }}>
            {fullscreen ? <><span style={{ fontSize: 14, lineHeight: 1 }}>&#x2715;</span> Close</> : <><span style={{ fontSize: 14, lineHeight: 1 }}>&#x26F6;</span> Expand</>}
          </button>
        </div>
      </div>

      {phases.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--theme-elevation-400)', fontSize: 13, border: '2px dashed var(--theme-elevation-150)', borderRadius: 8 }}>
          No phases yet. Click &ldquo;Add Phase&rdquo; to start, or go to the <strong>Templates</strong> tab to load a preset.
        </div>
      ) : (
        <div style={{ border: '1px solid var(--theme-elevation-200)', borderRadius: 8, overflow: 'hidden' }}>
          {/* Column headers */}
          <div style={{ display: 'grid', gridTemplateColumns: GRID_COLS, background: 'var(--theme-elevation-50)', borderBottom: '2px solid var(--theme-elevation-200)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--theme-elevation-500)' }}>
            {['#', 'Item', 'Description', 'Hrs', 'Status', 'Approval', 'Team Notes', ''].map((col, idx) => (
              <div key={idx} style={{ padding: '8px 6px', borderRight: idx < 7 ? '1px solid var(--theme-elevation-150)' : 'none' }}>{col}</div>
            ))}
          </div>

          {phases.map((phase, pi) => {
            const phaseDone = phase.items.filter(i => i.itemStatus === 'completed' || i.itemStatus === 'skipped').length

            return (
              <div key={pi}>
                {/* Phase header row */}
                <div style={{ display: 'grid', gridTemplateColumns: '50px 2fr 1.5fr auto', background: '#EBF5FF', borderBottom: '1px solid var(--theme-elevation-150)', borderTop: pi > 0 ? '2px solid var(--theme-elevation-200)' : 'none', alignItems: 'center' }}>
                  <div style={{ padding: '8px 6px', fontWeight: 700, color: '#1E40AF', fontSize: 13, textAlign: 'center', borderRight: '1px solid rgba(30,64,175,0.15)' }}>
                    {pi + 1}
                  </div>
                  <div style={{ padding: '4px 6px', borderRight: '1px solid rgba(30,64,175,0.15)', display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <EditableCell
                      value={phase.phaseName}
                      onSave={(v) => updateValue(`${path}.${pi}.phaseName`, v)}
                      placeholder="Phase name..."
                      style={{ fontWeight: 600, color: '#1E40AF', fontSize: 13 }}
                    />
                    <EditableCell
                      value={phase.weekRange}
                      onSave={(v) => updateValue(`${path}.${pi}.weekRange`, v)}
                      placeholder="Week range (e.g. Weeks 1–2)..."
                      style={{ fontSize: 10, color: '#6B7280' }}
                    />
                  </div>
                  <div style={{ padding: '4px 6px', borderRight: '1px solid rgba(30,64,175,0.15)' }}>
                    <EditableCell
                      value={phase.phaseDescription}
                      onSave={(v) => updateValue(`${path}.${pi}.phaseDescription`, v)}
                      placeholder="Phase description..."
                      style={{ fontWeight: 400, fontSize: 11, color: '#6B7280' }}
                    />
                  </div>
                  <div style={{ padding: '4px 8px', display: 'flex', gap: 2, alignItems: 'center' }}>
                    {pi > 0 && <button type="button" className="ltw-btn" onClick={() => handleMovePhase(pi, 'up')} title="Move phase up">&#x25B2;</button>}
                    {pi < phases.length - 1 && <button type="button" className="ltw-btn" onClick={() => handleMovePhase(pi, 'down')} title="Move phase down">&#x25BC;</button>}
                    <button type="button" className="ltw-btn ltw-btn-add" onClick={() => handleAddItem(pi)} title="Add item to this phase" style={{ fontWeight: 600 }}>+ Item</button>
                    <button type="button" className="ltw-btn ltw-btn-danger" onClick={() => handleRemovePhase(pi)} title="Remove phase">&#x2715;</button>
                  </div>
                </div>

                {/* Item rows */}
                {phase.items.map((item, ii) => {
                  const statusColor = STATUS_COLORS[item.itemStatus] || STATUS_COLORS.not_started
                  const approvalColor = APPROVAL_COLORS[item.approvalStatus] || APPROVAL_COLORS.not_needed
                  const isCompleted = item.itemStatus === 'completed' || item.itemStatus === 'skipped'

                  return (
                    <div key={ii} className="ltw-item-row" style={{ display: 'grid', gridTemplateColumns: GRID_COLS, borderBottom: '1px solid var(--theme-elevation-100)', alignItems: 'center', background: statusColor.rowBg, opacity: isCompleted ? 0.65 : 1 }}>
                      {/* Order */}
                      <div style={{ padding: '6px', color: 'var(--theme-elevation-400)', fontSize: 11, textAlign: 'center', borderRight: '1px solid var(--theme-elevation-100)' }}>
                        {pi + 1}.{ii + 1}
                      </div>

                      {/* Item Name */}
                      <div style={{ padding: '3px 6px', borderRight: '1px solid var(--theme-elevation-100)' }}>
                        <EditableCell
                          value={item.itemName}
                          onSave={(v) => updateValue(`${path}.${pi}.items.${ii}.itemName`, v)}
                          placeholder="Item name..."
                          style={isCompleted ? { textDecoration: 'line-through' } : undefined}
                        />
                        {item.requiresApproval && (
                          <span style={{ display: 'inline-block', marginTop: 2, fontSize: 9, background: '#FEF3C7', color: '#92400E', padding: '1px 5px', borderRadius: 3, fontWeight: 600 }}>
                            &#x2714; Needs approval
                          </span>
                        )}
                      </div>

                      {/* Description */}
                      <div style={{ padding: '3px 6px', borderRight: '1px solid var(--theme-elevation-100)' }}>
                        <EditableCell
                          value={item.itemDescription}
                          onSave={(v) => updateValue(`${path}.${pi}.items.${ii}.itemDescription`, v)}
                          placeholder="Description..."
                          style={{ fontSize: 11, color: 'var(--theme-elevation-500)' }}
                        />
                      </div>

                      {/* Estimated Hours */}
                      <div style={{ padding: '3px 4px', borderRight: '1px solid var(--theme-elevation-100)', textAlign: 'center' }}>
                        <input
                          type="number"
                          min="0"
                          step="0.5"
                          value={item.estimatedHours != null ? item.estimatedHours : ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            const num = parseFloat(val);
                            updateValue(`${path}.${pi}.items.${ii}.estimatedHours`, val === '' ? null : (isNaN(num) ? null : num));
                          }}
                          style={{ width: '100%', maxWidth: 44, padding: '2px 4px', border: '1px solid var(--theme-elevation-150)', borderRadius: 4, fontSize: 11, textAlign: 'center', background: 'transparent' }}
                          title="Estimated hours"
                        />
                      </div>

                      {/* Status */}
                      <div style={{ padding: '3px 4px', borderRight: '1px solid var(--theme-elevation-100)' }}>
                        <select
                          className="ltw-select"
                          value={item.itemStatus}
                          onChange={(e) => handleItemStatusChange(pi, ii, e.target.value)}
                          style={{ background: statusColor.bg, color: statusColor.text, fontWeight: 600, borderRadius: 4, padding: '3px 6px' }}
                        >
                          {ITEM_STATUSES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </div>

                      {/* Approval */}
                      <div style={{ padding: '3px 4px', borderRight: '1px solid var(--theme-elevation-100)' }}>
                        <select
                          className="ltw-select"
                          value={item.approvalStatus}
                          onChange={async (e) => {
                            const newApproval = e.target.value
                            updateValue(`${path}.${pi}.items.${ii}.approvalStatus`, newApproval)
                            if (newApproval === 'approved') {
                              updateValue(`${path}.${pi}.items.${ii}.clientApprovedAt`, new Date().toISOString())
                            }
                            // Persist to DB
                            const itemId = fields[`${path}.${pi}.items.${ii}.id`]?.value as string | undefined
                            const docId = props?.id ?? props?.documentId
                            if (docId && itemId) {
                              try {
                                await fetch(`/api/client-timelines/${docId}/item`, {
                                  method: 'PATCH',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ phaseIndex: pi, itemId, approvalStatus: newApproval }),
                                })
                              } catch (e) {
                                console.error('[worksheet] Error persisting approval status:', e)
                              }
                            }
                          }}
                          style={{ background: approvalColor.bg, color: approvalColor.text, fontWeight: 600, borderRadius: 4, padding: '3px 6px' }}
                        >
                          {APPROVAL_STATUSES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </div>

                      {/* Internal Notes */}
                      <div style={{ padding: '3px 6px', borderRight: '1px solid var(--theme-elevation-100)' }}>
                        <EditableCell
                          value={item.internalNotes}
                          onSave={(v) => updateValue(`${path}.${pi}.items.${ii}.internalNotes`, v)}
                          placeholder="Team notes..."
                          style={{ fontSize: 11, color: 'var(--theme-elevation-500)' }}
                        />
                      </div>

                      {/* Actions */}
                      <div style={{ padding: '3px 4px', display: 'flex', gap: 2, alignItems: 'center', justifyContent: 'center' }}>
                        {ii > 0 && <button type="button" className="ltw-btn" onClick={() => handleMoveItem(pi, ii, 'up')} title="Move up" style={{ fontSize: 9 }}>&#x25B2;</button>}
                        {ii < phase.items.length - 1 && <button type="button" className="ltw-btn" onClick={() => handleMoveItem(pi, ii, 'down')} title="Move down" style={{ fontSize: 9 }}>&#x25BC;</button>}
                        <button type="button" className="ltw-btn ltw-btn-danger" onClick={() => handleRemoveItem(pi, ii)} title="Remove item">&#x2715;</button>
                      </div>
                    </div>
                  )
                })}

                {phase.items.length === 0 && (
                  <div style={{ padding: '12px 56px', color: 'var(--theme-elevation-400)', fontSize: 12, fontStyle: 'italic', borderBottom: '1px solid var(--theme-elevation-100)' }}>
                    No items yet. Click &ldquo;+ Item&rdquo; to add one.
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {phases.length > 0 && (
        <div style={{ marginTop: 8, fontSize: 11, color: 'var(--theme-elevation-400)', display: 'flex', gap: 16 }}>
          <span>{phases.length} phase{phases.length !== 1 ? 's' : ''}, {stats.total} total items</span>
          {stats.completed > 0 && <span style={{ color: '#059669' }}>&#x2713; {stats.completed} completed</span>}
          {stats.inProgress > 0 && <span style={{ color: '#2563EB' }}>&#x25CF; {stats.inProgress} in progress</span>}
        </div>
      )}
    </div>
  )
}
