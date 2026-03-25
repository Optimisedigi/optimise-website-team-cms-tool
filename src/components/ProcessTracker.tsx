'use client'

import { useDocumentInfo } from '@payloadcms/ui'
import { useState, useEffect, useCallback, useRef } from 'react'

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

type Step = {
  id?: string
  stepName: string
  stepOrder: number
  stepDescription?: string
  stepType?: 'action' | 'communication' | 'decision' | 'automated' | 'milestone'
  stepStatus: 'not_started' | 'in_progress' | 'completed' | 'skipped' | 'blocked'
  completedAt?: string
  defaultAssignee?: string
  estimatedDuration?: string
  isAutomatable?: boolean
  automationNotes?: string
  emailTemplateSubject?: string
  emailTemplateBody?: string
  reminderDays?: number
  requiredBeforeNext?: boolean
  notes?: string
  outcome?: string
  emailDraft?: string
  dueDate?: string
}

type Phase = {
  id?: string
  phaseName: string
  phaseOrder: number
  phaseDescription?: string
  phaseStatus: 'not_started' | 'in_progress' | 'completed' | 'skipped'
  steps: Step[]
}

type ProcessDoc = {
  id: string
  processTitle: string
  overallStatus: string
  phases: Phase[]
}

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */

const STATUS_COLORS: Record<string, string> = {
  not_started: '#6B7280',
  in_progress: '#3B82F6',
  completed: '#10B981',
  skipped: '#F59E0B',
  blocked: '#EF4444',
}

const STATUS_LABELS: Record<string, string> = {
  not_started: 'Not Started',
  in_progress: 'In Progress',
  completed: 'Completed',
  skipped: 'Skipped',
  blocked: 'Blocked',
}

const TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  action: { bg: '#DBEAFE', text: '#1E40AF' },
  communication: { bg: '#FCE7F3', text: '#9D174D' },
  decision: { bg: '#FEF3C7', text: '#92400E' },
  automated: { bg: '#D1FAE5', text: '#065F46' },
  milestone: { bg: '#EDE9FE', text: '#5B21B6' },
}

