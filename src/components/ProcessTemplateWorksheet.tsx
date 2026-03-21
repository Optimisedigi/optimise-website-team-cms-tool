'use client'

import { useAllFormFields, useForm } from '@payloadcms/ui'
import { useCallback, useMemo, useState, useEffect, useRef } from 'react'

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

type StepData = {
  stepName: string
  stepDescription: string
  stepType: string
  isAutomatable: boolean
  automationNotes: string
  defaultAssignee: string
  estimatedDuration: string
  emailTemplateSubject: string
  emailTemplateBody: string
  reminderDays: number | null
  requiredBeforeNext: boolean
}

type PhaseData = {
  phaseName: string
  phaseDescription: string
  steps: StepData[]
}

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */

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

const TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  action: { bg: '#DBEAFE', text: '#1E40AF' },
  communication: { bg: '#FCE7F3', text: '#9D174D' },
  decision: { bg: '#FEF3C7', text: '#92400E' },
  automated: { bg: '#D1FAE5', text: '#065F46' },
  milestone: { bg: '#EDE9FE', text: '#5B21B6' },
}

const GRID_COLS = '44px 1.2fr 1fr 100px 90px 80px 80px 65px 70px'
const GRID_COLS_EXPANDED = '44px 1.5fr 1.5fr 120px 110px 90px 80px 65px 70px'

/* ------------------------------------------------------------------ */
/* Extract phases from flat form field map                             */
/* ------------------------------------------------------------------ */

function extractPhases(fields: Record<string, any>, basePath: string): PhaseData[] {
  const phases: PhaseData[] = []
  let i = 0

  while (true) {
    const hasPhase =
      fields[`${basePath}.${i}.phaseName`] !== undefined ||
      fields[`${basePath}.${i}.id`] !== undefined
    if (!hasPhase) break

    const phase: PhaseData = {
      phaseName: fields[`${basePath}.${i}.phaseName`]?.value ?? '',
      phaseDescription: fields[`${basePath}.${i}.phaseDescription`]?.value ?? '',
      steps: [],
    }

    let j = 0
    while (true) {
      const hasStep =
        fields[`${basePath}.${i}.steps.${j}.stepName`] !== undefined ||
        fields[`${basePath}.${i}.steps.${j}.id`] !== undefined
      if (!hasStep) break

      phase.steps.push({
        stepName: fields[`${basePath}.${i}.steps.${j}.stepName`]?.value ?? '',
        stepDescription: fields[`${basePath}.${i}.steps.${j}.stepDescription`]?.value ?? '',
        stepType: fields[`${basePath}.${i}.steps.${j}.stepType`]?.value ?? '',
        isAutomatable: !!fields[`${basePath}.${i}.steps.${j}.isAutomatable`]?.value,
        automationNotes: fields[`${basePath}.${i}.steps.${j}.automationNotes`]?.value ?? '',
        defaultAssignee: fields[`${basePath}.${i}.steps.${j}.defaultAssignee`]?.value ?? '',
        estimatedDuration: fields[`${basePath}.${i}.steps.${j}.estimatedDuration`]?.value ?? '',
        emailTemplateSubject:
          fields[`${basePath}.${i}.steps.${j}.emailTemplateSubject`]?.value ?? '',
        emailTemplateBody:
          fields[`${basePath}.${i}.steps.${j}.emailTemplateBody`]?.value ?? '',
        reminderDays: fields[`${basePath}.${i}.steps.${j}.reminderDays`]?.value ?? null,
        requiredBeforeNext: !!fields[`${basePath}.${i}.steps.${j}.requiredBeforeNext`]?.value,
      })
      j++
    }

    phases.push(phase)
    i++
  }

  return phases
}

/* ------------------------------------------------------------------ */
/* Editable Text Cell (syncs on blur to avoid per-keystroke dispatch)  */
/* ------------------------------------------------------------------ */

