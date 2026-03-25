'use client'

import { useAllFormFields, useForm } from '@payloadcms/ui'
import { useCallback, useMemo, useState, useEffect } from 'react'

type StepData = {
  stepName: string
  stepDescription: string
  stepType: string
  stepStatus: string
  defaultAssignee: string
  estimatedDuration: string
  notes: string
  completedAt: string
}

type PhaseData = {
  phaseName: string
  phaseDescription: string
  phaseStatus: string
  steps: StepData[]
}

const STEP_TYPES = [
  { label: '-', value: '' },
  { label: 'Action', value: 'action' },
  { label: 'Communication', value: 'communication' },
  { label: 'Decision', value: 'decision' },
  { label: 'Automated', value: 'automated' },
  { label: 'Milestone', value: 'milestone' },
]

const ASSIGNEES = [
  { label: '-', value: '' },
  { label: 'Account Mgr', value: 'account_manager' },
  { label: 'Strategist', value: 'strategist' },
  { label: 'Developer', value: 'developer' },
  { label: 'Founder', value: 'founder' },
  { label: 'Client', value: 'client' },
  { label: 'System', value: 'system' },
]

const STEP_STATUSES = [
  { label: 'Not Started', value: 'not_started' },
  { label: 'In Progress', value: 'in_progress' },
  { label: 'Completed', value: 'completed' },
  { label: 'Skipped', value: 'skipped' },
]

const PHASE_STATUSES = [
  { label: 'Not Started', value: 'not_started' },
  { label: 'In Progress', value: 'in_progress' },
  { label: 'Completed', value: 'completed' },
  { label: 'Skipped', value: 'skipped' },
]

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  not_started: { bg: '#F3F4F6', text: '#6B7280' },
  in_progress: { bg: '#DBEAFE', text: '#1D4ED8' },
  completed: { bg: '#D1FAE5', text: '#065F46' },
  skipped: { bg: '#FEF3C7', text: '#92400E' },
}

const TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  action: { bg: '#DBEAFE', text: '#1E40AF' },
  communication: { bg: '#FCE7F3', text: '#9D174D' },
  decision: { bg: '#FEF3C7', text: '#92400E' },
  automated: { bg: '#D1FAE5', text: '#065F46' },
  milestone: { bg: '#EDE9FE', text: '#5B21B6' },
}

const GRID_COLS = '40px 1.2fr 1fr 90px 90px 110px 1fr 60px'

function extractPhases(fields: Record<string, any>, basePath: string): PhaseData[] {
  const phases: PhaseData[] = []
  let i = 0
  while (true) {
    const has = fields[`${basePath}.${i}.phaseName`] !== undefined || fields[`${basePath}.${i}.id`] !== undefined
    if (!has) break
    const phase: PhaseData = {
      phaseName: fields[`${basePath}.${i}.phaseName`]?.value ?? '',
      phaseDescription: fields[`${basePath}.${i}.phaseDescription`]?.value ?? '',
      phaseStatus: fields[`${basePath}.${i}.phaseStatus`]?.value ?? 'not_started',
      steps: [],
    }
    let j = 0
    while (true) {
      const hasStep = fields[`${basePath}.${i}.steps.${j}.stepName`] !== undefined || fields[`${basePath}.${i}.steps.${j}.id`] !== undefined
      if (!hasStep) break
      phase.steps.push({
        stepName: fields[`${basePath}.${i}.steps.${j}.stepName`]?.value ?? '',
        stepDescription: fields[`${basePath}.${i}.steps.${j}.stepDescription`]?.value ?? '',
        stepType: fields[`${basePath}.${i}.steps.${j}.stepType`]?.value ?? '',
        stepStatus: fields[`${basePath}.${i}.steps.${j}.stepStatus`]?.value ?? 'not_started',
        defaultAssignee: fields[`${basePath}.${i}.steps.${j}.defaultAssignee`]?.value ?? '',
        estimatedDuration: fields[`${basePath}.${i}.steps.${j}.estimatedDuration`]?.value ?? '',
        notes: fields[`${basePath}.${i}.steps.${j}.notes`]?.value ?? '',
        completedAt: fields[`${basePath}.${i}.steps.${j}.completedAt`]?.value ?? '',
      })
      j++
    }
    phases.push(phase)
    i++
  }
  return phases
}

