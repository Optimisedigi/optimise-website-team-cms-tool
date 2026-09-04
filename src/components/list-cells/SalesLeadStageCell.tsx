'use client'

import { useEffect, useRef, useState } from 'react'
import type { DefaultCellComponentProps } from 'payload'
import StatusPillCell from './StatusPillCell'

const STAGES = [
  { label: 'New Lead', value: 'new_lead' },
  { label: 'Contacted', value: 'contacted' },
  { label: 'Meeting Booked', value: 'meeting_booked' },
  { label: 'Proposal Sent', value: 'proposal_sent' },
  { label: 'Contract Sent', value: 'contract_sent' },
  { label: 'Client (Won)', value: 'client' },
  { label: 'Lost', value: 'lost' },
] as const

const STAGE_VALUES = new Set<string>(STAGES.map((stage) => stage.value))

const PILL_CLASS: Record<string, string> = {
  new_lead: 'od-pill--amber',
  contacted: 'od-pill--blue',
  meeting_booked: 'od-pill--violet',
  proposal_sent: 'od-pill--blue',
  contract_sent: 'od-pill--blue',
  client: 'od-pill--green',
  lost: 'od-pill--red',
}

function labelFor(value: string): string {
  return STAGES.find((stage) => stage.value === value)?.label ?? value
}

function SalesLeadStageCell(props: DefaultCellComponentProps) {
  const { cellData, collectionSlug, rowData } = props
  const initial = typeof cellData === 'string' ? cellData : ''
  const [stage, setStage] = useState(initial)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const selectRef = useRef<HTMLSelectElement>(null)
  const leadId = rowData?.id

  useEffect(() => {
    setStage(typeof cellData === 'string' ? cellData : '')
  }, [cellData])

  useEffect(() => {
    if (editing) selectRef.current?.focus()
  }, [editing])

  if (collectionSlug !== 'sales-leads' || leadId == null || leadId === '') {
    return <StatusPillCell {...props} />
  }

  const save = async (next: string) => {
    if (next === stage || !STAGE_VALUES.has(next)) {
      setEditing(false)
      return
    }
    const previous = stage
    setStage(next)
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/sales-leads/${encodeURIComponent(String(leadId))}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: next }),
      })
      if (!res.ok) {
        setStage(previous)
        setError('Could not save stage')
        return
      }
      setEditing(false)
    } catch {
      setStage(previous)
      setError('Could not save stage')
    } finally {
      setSaving(false)
    }
  }

  if (editing) {
    return (
      <select
        ref={selectRef}
        aria-label="Lead stage"
        className={`od-pill od-stage-select ${PILL_CLASS[stage] || 'od-pill--gray'}`}
        disabled={saving}
        onBlur={() => {
          if (!saving) setEditing(false)
        }}
        onChange={(event) => {
          void save(event.target.value)
        }}
        onClick={(event) => event.stopPropagation()}
        onMouseDown={(event) => event.stopPropagation()}
        value={stage}
      >
        {STAGES.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    )
  }

  return (
    <button
      type="button"
      aria-label={`Change stage from ${labelFor(stage)}`}
      className={`od-pill od-stage-pill ${PILL_CLASS[stage] || 'od-pill--gray'}`}
      disabled={saving}
      onClick={(event) => {
        event.stopPropagation()
        setError(null)
        setEditing(true)
      }}
      title={error ?? 'Click to change stage'}
    >
      {labelFor(stage)}
    </button>
  )
}

export default SalesLeadStageCell