function EditableCell({
  value,
  onSave,
  placeholder,
  className,
  style,
}: {
  value: string
  onSave: (val: string) => void
  placeholder?: string
  className?: string
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
      className={className || 'ws-input'}
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
/* Editable Textarea                                                   */
/* ------------------------------------------------------------------ */

function EditableTextarea({
  value,
  onSave,
  placeholder,
}: {
  value: string
  onSave: (val: string) => void
  placeholder?: string
}) {
  const [local, setLocal] = useState(value)
  const [focused, setFocused] = useState(false)

  useEffect(() => {
    if (!focused) setLocal(value)
  }, [value, focused])

  return (
    <textarea
      className="ws-textarea"
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

function ProcessTemplateWorksheet(props: any) {
  const path = props?.path || 'phases'
  const schemaPath = props?.schemaPath || 'phases'
  const [fields, dispatchFields] = useAllFormFields()
  const { addFieldRow, removeFieldRow, moveFieldRow } = useForm()
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set())
  const [fullscreen, setFullscreen] = useState(false)
  const gridCols = fullscreen ? GRID_COLS_EXPANDED : GRID_COLS

  // Close fullscreen on Escape
  useEffect(() => {
    if (!fullscreen) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFullscreen(false)
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [fullscreen])

  // Lock body scroll when fullscreen
  useEffect(() => {
    if (fullscreen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
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
    addFieldRow({
      path,
      schemaPath,
      rowIndex: phases.length,
    })
  }, [addFieldRow, path, schemaPath, phases.length])

  const handleRemovePhase = useCallback(
    (index: number) => {
      if (!confirm('Remove this phase and all its steps?')) return
      removeFieldRow({ path, rowIndex: index })
    },
    [removeFieldRow, path],
  )

  const handleAddStep = useCallback(
    (phaseIndex: number) => {
      const stepsPath = `${path}.${phaseIndex}.steps`
      const stepsSchemaPath = `${schemaPath}.steps`
      const stepCount = phases[phaseIndex]?.steps?.length || 0
      addFieldRow({
        path: stepsPath,
        schemaPath: stepsSchemaPath,
        rowIndex: stepCount,
      })
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

  const handleMoveStep = useCallback(
    (phaseIndex: number, fromIndex: number, direction: 'up' | 'down') => {
      const stepsPath = `${path}.${phaseIndex}.steps`
      const toIndex = direction === 'up' ? fromIndex - 1 : fromIndex + 1
      const steps = phases[phaseIndex]?.steps || []
      if (toIndex < 0 || toIndex >= steps.length) return
      moveFieldRow({ path: stepsPath, moveFromIndex: fromIndex, moveToIndex: toIndex })
    },
    [moveFieldRow, path, phases],
  )

  const handleRemoveStep = useCallback(
    (phaseIndex: number, stepIndex: number) => {
      removeFieldRow({
        path: `${path}.${phaseIndex}.steps`,
        rowIndex: stepIndex,
      })
    },
    [removeFieldRow, path],
  )

  const toggleExpand = useCallback((key: string) => {
    setExpandedSteps((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const containerStyle: React.CSSProperties = fullscreen
    ? {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 10000,
        background: 'var(--theme-elevation-0, #fff)',
        padding: '20px 28px',
        overflow: 'auto',
      }
    : { margin: '20px 0' }

  return (
    <div style={containerStyle}>
      <style>{`
        .ws-input {
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
        .ws-input:hover { border-color: var(--theme-elevation-200); }
        .ws-input:focus {
          border-color: #3B82F6;
          box-shadow: 0 0 0 1px rgba(59,130,246,0.3);
          background: var(--theme-elevation-0);
        }
        .ws-input-phase {
          width: 100%;
          padding: 4px 6px;
          border: 1px solid transparent;
          border-radius: 3px;
          font-size: 12px;
          font-weight: 600;
          font-family: inherit;
          background: transparent;
          color: #1E40AF;
          outline: none;
          transition: border-color 0.15s, box-shadow 0.15s;
          box-sizing: border-box;
        }
        .ws-input-phase:hover { border-color: rgba(30,64,175,0.3); }
        .ws-input-phase:focus {
          border-color: #1E40AF;
          box-shadow: 0 0 0 1px rgba(30,64,175,0.3);
          background: rgba(255,255,255,0.5);
        }
        .ws-select {
          width: 100%;
          padding: 3px 4px;
          border: 1px solid transparent;
          border-radius: 3px;
          font-size: 11px;
          font-family: inherit;
          background: transparent;
          color: inherit;
          outline: none;
          cursor: pointer;
          transition: border-color 0.15s;
          box-sizing: border-box;
        }
        .ws-select:hover { border-color: var(--theme-elevation-200); }
        .ws-select:focus {
          border-color: #3B82F6;
          box-shadow: 0 0 0 1px rgba(59,130,246,0.3);
        }
        .ws-btn {
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
        .ws-btn:hover { background: var(--theme-elevation-100); color: var(--theme-elevation-700); }
        .ws-btn-danger:hover { background: #FEE2E2 !important; color: #DC2626 !important; }
        .ws-btn-add:hover { background: #D1FAE5 !important; color: #059669 !important; }
        .ws-step-row:hover { background: var(--theme-elevation-50) !important; }
        .ws-textarea {
          width: 100%;
          padding: 6px 8px;
          border: 1px solid var(--theme-elevation-200);
          border-radius: 4px;
          font-size: 12px;
          font-family: inherit;
          background: var(--theme-elevation-0);
          color: inherit;
          outline: none;
          resize: vertical;
          min-height: 60px;
          transition: border-color 0.15s;
          box-sizing: border-box;
        }
        .ws-textarea:focus {
          border-color: #3B82F6;
          box-shadow: 0 0 0 1px rgba(59,130,246,0.3);
        }
        .ws-expand-panel {
          animation: wsSlideDown 0.15s ease-out;
        }
        @keyframes wsSlideDown {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 12,
        }}
      >
        <label style={{ fontSize: fullscreen ? 16 : 13, fontWeight: 600, color: 'var(--theme-elevation-800)' }}>
          Phases & Steps
        </label>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            type="button"
            onClick={handleAddPhase}
            style={{
              padding: '6px 14px',
              fontSize: 12,
              fontWeight: 600,
              background: 'var(--theme-elevation-100)',
              border: '1px solid var(--theme-elevation-200)',
              borderRadius: 6,
              cursor: 'pointer',
              color: 'var(--theme-elevation-700)',
            }}
          >
            + Add Phase
          </button>
          <button
            type="button"
            onClick={() => setFullscreen(!fullscreen)}
            style={{
              padding: '6px 12px',
              fontSize: 12,
              fontWeight: 600,
              background: fullscreen ? '#EF4444' : 'var(--theme-elevation-100)',
              border: fullscreen ? '1px solid #DC2626' : '1px solid var(--theme-elevation-200)',
              borderRadius: 6,
              cursor: 'pointer',
              color: fullscreen ? '#fff' : 'var(--theme-elevation-700)',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
            title={fullscreen ? 'Close fullscreen (Esc)' : 'Expand to fullscreen'}
          >
            {fullscreen ? (
              <><span style={{ fontSize: 14, lineHeight: 1 }}>&#x2715;</span> Close</>
            ) : (
              <><span style={{ fontSize: 14, lineHeight: 1 }}>&#x26F6;</span> Expand</>
            )}
          </button>
        </div>
      </div>

      {phases.length === 0 ? (
        <div
          style={{
            padding: 40,
            textAlign: 'center',
            color: 'var(--theme-elevation-400)',
            fontSize: 13,
            border: '2px dashed var(--theme-elevation-150)',
            borderRadius: 8,
          }}
        >
          No phases yet. Click &ldquo;Add Phase&rdquo; to start building your process template.
        </div>
      ) : (
        <div
          style={{
            border: '1px solid var(--theme-elevation-200)',
            borderRadius: 8,
            overflow: 'hidden',
          }}
        >
          {/* Column headers */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: gridCols,
              background: 'var(--theme-elevation-50)',
              borderBottom: '2px solid var(--theme-elevation-200)',
              fontSize: 10,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: 'var(--theme-elevation-500)',
            }}
          >
            {['#', 'Name', 'Description', 'Type', 'Assignee', 'Time', 'Auto', 'Req', ''].map(
              (col, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: '8px 6px',
                    borderRight: idx < 8 ? '1px solid var(--theme-elevation-150)' : 'none',
                  }}
                >
                  {col}
                </div>
              ),
            )}
          </div>

          {/* Phases and steps */}
          {phases.map((phase, pi) => (
            <div key={pi}>
              {/* Phase header row */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '44px 1.2fr 1fr auto',
                  background: '#EBF5FF',
                  borderBottom: '1px solid var(--theme-elevation-150)',
                  borderTop: pi > 0 ? '2px solid var(--theme-elevation-200)' : 'none',
                  alignItems: 'center',
                }}
              >
                <div
                  style={{
                    padding: '8px 6px',
                    fontWeight: 700,
                    color: '#1E40AF',
                    fontSize: 13,
                    textAlign: 'center',
                    borderRight: '1px solid rgba(30,64,175,0.15)',
                  }}
                >
                  {pi + 1}
                </div>
                <div style={{ padding: '4px 6px', borderRight: '1px solid rgba(30,64,175,0.15)' }}>
                  <EditableCell
                    value={phase.phaseName}
                    onSave={(v) => updateValue(`${path}.${pi}.phaseName`, v)}
                    placeholder="Phase name..."
                    className="ws-input-phase"
                  />
                </div>
                <div style={{ padding: '4px 6px', borderRight: '1px solid rgba(30,64,175,0.15)' }}>
                  <EditableCell
                    value={phase.phaseDescription}
                    onSave={(v) => updateValue(`${path}.${pi}.phaseDescription`, v)}
                    placeholder="Phase description..."
                    className="ws-input-phase"
                    style={{ fontWeight: 400, fontSize: 11 }}
                  />
                </div>
                <div style={{ padding: '4px 8px', display: 'flex', gap: 2, alignItems: 'center' }}>
                  {pi > 0 && (
                    <button type="button" className="ws-btn" onClick={() => handleMovePhase(pi, 'up')} title="Move phase up">&#x25B2;</button>
                  )}
                  {pi < phases.length - 1 && (
                    <button type="button" className="ws-btn" onClick={() => handleMovePhase(pi, 'down')} title="Move phase down">&#x25BC;</button>
                  )}
                  <button
                    type="button"
                    className="ws-btn ws-btn-add"
                    onClick={() => handleAddStep(pi)}
                    title="Add step to this phase"
                    style={{ fontWeight: 600 }}
                  >
                    + Step
                  </button>
                  <button
                    type="button"
                    className="ws-btn ws-btn-danger"
                    onClick={() => handleRemovePhase(pi)}
                    title="Remove phase"
                  >
                    &#x2715;
                  </button>
                </div>
              </div>

              {/* Step rows */}
              {phase.steps.map((step, si) => {
                const stepKey = `${pi}-${si}`
                const isExpanded = expandedSteps.has(stepKey)
                const hasExpandableContent =
                  step.stepType === 'communication' || step.isAutomatable
                const typeColor = step.stepType ? TYPE_COLORS[step.stepType] : null

                return (
                  <div key={si}>
                    <div
                      className="ws-step-row"
                      style={{
                        display: 'grid',
                        gridTemplateColumns: gridCols,
                        borderBottom: '1px solid var(--theme-elevation-100)',
                        alignItems: 'center',
                      }}
                    >
                      {/* Order number */}
                      <div
                        style={{
                          padding: '6px',
                          color: 'var(--theme-elevation-400)',
                          fontSize: 11,
                          textAlign: 'center',
                          borderRight: '1px solid var(--theme-elevation-100)',
                        }}
                      >
                        {pi + 1}.{si + 1}
                      </div>

                      {/* Step Name */}
                      <div
                        style={{
                          padding: '3px 6px',
                          borderRight: '1px solid var(--theme-elevation-100)',
                        }}
                      >
                        <EditableCell
                          value={step.stepName}
                          onSave={(v) =>
                            updateValue(`${path}.${pi}.steps.${si}.stepName`, v)
                          }
                          placeholder="Step name..."
                        />
                      </div>

                      {/* Description */}
                      <div
                        style={{
                          padding: '3px 6px',
                          borderRight: '1px solid var(--theme-elevation-100)',
                        }}
                      >
                        <EditableCell
                          value={step.stepDescription}
                          onSave={(v) =>
                            updateValue(`${path}.${pi}.steps.${si}.stepDescription`, v)
                          }
                          placeholder="Description..."
                        />
                      </div>

                      {/* Type dropdown */}
                      <div
                        style={{
                          padding: '3px 6px',
                          borderRight: '1px solid var(--theme-elevation-100)',
                        }}
                      >
                        <select
                          className="ws-select"
                          value={step.stepType}
                          onChange={(e) =>
                            updateValue(`${path}.${pi}.steps.${si}.stepType`, e.target.value)
                          }
                          style={
                            typeColor
                              ? {
                                  background: typeColor.bg,
                                  color: typeColor.text,
                                  fontWeight: 600,
                                  borderRadius: 4,
                                  padding: '3px 6px',
                                }
                              : undefined
                          }
                        >
                          {STEP_TYPES.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Assignee dropdown */}
                      <div
                        style={{
                          padding: '3px 6px',
                          borderRight: '1px solid var(--theme-elevation-100)',
                        }}
                      >
                        <select
                          className="ws-select"
                          value={step.defaultAssignee}
                          onChange={(e) =>
                            updateValue(
                              `${path}.${pi}.steps.${si}.defaultAssignee`,
                              e.target.value,
                            )
                          }
                        >
                          {ASSIGNEES.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Time */}
                      <div
                        style={{
                          padding: '3px 6px',
                          borderRight: '1px solid var(--theme-elevation-100)',
                        }}
                      >
                        <EditableCell
                          value={step.estimatedDuration}
                          onSave={(v) =>
                            updateValue(`${path}.${pi}.steps.${si}.estimatedDuration`, v)
                          }
                          placeholder="e.g. 30m"
                        />
                      </div>

                      {/* Automatable checkbox */}
                      <div
                        style={{
                          padding: '3px 6px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderRight: '1px solid var(--theme-elevation-100)',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={step.isAutomatable}
                          onChange={(e) =>
                            updateValue(
                              `${path}.${pi}.steps.${si}.isAutomatable`,
                              e.target.checked,
                            )
                          }
                          style={{ cursor: 'pointer', width: 15, height: 15 }}
                        />
                      </div>

                      {/* Required checkbox */}
                      <div
                        style={{
                          padding: '3px 6px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderRight: '1px solid var(--theme-elevation-100)',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={step.requiredBeforeNext}
                          onChange={(e) =>
                            updateValue(
                              `${path}.${pi}.steps.${si}.requiredBeforeNext`,
                              e.target.checked,
                            )
                          }
                          style={{ cursor: 'pointer', width: 15, height: 15 }}
                        />
                      </div>

                      {/* Actions */}
                      <div
                        style={{
                          padding: '3px 4px',
                          display: 'flex',
                          gap: 2,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        {si > 0 && (
                          <button type="button" className="ws-btn" onClick={() => handleMoveStep(pi, si, 'up')} title="Move up" style={{ fontSize: 9 }}>&#x25B2;</button>
                        )}
                        {si < phase.steps.length - 1 && (
                          <button type="button" className="ws-btn" onClick={() => handleMoveStep(pi, si, 'down')} title="Move down" style={{ fontSize: 9 }}>&#x25BC;</button>
                        )}
                        {hasExpandableContent && (
                          <button
                            type="button"
                            className="ws-btn"
                            onClick={() => toggleExpand(stepKey)}
                            title={isExpanded ? 'Collapse' : 'Expand details'}
                            style={{
                              transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                              transition: 'transform 0.15s',
                            }}
                          >
                            &#x25BE;
                          </button>
                        )}
                        <button
                          type="button"
                          className="ws-btn ws-btn-danger"
                          onClick={() => handleRemoveStep(pi, si)}
                          title="Remove step"
                        >
                          &#x2715;
                        </button>
                      </div>
                    </div>

                    {/* Expanded detail panel for communication/automatable steps */}
                    {isExpanded && hasExpandableContent && (
                      <div
                        className="ws-expand-panel"
                        style={{
                          padding: '12px 16px 12px 50px',
                          background: 'var(--theme-elevation-25, #FAFAFA)',
                          borderBottom: '1px solid var(--theme-elevation-150)',
                          display: 'grid',
                          gridTemplateColumns: '1fr 1fr',
                          gap: 12,
                        }}
                      >
                        {step.isAutomatable && (
                          <div style={{ gridColumn: step.stepType === 'communication' ? 'span 1' : 'span 2' }}>
                            <label style={detailLabelStyle}>Automation Notes</label>
                            <EditableTextarea
                              value={step.automationNotes}
                              onSave={(v) =>
                                updateValue(`${path}.${pi}.steps.${si}.automationNotes`, v)
                              }
                              placeholder="What automation would look like..."
                            />
                          </div>
                        )}
                        {step.stepType === 'communication' && (
                          <>
                            <div>
                              <label style={detailLabelStyle}>Email Subject</label>
                              <EditableCell
                                value={step.emailTemplateSubject}
                                onSave={(v) =>
                                  updateValue(
                                    `${path}.${pi}.steps.${si}.emailTemplateSubject`,
                                    v,
                                  )
                                }
                                placeholder="Email subject line..."
                                className="ws-input"
                                style={{
                                  border: '1px solid var(--theme-elevation-200)',
                                  padding: '6px 8px',
                                  borderRadius: 4,
                                  background: 'var(--theme-elevation-0)',
                                }}
                              />
                            </div>
                            <div>
                              <label style={detailLabelStyle}>Email Body</label>
                              <EditableTextarea
                                value={step.emailTemplateBody}
                                onSave={(v) =>
                                  updateValue(
                                    `${path}.${pi}.steps.${si}.emailTemplateBody`,
                                    v,
                                  )
                                }
                                placeholder="Draft email template..."
                              />
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}

              {/* Empty steps message */}
              {phase.steps.length === 0 && (
                <div
                  style={{
                    padding: '12px 50px',
                    color: 'var(--theme-elevation-400)',
                    fontSize: 12,
                    fontStyle: 'italic',
                    borderBottom: '1px solid var(--theme-elevation-100)',
                  }}
                >
                  No steps yet. Click &ldquo;+ Step&rdquo; to add one.
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Summary */}
      {phases.length > 0 && (
        <div style={{ marginTop: 8, fontSize: 11, color: 'var(--theme-elevation-400)' }}>
          {phases.length} phase{phases.length !== 1 ? 's' : ''},{' '}
          {phases.reduce((sum, p) => sum + p.steps.length, 0)} total steps
        </div>
      )}
    </div>
  )
}

const detailLabelStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  color: 'var(--theme-elevation-500)',
  marginBottom: 4,
  display: 'block',
}

export default ProcessTemplateWorksheet