function EditableCell({ value, onSave, placeholder, style }: {
  value: string; onSave: (v: string) => void; placeholder?: string; style?: React.CSSProperties
}) {
  const [local, setLocal] = useState(value)
  const [focused, setFocused] = useState(false)
  useEffect(() => { if (!focused) setLocal(value) }, [value, focused])
  return (
    <input
      type="text"
      style={{
        width: '100%', padding: '4px 6px', border: '1px solid transparent', borderRadius: 3,
        fontSize: 12, background: 'transparent', color: 'inherit', outline: 'none',
        boxSizing: 'border-box', transition: 'border-color 0.15s', ...style,
      }}
      value={local}
      placeholder={placeholder}
      onChange={(e) => setLocal(e.target.value)}
      onFocus={() => setFocused(true)}
      onBlur={() => { setFocused(false); if (local !== value) onSave(local) }}
      onMouseOver={(e) => (e.currentTarget.style.borderColor = 'var(--theme-elevation-200)')}
      onMouseOut={(e) => { if (!focused) e.currentTarget.style.borderColor = 'transparent' }}
    />
  )
}

function ClientProcessWorksheet(props: any) {
  const path = props?.path || 'phases'
  const schemaPath = props?.schemaPath || 'phases'
  const [fields, dispatchFields] = useAllFormFields()
  const { addFieldRow, removeFieldRow } = useForm()

  const phases = useMemo(() => extractPhases(fields, path), [fields, path])

  const updateValue = useCallback(
    (fieldPath: string, value: any) => { dispatchFields({ type: 'UPDATE', path: fieldPath, value }) },
    [dispatchFields],
  )

  const handleAddPhase = useCallback(() => {
    addFieldRow({ path, schemaPath, rowIndex: phases.length })
  }, [addFieldRow, path, schemaPath, phases.length])

  const handleRemovePhase = useCallback(
    (index: number) => { if (confirm('Remove this phase and all its steps?')) removeFieldRow({ path, rowIndex: index }) },
    [removeFieldRow, path],
  )

  const handleAddStep = useCallback(
    (phaseIndex: number) => {
      const stepsPath = `${path}.${phaseIndex}.steps`
      const stepsSchemaPath = `${schemaPath}.steps`
      addFieldRow({ path: stepsPath, schemaPath: stepsSchemaPath, rowIndex: phases[phaseIndex]?.steps?.length || 0 })
    },
    [addFieldRow, path, schemaPath, phases],
  )

  const handleRemoveStep = useCallback(
    (phaseIndex: number, stepIndex: number) => {
      removeFieldRow({ path: `${path}.${phaseIndex}.steps`, rowIndex: stepIndex })
    },
    [removeFieldRow, path],
  )

  // Compute completion stats
  const totalSteps = phases.reduce((sum, p) => sum + p.steps.length, 0)
  const completedSteps = phases.reduce((sum, p) => sum + p.steps.filter(s => s.stepStatus === 'completed' || s.stepStatus === 'skipped').length, 0)
  const completionPct = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0

  return (
    <div style={{ margin: '20px 0' }}>
      <style>{`
        .cpw-row:hover { background: var(--theme-elevation-50) !important; }
        .cpw-select {
          width: 100%; padding: 3px 4px; border: 1px solid transparent; border-radius: 3px;
          font-size: 11px; background: transparent; color: inherit; outline: none; cursor: pointer;
          box-sizing: border-box; transition: border-color 0.15s;
        }
        .cpw-select:hover { border-color: var(--theme-elevation-200); }
        .cpw-select:focus { border-color: #3B82F6; box-shadow: 0 0 0 1px rgba(59,130,246,0.3); }
        .cpw-btn {
          padding: 2px 6px; border: none; background: transparent; cursor: pointer;
          font-size: 11px; color: var(--theme-elevation-400); border-radius: 3px;
          transition: background 0.15s, color 0.15s; line-height: 1;
        }
        .cpw-btn:hover { background: var(--theme-elevation-100); color: var(--theme-elevation-700); }
        .cpw-btn-danger:hover { background: #FEE2E2 !important; color: #DC2626 !important; }
        .cpw-btn-add:hover { background: #D1FAE5 !important; color: #059669 !important; }
      `}</style>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--theme-elevation-800)' }}>Phases & Steps</span>
          <span style={{ fontSize: 12, color: 'var(--theme-elevation-400)', marginLeft: 10 }}>
            {completedSteps}/{totalSteps} steps · {completionPct}%
          </span>
        </div>
        <button
          type="button" onClick={handleAddPhase}
          style={{
            padding: '6px 14px', fontSize: 12, fontWeight: 600,
            background: 'var(--theme-elevation-100)', border: '1px solid var(--theme-elevation-200)',
            borderRadius: 6, cursor: 'pointer', color: 'var(--theme-elevation-700)',
          }}
        >
          + Add Phase
        </button>
      </div>

      {/* Progress bar */}
      {totalSteps > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ width: '100%', height: 6, background: 'var(--theme-elevation-100)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ width: `${completionPct}%`, height: '100%', background: completionPct === 100 ? '#10B981' : '#3B82F6', borderRadius: 3, transition: 'width 0.3s' }} />
          </div>
        </div>
      )}

      {phases.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--theme-elevation-400)', fontSize: 13, border: '2px dashed var(--theme-elevation-150)', borderRadius: 8 }}>
          No phases yet. Click &ldquo;Add Phase&rdquo; to start.
        </div>
      ) : (
        <div style={{ border: '1px solid var(--theme-elevation-200)', borderRadius: 8, overflow: 'hidden' }}>
          {/* Column headers */}
          <div style={{
            display: 'grid', gridTemplateColumns: GRID_COLS,
            background: 'var(--theme-elevation-50)', borderBottom: '2px solid var(--theme-elevation-200)',
            fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--theme-elevation-500)',
          }}>
            {['#', 'Name', 'Description', 'Type', 'Assignee', 'Status', 'Notes', ''].map((col, idx) => (
              <div key={idx} style={{ padding: '8px 6px', borderRight: idx < 7 ? '1px solid var(--theme-elevation-150)' : 'none' }}>{col}</div>
            ))}
          </div>

          {/* Phases and steps */}
          {phases.map((phase, pi) => {
            const phaseStatusColor = STATUS_COLORS[phase.phaseStatus] || STATUS_COLORS.not_started
            const phaseCompleted = phase.steps.filter(s => s.stepStatus === 'completed' || s.stepStatus === 'skipped').length

            return (
              <div key={pi}>
                {/* Phase header */}
                <div style={{
                  display: 'grid', gridTemplateColumns: '40px 1.2fr 1fr auto',
                  background: '#EBF5FF', borderBottom: '1px solid var(--theme-elevation-150)',
                  borderTop: pi > 0 ? '2px solid var(--theme-elevation-200)' : 'none',
                  alignItems: 'center',
                }}>
                  <div style={{ padding: '8px 6px', fontWeight: 700, color: '#1E40AF', fontSize: 13, textAlign: 'center', borderRight: '1px solid rgba(30,64,175,0.15)' }}>
                    {pi + 1}
                  </div>
                  <div style={{ padding: '4px 6px', borderRight: '1px solid rgba(30,64,175,0.15)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <EditableCell
                      value={phase.phaseName}
                      onSave={(v) => updateValue(`${path}.${pi}.phaseName`, v)}
                      placeholder="Phase name..."
                      style={{ fontWeight: 600, color: '#1E40AF' }}
                    />
                    <span style={{
                      fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4, whiteSpace: 'nowrap',
                      background: phaseStatusColor.bg, color: phaseStatusColor.text, textTransform: 'uppercase',
                    }}>
                      {phaseCompleted}/{phase.steps.length}
                    </span>
                    <select
                      className="cpw-select"
                      value={phase.phaseStatus}
                      onChange={(e) => updateValue(`${path}.${pi}.phaseStatus`, e.target.value)}
                      style={{ width: 110, fontSize: 10, fontWeight: 600, color: phaseStatusColor.text, background: phaseStatusColor.bg, borderRadius: 4 }}
                    >
                      {PHASE_STATUSES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                  <div style={{ padding: '4px 6px', borderRight: '1px solid rgba(30,64,175,0.15)' }}>
                    <EditableCell
                      value={phase.phaseDescription}
                      onSave={(v) => updateValue(`${path}.${pi}.phaseDescription`, v)}
                      placeholder="Phase description..."
                      style={{ fontWeight: 400, fontSize: 11 }}
                    />
                  </div>
                  <div style={{ padding: '4px 8px', display: 'flex', gap: 2, alignItems: 'center' }}>
                    <button type="button" className="cpw-btn cpw-btn-add" onClick={() => handleAddStep(pi)} title="Add step" style={{ fontWeight: 600 }}>+ Step</button>
                    <button type="button" className="cpw-btn cpw-btn-danger" onClick={() => handleRemovePhase(pi)} title="Remove phase">✕</button>
                  </div>
                </div>

                {/* Step rows */}
                {phase.steps.map((step, si) => {
                  const stepStatusColor = STATUS_COLORS[step.stepStatus] || STATUS_COLORS.not_started
                  const isCompleted = step.stepStatus === 'completed' || step.stepStatus === 'skipped'

                  return (
                    <div key={si} className="cpw-row" style={{
                      display: 'grid', gridTemplateColumns: GRID_COLS,
                      borderBottom: '1px solid var(--theme-elevation-100)', alignItems: 'center',
                      opacity: isCompleted ? 0.65 : 1,
                    }}>
                      {/* # */}
                      <div style={{ padding: '6px', color: 'var(--theme-elevation-400)', fontSize: 11, textAlign: 'center', borderRight: '1px solid var(--theme-elevation-100)' }}>
                        {pi + 1}.{si + 1}
                      </div>
                      {/* Name */}
                      <div style={{ padding: '3px 6px', borderRight: '1px solid var(--theme-elevation-100)' }}>
                        <EditableCell value={step.stepName} onSave={(v) => updateValue(`${path}.${pi}.steps.${si}.stepName`, v)} placeholder="Step name..."
                          style={isCompleted ? { textDecoration: 'line-through' } : undefined} />
                      </div>
                      {/* Description */}
                      <div style={{ padding: '3px 6px', borderRight: '1px solid var(--theme-elevation-100)' }}>
                        <EditableCell value={step.stepDescription} onSave={(v) => updateValue(`${path}.${pi}.steps.${si}.stepDescription`, v)} placeholder="Description..." style={{ fontSize: 11, color: 'var(--theme-elevation-500)' }} />
                      </div>
                      {/* Type */}
                      <div style={{ padding: '3px 4px', borderRight: '1px solid var(--theme-elevation-100)' }}>
                        <select className="cpw-select" value={step.stepType} onChange={(e) => updateValue(`${path}.${pi}.steps.${si}.stepType`, e.target.value)}
                          style={step.stepType && TYPE_COLORS[step.stepType] ? { background: TYPE_COLORS[step.stepType].bg, color: TYPE_COLORS[step.stepType].text, fontWeight: 600, borderRadius: 4 } : undefined}>
                          {STEP_TYPES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </div>
                      {/* Assignee */}
                      <div style={{ padding: '3px 4px', borderRight: '1px solid var(--theme-elevation-100)' }}>
                        <select className="cpw-select" value={step.defaultAssignee} onChange={(e) => updateValue(`${path}.${pi}.steps.${si}.defaultAssignee`, e.target.value)}>
                          {ASSIGNEES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </div>
                      {/* Status */}
                      <div style={{ padding: '3px 4px', borderRight: '1px solid var(--theme-elevation-100)' }}>
                        <select className="cpw-select" value={step.stepStatus}
                          onChange={(e) => {
                            updateValue(`${path}.${pi}.steps.${si}.stepStatus`, e.target.value)
                            if (e.target.value === 'completed') {
                              updateValue(`${path}.${pi}.steps.${si}.completedAt`, new Date().toISOString())
                            }
                          }}
                          style={{ background: stepStatusColor.bg, color: stepStatusColor.text, fontWeight: 600, borderRadius: 4 }}>
                          {STEP_STATUSES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </div>
                      {/* Notes */}
                      <div style={{ padding: '3px 6px', borderRight: '1px solid var(--theme-elevation-100)' }}>
                        <EditableCell value={step.notes} onSave={(v) => updateValue(`${path}.${pi}.steps.${si}.notes`, v)} placeholder="Notes..." style={{ fontSize: 11, color: 'var(--theme-elevation-500)' }} />
                      </div>
                      {/* Actions */}
                      <div style={{ padding: '3px 4px', display: 'flex', gap: 2, justifyContent: 'center' }}>
                        <button type="button" className="cpw-btn cpw-btn-danger" onClick={() => handleRemoveStep(pi, si)} title="Remove step">✕</button>
                      </div>
                    </div>
                  )
                })}

                {phase.steps.length === 0 && (
                  <div style={{ padding: '12px 46px', color: 'var(--theme-elevation-400)', fontSize: 12, fontStyle: 'italic', borderBottom: '1px solid var(--theme-elevation-100)' }}>
                    No steps — click &ldquo;+ Step&rdquo; to add one
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default ClientProcessWorksheet
