'use client'

import type { DefaultCellComponentProps } from 'payload'

type PillTone = 'green' | 'blue' | 'amber' | 'red' | 'gray' | 'violet'

const STATUS_TONES: Record<string, PillTone> = {
  active: 'green',
  client: 'green',
  completed: 'green',
  signed: 'green',
  won: 'green',
  sent: 'blue',
  proposal_sent: 'blue',
  proposal_presented: 'blue',
  qualified: 'blue',
  in_progress: 'blue',
  open: 'blue',
  draft: 'amber',
  pending: 'amber',
  negotiation: 'amber',
  on_hold: 'amber',
  new_lead: 'amber',
  contacted: 'amber',
  meeting_booked: 'amber',
  contract_sent: 'amber',
  lost: 'red',
  cancelled: 'red',
  declined: 'red',
  rejected: 'red',
  overdue: 'red',
}

const STATUS_LABELS: Record<string, string> = {
  sent: 'Sent to Client',
  new_lead: 'New Lead',
  proposal_sent: 'Proposal Sent',
  proposal_presented: 'Proposal Presented',
  contract_sent: 'Contract Sent',
  meeting_booked: 'Meeting Booked',
}

function normaliseStatus(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function labelFromStatus(status: string): string {
  if (!status) return '—'
  const mappedLabel = STATUS_LABELS[status]
  if (mappedLabel) return mappedLabel

  return status
    .split(/[_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function StatusPillCell({ cellData }: DefaultCellComponentProps) {
  const status = normaliseStatus(cellData)
  const tone = STATUS_TONES[status] ?? 'gray'

  return <span className={`od-pill od-pill--${tone}`}>{labelFromStatus(status)}</span>
}

export default StatusPillCell