const NEXT_STATUS: Record<string, string> = {
  not_started: 'in_progress',
  in_progress: 'completed',
  completed: 'not_started',
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

function ProcessTracker() {
  const { id } = useDocumentInfo()
  const [doc, setDoc] = useState<ProcessDoc | null>(null)
  const [activePhase, setActivePhase] = useState(0)
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set())
  const [loadingStep, setLoadingStep] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(null)

  // Fetch document data
  useEffect(() => {
    if (!id) return
    fetch(`/api/client-processes/${id}?depth=0`, { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => {
        if (data?.id && Array.isArray(data.phases)) {
          setDoc(data)
          // Default to first in-progress phase
          const inProgressIdx = (data.phases as Phase[]).findIndex(
            (p) => p.phaseStatus === 'in_progress',
          )
          if (inProgressIdx >= 0) setActivePhase(inProgressIdx)
        }
      })
      .catch(() => {})
  }, [id])

  // Show toast with auto-dismiss
  const showToast = useCallback((msg: string) => {
    setToast(msg)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 3000)
  }, [])

  // Toggle step status
  const handleStepToggle = useCallback(
    async (phaseIndex: number, stepIndex: number, currentStatus: string) => {
      if (!id || !doc) return

      const newStatus = NEXT_STATUS[currentStatus] || 'not_started'
      const stepKey = `${phaseIndex}-${stepIndex}`
      setLoadingStep(stepKey)

      // Optimistic update
      const prevDoc = doc
      const updatedPhases = doc.phases.map((phase, pi) => {
        if (pi !== phaseIndex) return phase
        return {
          ...phase,
          steps: phase.steps.map((step, si) => {
            if (si !== stepIndex) return step
            return { ...step, stepStatus: newStatus as Step['stepStatus'] }
          }),
        }
      })
      setDoc({ ...doc, phases: updatedPhases })

      try {
        const res = await fetch(`/api/client-processes/${id}/step`, {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phaseIndex, stepIndex, status: newStatus }),
        })

        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.error || 'Update failed')
        }

        // Re-fetch the full doc to get computed values (phase statuses, etc.)
        const freshRes = await fetch(`/api/client-processes/${id}?depth=0`, {
          credentials: 'include',
        })
        if (freshRes.ok) {
          const freshDoc = await freshRes.json()
          if (freshDoc?.id) setDoc(freshDoc)
        }
      } catch (err: any) {
        // Revert on error
        setDoc(prevDoc)
        showToast(err.message || 'Failed to update step')
      } finally {
        setLoadingStep(null)
      }
    },
    [id, doc, showToast],
  )

  // Toggle step expansion
  const toggleExpand = useCallback((key: string) => {
    setExpandedSteps((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  if (!id || !doc) return null

  const phases = doc.phases || []
  if (phases.length === 0) return null

  // Compute overall completion
  const totalSteps = phases.reduce((sum, p) => sum + (p.steps?.length || 0), 0)
  const completedSteps = phases.reduce(
    (sum, p) =>
      sum +
      (p.steps || []).filter(
        (s) => s.stepStatus === 'completed' || s.stepStatus === 'skipped',
      ).length,
    0,
  )
  const completionPct = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0

  const currentPhase = phases[activePhase]

  return (
    <div style={{ padding: '0 0 24px', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* Toast */}
      {toast && (
        <div
          style={{
            position: 'fixed',
            top: 16,
            right: 16,
            zIndex: 9999,
            padding: '10px 20px',
            background: '#EF4444',
            color: '#fff',
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 600,
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          }}
        >
          {toast}
        </div>
      )}

      {/* Overall Progress Bar */}
      <div style={{ marginBottom: 20 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 6,
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--theme-elevation-600)' }}>
            Overall Progress
          </span>
          <span style={{ fontSize: 13, fontWeight: 700, color: STATUS_COLORS.in_progress }}>
            {completionPct}%
          </span>
        </div>
        <div
          style={{
            width: '100%',
            height: 8,
            background: 'var(--theme-elevation-100)',
            borderRadius: 4,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${completionPct}%`,
              height: '100%',
              background:
                completionPct === 100
                  ? STATUS_COLORS.completed
                  : STATUS_COLORS.in_progress,
              borderRadius: 4,
              transition: 'width 0.3s ease',
            }}
          />
        </div>
        <div
          style={{
            fontSize: 11,
            color: 'var(--theme-elevation-400)',
            marginTop: 4,
          }}
        >
          {completedSteps} of {totalSteps} steps completed
        </div>
      </div>

      {/* Phase Pipeline */}
      <div
        style={{
          display: 'flex',
          gap: 2,
          marginBottom: 20,
          overflowX: 'auto',
          paddingBottom: 4,
        }}
      >
        {phases.map((phase, idx) => {
          const phaseSteps = phase.steps || []
          const phaseCompleted = phaseSteps.filter(
            (s) => s.stepStatus === 'completed' || s.stepStatus === 'skipped',
          ).length
          const isActive = idx === activePhase
          const statusColor = STATUS_COLORS[phase.phaseStatus] || STATUS_COLORS.not_started

          return (
            <button
              key={phase.id || idx}
              type="button"
              onClick={() => setActivePhase(idx)}
              style={{
                flex: 1,
                minWidth: 120,
                padding: '10px 12px',
                border: isActive ? `2px solid ${statusColor}` : '2px solid transparent',
                borderRadius: 8,
                background: isActive
                  ? `${statusColor}10`
                  : 'var(--theme-elevation-50)',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.2s ease',
              }}
            >
              <div
                style={{
                  marginBottom: 4,
                }}
              >
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: isActive ? statusColor : 'var(--theme-elevation-800)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    marginBottom: 4,
                  }}
                >
                  {phase.phaseName}
                </div>
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 700,
                    padding: '2px 6px',
                    borderRadius: 4,
                    background: statusColor,
                    color: '#fff',
                    whiteSpace: 'nowrap',
                    textTransform: 'uppercase',
                    letterSpacing: '0.03em',
                  }}
                >
                  {STATUS_LABELS[phase.phaseStatus] || phase.phaseStatus}
                </span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--theme-elevation-400)' }}>
                {phaseCompleted}/{phaseSteps.length} steps
              </div>
            </button>
          )
        })}
      </div>

      {/* Phase connector arrows (visual) */}

      {/* Steps for active phase */}
      {currentPhase && (
        <div>
          <div
            style={{
              fontSize: 14,
              fontWeight: 700,
              marginBottom: 12,
              color: 'var(--theme-elevation-800)',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            {currentPhase.phaseName}
            {currentPhase.phaseDescription && (
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 400,
                  color: 'var(--theme-elevation-400)',
                }}
              >
                — {currentPhase.phaseDescription}
              </span>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {(currentPhase.steps || []).map((step, stepIdx) => {
              const stepKey = `${activePhase}-${stepIdx}`
              const isExpanded = expandedSteps.has(stepKey)
              const isLoading = loadingStep === stepKey
              const statusColor =
                STATUS_COLORS[step.stepStatus] || STATUS_COLORS.not_started
              const typeInfo = step.stepType ? TYPE_COLORS[step.stepType] : null
              const hasDetails =
                step.stepDescription ||
                step.notes ||
                step.outcome ||
                step.emailTemplateSubject ||
                step.emailTemplateBody

              return (
                <div
                  key={step.id || stepIdx}
                  style={{
                    border: '1px solid var(--theme-elevation-100)',
                    borderRadius: 8,
                    overflow: 'hidden',
                    background: 'var(--theme-elevation-0)',
                  }}
                >
                  {/* Step Header */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '10px 12px',
                      cursor: hasDetails ? 'pointer' : 'default',
                    }}
                    onClick={() => hasDetails && toggleExpand(stepKey)}
                  >
                    {/* Status toggle button */}
                    <button
                      type="button"
                      disabled={isLoading}
                      onClick={(e) => {
                        e.stopPropagation()
                        handleStepToggle(activePhase, stepIdx, step.stepStatus)
                      }}
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: 6,
                        border: `2px solid ${statusColor}`,
                        background:
                          step.stepStatus === 'completed'
                            ? statusColor
                            : step.stepStatus === 'in_progress'
                              ? `${statusColor}20`
                              : 'transparent',
                        cursor: isLoading ? 'wait' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        position: 'relative',
                        padding: 0,
                      }}
                    >
                      {isLoading ? (
                        <Spinner color={statusColor} />
                      ) : step.stepStatus === 'completed' ? (
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                          <path
                            d="M3 7L6 10L11 4"
                            stroke="#fff"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      ) : step.stepStatus === 'in_progress' ? (
                        <div
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            background: statusColor,
                          }}
                        />
                      ) : null}
                    </button>

                    {/* Step name */}
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color:
                          step.stepStatus === 'completed'
                            ? 'var(--theme-elevation-400)'
                            : 'var(--theme-elevation-800)',
                        textDecoration:
                          step.stepStatus === 'completed' ? 'line-through' : 'none',
                        flex: 1,
                      }}
                    >
                      {step.stepName}
                    </span>

                    {/* Badges */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                      {/* Type badge */}
                      {step.stepType && typeInfo && (
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 600,
                            padding: '2px 6px',
                            borderRadius: 4,
                            background: typeInfo.bg,
                            color: typeInfo.text,
                            textTransform: 'capitalize',
                          }}
                        >
                          {step.stepType}
                        </span>
                      )}

                      {/* Status badge */}
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 600,
                          padding: '2px 6px',
                          borderRadius: 4,
                          background: `${statusColor}18`,
                          color: statusColor,
                          textTransform: 'capitalize',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {STATUS_LABELS[step.stepStatus] || step.stepStatus}
                      </span>

                      {/* Assignee */}
                      {step.defaultAssignee && (
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 500,
                            padding: '2px 6px',
                            borderRadius: 4,
                            background: 'var(--theme-elevation-50)',
                            color: 'var(--theme-elevation-500)',
                            textTransform: 'capitalize',
                          }}
                        >
                          {step.defaultAssignee.replace(/_/g, ' ')}
                        </span>
                      )}

                      {/* Due date */}
                      {step.dueDate && (
                        <span
                          style={{
                            fontSize: 10,
                            color: 'var(--theme-elevation-400)',
                          }}
                        >
                          {new Date(step.dueDate).toLocaleDateString('en-AU', {
                            day: 'numeric',
                            month: 'short',
                          })}
                        </span>
                      )}

                      {/* Completed date */}
                      {step.stepStatus === 'completed' && step.completedAt && (
                        <span style={{ fontSize: 10, color: STATUS_COLORS.completed }}>
                          ✓{' '}
                          {new Date(step.completedAt).toLocaleDateString('en-AU', {
                            day: 'numeric',
                            month: 'short',
                          })}
                        </span>
                      )}

                      {/* Expand arrow */}
                      {hasDetails && (
                        <span
                          style={{
                            fontSize: 12,
                            color: 'var(--theme-elevation-400)',
                            transition: 'transform 0.2s',
                            transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                          }}
                        >
                          ▾
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Expanded details */}
                  {isExpanded && hasDetails && (
                    <div
                      style={{
                        padding: '0 12px 12px 46px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
                        borderTop: '1px solid var(--theme-elevation-50)',
                      }}
                    >
                      {step.stepDescription && (
                        <DetailBlock label="Description" value={step.stepDescription} />
                      )}
                      {step.notes && <DetailBlock label="Notes" value={step.notes} />}
                      {step.outcome && <DetailBlock label="Outcome" value={step.outcome} />}
                      {step.emailTemplateSubject && (
                        <DetailBlock label="Email Subject" value={step.emailTemplateSubject} />
                      )}
                      {step.emailTemplateBody && (
                        <DetailBlock label="Email Draft" value={step.emailTemplateBody} />
                      )}
                      {step.estimatedDuration && (
                        <DetailBlock label="Est. Duration" value={step.estimatedDuration} />
                      )}
                      {step.automationNotes && (
                        <DetailBlock label="Automation Notes" value={step.automationNotes} />
                      )}
                    </div>
                  )}
                </div>
              )
            })}

            {(!currentPhase.steps || currentPhase.steps.length === 0) && (
              <div
                style={{
                  padding: 20,
                  textAlign: 'center',
                  color: 'var(--theme-elevation-400)',
                  fontSize: 13,
                }}
              >
                No steps in this phase
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Sub-components                                                      */
/* ------------------------------------------------------------------ */

function DetailBlock({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ marginTop: 4 }}>
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          color: 'var(--theme-elevation-400)',
          marginBottom: 2,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 12,
          color: 'var(--theme-elevation-600)',
          lineHeight: 1.5,
          whiteSpace: 'pre-wrap',
        }}
      >
        {value}
      </div>
    </div>
  )
}

function Spinner({ color }: { color: string }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      style={{ animation: 'processTrackerSpin 0.8s linear infinite' }}
    >
      <style>{`@keyframes processTrackerSpin { to { transform: rotate(360deg) } }`}</style>
      <circle
        cx="7"
        cy="7"
        r="5"
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeDasharray="20"
        strokeDashoffset="8"
        strokeLinecap="round"
      />
    </svg>
  )
}

export default ProcessTracker
