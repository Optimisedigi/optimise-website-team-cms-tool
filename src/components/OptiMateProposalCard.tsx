'use client'

import { useState } from 'react'
import type { CSSProperties } from 'react'

export interface OptiMateProposal {
  id: number
  title: string
  proposalType: string
  status: string
}

interface OptiMateProposalCardProps {
  proposal: OptiMateProposal
  /** Visual variant — inline lives under a chat bubble; strip is the panel-top row. */
  variant?: 'inline' | 'strip'
  onReject?: (id: number) => void
}

const STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
  pending: { bg: '#fef3c7', fg: '#92400e' },
  approved: { bg: '#dbeafe', fg: '#1e40af' },
  applied: { bg: '#d1fae5', fg: '#065f46' },
  rejected: { bg: '#fee2e2', fg: '#991b1b' },
  failed: { bg: '#fee2e2', fg: '#991b1b' },
}

function statusPalette(status: string): { bg: string; fg: string } {
  return STATUS_COLORS[status] ?? { bg: '#e5e7eb', fg: '#374151' }
}

/** Compact label for the proposalType — e.g. "nkl-create" → "NKL". */
function typePill(proposalType: string): string {
  if (proposalType.startsWith('nkl')) return proposalType.replace('nkl-', 'NKL · ')
  if (proposalType.startsWith('budget')) return proposalType.replace('budget-', 'Budget · ')
  if (proposalType.startsWith('ad-copy')) return proposalType.replace('ad-copy-', 'Ad copy · ')
  if (proposalType === 'negative-keywords') return 'NKL · legacy'
  if (proposalType.endsWith('-goal-run-create')) {
    return `${proposalType.replace('-goal-run-create', '').replace(/-/g, ' ')} goal`
  }
  return proposalType
}

/**
 * Visual proposal card surfaced in two places:
 *   1. Inline beneath an assistant chat bubble (variant="inline"), one card
 *      per proposal that the just-finished turn produced.
 *   2. As a chip in the launcher panel's "pending strip" (variant="strip").
 *
 * Both link to /admin/agent-approvals/[id] in a new tab — the canonical review
 * surface where Approve / Apply lives.
 */
const OptiMateProposalCard = ({
  proposal,
  variant = 'inline',
  onReject,
}: OptiMateProposalCardProps) => {
  const status = statusPalette(proposal.status)
  const isStrip = variant === 'strip'
  const [rejecting, setRejecting] = useState(false)

  const rejectProposal = async (): Promise<void> => {
    if (rejecting) return
    setRejecting(true)
    try {
      const res = await fetch(`/api/agent-approvals/${proposal.id}/reject`, {
        method: 'POST',
        credentials: 'include',
      })
      if (!res.ok) throw new Error(`Reject failed (${res.status})`)
      onReject?.(proposal.id)
    } catch (err) {
      console.error('[OptiMateProposalCard] reject failed:', err)
      setRejecting(false)
    }
  }

  if (!isStrip) {
    // Inline card sits inside the dark chat: dark surface, two stacked rows
    // so the type label and title get the full width instead of being squeezed.
    return (
      <div
        style={{
          marginTop: 6,
          padding: '10px 12px',
          background: 'rgba(251, 191, 36, 0.08)',
          border: '1px solid rgba(251, 191, 36, 0.35)',
          borderRadius: 10,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          fontSize: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, minWidth: 0 }}>
          <span
            style={{
              background: 'rgba(251, 191, 36, 0.16)',
              color: '#fcd34d',
              fontSize: 10,
              fontWeight: 600,
              padding: '3px 7px',
              borderRadius: 4,
              textTransform: 'capitalize',
              maxWidth: '45%',
              overflowWrap: 'anywhere',
              lineHeight: 1.3,
              flexShrink: 0,
            }}
          >
            {typePill(proposal.proposalType)}
          </span>
          <span
            style={{
              flex: 1,
              minWidth: 0,
              fontWeight: 500,
              color: '#f3f4f6',
              lineHeight: 1.4,
            }}
          >
            {proposal.title}
          </span>
        </div>
        <div
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}
        >
          <span
            style={{
              background: status.bg,
              color: status.fg,
              fontSize: 10,
              fontWeight: 600,
              padding: '2px 8px',
              borderRadius: 999,
              textTransform: 'capitalize',
            }}
          >
            {proposal.status}
          </span>
          <a
            href={`/admin/agent-approvals/${proposal.id}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: '#60a5fa',
              textDecoration: 'none',
              fontWeight: 600,
              fontSize: 12,
              whiteSpace: 'nowrap',
            }}
          >
            Open →
          </a>
        </div>
      </div>
    )
  }

  const wrapperStyle: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: '4px 6px',
    background: '#fffbeb',
    border: '1px solid #fde68a',
    borderRadius: 999,
    fontSize: 11,
    whiteSpace: 'nowrap',
    flexShrink: 1,
    minWidth: 0,
    maxWidth: '100%',
  }

  return (
    <div style={wrapperStyle}>
      <span
        style={{
          background: '#fef3c7',
          color: '#92400e',
          fontSize: 10,
          fontWeight: 600,
          padding: '2px 6px',
          borderRadius: 4,
          textTransform: 'capitalize',
        }}
      >
        {typePill(proposal.proposalType)}
      </span>
      <span
        style={{
          flex: isStrip ? '1 1 auto' : 1,
          minWidth: 0,
          fontWeight: 500,
          color: '#374151',
          maxWidth: isStrip ? 90 : undefined,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
        title={proposal.title}
      >
        {proposal.title}
      </span>
      <span
        style={{
          background: status.bg,
          color: status.fg,
          fontSize: 10,
          fontWeight: 600,
          padding: '2px 6px',
          borderRadius: 4,
          textTransform: 'capitalize',
        }}
      >
        {proposal.status}
      </span>
      {isStrip && onReject ? (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            void rejectProposal()
          }}
          disabled={rejecting}
          title="Reject this pending proposal"
          aria-label={`Reject ${proposal.title}`}
          style={{
            width: 18,
            height: 18,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
            border: '1px solid #fecaca',
            borderRadius: 999,
            background: '#fff',
            color: '#991b1b',
            cursor: rejecting ? 'default' : 'pointer',
            fontSize: 12,
            fontWeight: 700,
            lineHeight: 1,
            flexShrink: 0,
            opacity: rejecting ? 0.55 : 1,
          }}
        >
          ×
        </button>
      ) : (
        <a
          href={`/admin/agent-approvals/${proposal.id}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            color: '#2563eb',
            textDecoration: 'none',
            fontWeight: 600,
            fontSize: 11,
            marginLeft: isStrip ? 0 : 4,
            whiteSpace: 'nowrap',
          }}
        >
          {isStrip ? 'Open' : 'Open →'}
        </a>
      )}
    </div>
  )
}

export default OptiMateProposalCard
