'use client'

import { useDocumentInfo, useAllFormFields, useField } from '@payloadcms/ui'
import { useState } from 'react'

interface StepResult {
  step: number
  name: string
  score: number
  maxScore: number
  findings: string[]
  recommendations: string[]
}

interface CurationSelections {
  stepFindings: Record<number, number[]>
  stepRecommendations: Record<number, number[]>
  emailQuickWins: number[]
  presentationQuickWins: number[]
}

const scoreColor = (score: number): string => {
  if (score >= 7) return '#16a34a'
  if (score >= 4.5) return '#f59e0b'
  return '#dc2626'
}

const GoogleAdsFindingCuration = () => {
  const { id } = useDocumentInfo()
  const [fields] = useAllFormFields()
  const { value: curatedFindings, setValue: setCuratedFindings } = useField<CurationSelections | null>({
    path: 'curatedFindings',
  })

  const scoredReport = fields?.scoredReport?.value as any | undefined

  // Track which step accordions are expanded
  const [expanded, setExpanded] = useState<Record<number, boolean>>(() => {
    if (!scoredReport?.steps) return {}
    const initial: Record<number, boolean> = {}
    for (const step of scoredReport.steps) {
      initial[step.step] = step.score < 6
    }
    return initial
  })

  if (!id) return null

  if (!scoredReport?.steps) {
    return (
      <div style={{ padding: 16, background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0', marginBottom: 20 }}>
        <p style={{ margin: 0, color: '#6b7280', fontSize: 14 }}>
          Run an audit first to see findings for curation.
        </p>
      </div>
    )
  }

  const steps = scoredReport.steps as StepResult[]
  const quickWins = (scoredReport.quickWins || []) as string[]
  const curation: CurationSelections = curatedFindings || {
    stepFindings: {},
    stepRecommendations: {},
    emailQuickWins: [],
    presentationQuickWins: [],
  }

  // Count selections
  const totalFindings = Object.values(curation.stepFindings).flat().length
  const totalRecs = Object.values(curation.stepRecommendations).flat().length
  const emailQwCount = curation.emailQuickWins.length
  const presQwCount = curation.presentationQuickWins.length

  const toggleExpanded = (step: number) => {
    setExpanded((prev) => ({ ...prev, [step]: !prev[step] }))
  }

  const isChecked = (list: number[] | undefined, idx: number) => (list || []).includes(idx)

  const updateCuration = (updated: CurationSelections) => {
    setCuratedFindings(updated)
  }

  const toggleStepItem = (
    field: 'stepFindings' | 'stepRecommendations',
    step: number,
    idx: number,
  ) => {
    const current = curation[field][step] || []
    const next = current.includes(idx)
      ? current.filter((i) => i !== idx)
      : [...current, idx].sort((a, b) => a - b)
    updateCuration({
      ...curation,
      [field]: { ...curation[field], [step]: next },
    })
  }

  const toggleQuickWin = (field: 'emailQuickWins' | 'presentationQuickWins', idx: number) => {
    const current = curation[field]
    const next = current.includes(idx)
      ? current.filter((i) => i !== idx)
      : [...current, idx].sort((a, b) => a - b)
    updateCuration({ ...curation, [field]: next })
  }

  const selectAll = () => {
    const allFindings: Record<number, number[]> = {}
    const allRecs: Record<number, number[]> = {}
    for (const s of steps) {
      allFindings[s.step] = s.findings.map((_, i) => i)
      allRecs[s.step] = s.recommendations.map((_, i) => i)
    }
    updateCuration({
      stepFindings: allFindings,
      stepRecommendations: allRecs,
      emailQuickWins: quickWins.map((_, i) => i),
      presentationQuickWins: curation.presentationQuickWins,
    })
  }

  const deselectAll = () => {
    updateCuration({
      stepFindings: {},
      stepRecommendations: {},
      emailQuickWins: [],
      presentationQuickWins: curation.presentationQuickWins,
    })
  }

  return (
    <div style={{ marginBottom: 20 }}>
      {/* Summary bar */}
      <div
        style={{
          padding: '12px 16px',
          background: '#f0f9ff',
          borderRadius: 8,
          border: '1px solid #bae6fd',
          marginBottom: 16,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 8,
        }}
      >
        <div style={{ fontSize: 13, color: '#0c4a6e' }}>
          <strong>{totalFindings}</strong> findings, <strong>{totalRecs}</strong> recommendations selected for email
          {' | '}
          <strong>{emailQwCount}</strong> quick wins for email, <strong>{presQwCount}</strong> for presentation
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            onClick={selectAll}
            style={{
              padding: '4px 12px',
              fontSize: 12,
              background: '#e0f2fe',
              border: '1px solid #7dd3fc',
              borderRadius: 4,
              cursor: 'pointer',
              color: '#0369a1',
            }}
          >
            Select All
          </button>
          <button
            type="button"
            onClick={deselectAll}
            style={{
              padding: '4px 12px',
              fontSize: 12,
              background: '#fef2f2',
              border: '1px solid #fca5a5',
              borderRadius: 4,
              cursor: 'pointer',
              color: '#b91c1c',
            }}
          >
            Deselect All
          </button>
        </div>
      </div>

      <p style={{ fontSize: 12, color: '#6b7280', margin: '0 0 16px' }}>
        Deselect findings and recommendations you don&apos;t want in the email. Changes take effect after saving and regenerating.
      </p>

      {/* Step accordions */}
      {steps.map((step) => {
        const isOpen = expanded[step.step] ?? false
        const findingCount = (curation.stepFindings[step.step] || []).length
        const recCount = (curation.stepRecommendations[step.step] || []).length

        return (
          <div
            key={step.step}
            style={{
              border: '1px solid #e2e8f0',
              borderRadius: 6,
              marginBottom: 8,
              overflow: 'hidden',
            }}
          >
            {/* Header */}
            <button
              type="button"
              onClick={() => toggleExpanded(step.step)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                width: '100%',
                padding: '10px 14px',
                background: isOpen ? '#f8fafc' : '#fff',
                border: 'none',
                cursor: 'pointer',
                textAlign: 'left',
                fontSize: 13,
              }}
            >
              <span style={{ fontFamily: 'monospace', color: '#9ca3af', width: 16 }}>
                {isOpen ? '▼' : '▶'}
              </span>
              <span style={{ fontWeight: 600, flex: 1 }}>
                Step {step.step}: {step.name}
              </span>
              <span
                style={{
                  display: 'inline-block',
                  padding: '2px 8px',
                  borderRadius: 12,
                  fontSize: 12,
                  fontWeight: 600,
                  color: '#fff',
                  background: scoreColor(step.score),
                }}
              >
                {step.score}/{step.maxScore}
              </span>
              <span style={{ fontSize: 11, color: '#9ca3af', minWidth: 80, textAlign: 'right' }}>
                {findingCount}f / {recCount}r
              </span>
            </button>

            {/* Content */}
            {isOpen && (
              <div style={{ padding: '8px 14px 14px 40px' }}>
                {/* Findings */}
                {step.findings.length > 0 && (
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', marginBottom: 4 }}>
                      Findings
                    </div>
                    {step.findings.map((finding, idx) => (
                      <label
                        key={idx}
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: 8,
                          padding: '3px 0',
                          fontSize: 13,
                          cursor: 'pointer',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked(curation.stepFindings[step.step], idx)}
                          onChange={() => toggleStepItem('stepFindings', step.step, idx)}
                          style={{ marginTop: 2 }}
                        />
                        <span>{finding}</span>
                      </label>
                    ))}
                  </div>
                )}

                {/* Recommendations */}
                {step.recommendations.length > 0 && (
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', marginBottom: 4 }}>
                      Recommendations
                    </div>
                    {step.recommendations.map((rec, idx) => (
                      <label
                        key={idx}
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: 8,
                          padding: '3px 0',
                          fontSize: 13,
                          cursor: 'pointer',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked(curation.stepRecommendations[step.step], idx)}
                          onChange={() => toggleStepItem('stepRecommendations', step.step, idx)}
                          style={{ marginTop: 2 }}
                        />
                        <span>{rec}</span>
                      </label>
                    ))}
                  </div>
                )}

                {step.findings.length === 0 && step.recommendations.length === 0 && (
                  <p style={{ fontSize: 12, color: '#9ca3af', margin: 0 }}>No findings or recommendations for this step.</p>
                )}
              </div>
            )}
          </div>
        )
      })}

      {/* Quick Wins section */}
      {quickWins.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <h4 style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 600 }}>Quick Wins</h4>
          <p style={{ fontSize: 12, color: '#6b7280', margin: '0 0 8px' }}>
            Select which quick wins appear in the email and/or presentation.
          </p>
          <div style={{ border: '1px solid #e2e8f0', borderRadius: 6, overflow: 'hidden' }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 60px 60px',
                padding: '8px 14px',
                background: '#f8fafc',
                fontSize: 11,
                fontWeight: 600,
                color: '#6b7280',
                borderBottom: '1px solid #e2e8f0',
              }}
            >
              <span>Quick Win</span>
              <span style={{ textAlign: 'center' }}>Email</span>
              <span style={{ textAlign: 'center' }}>Pres.</span>
            </div>
            {quickWins.map((qw, idx) => (
              <div
                key={idx}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 60px 60px',
                  padding: '6px 14px',
                  fontSize: 13,
                  borderBottom: idx < quickWins.length - 1 ? '1px solid #f1f5f9' : 'none',
                  alignItems: 'center',
                }}
              >
                <span>{qw}</span>
                <span style={{ textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    checked={curation.emailQuickWins.includes(idx)}
                    onChange={() => toggleQuickWin('emailQuickWins', idx)}
                  />
                </span>
                <span style={{ textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    checked={curation.presentationQuickWins.includes(idx)}
                    onChange={() => toggleQuickWin('presentationQuickWins', idx)}
                  />
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default GoogleAdsFindingCuration
