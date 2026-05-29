'use client'

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
const OptiMateProposalCard = ({ proposal, variant = 'inline' }: OptiMateProposalCardProps) => {
  const status = statusPalette(proposal.status)
  const isStrip = variant === 'strip'

  const wrapperStyle: CSSProperties = isStrip
    ? {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 8px',
        background: '#fffbeb',
        border: '1px solid #fde68a',
        borderRadius: 999,
        fontSize: 11,
        whiteSpace: 'nowrap',
        flexShrink: 0,
      }
    : {
        marginTop: 6,
        padding: '8px 10px',
        background: '#fffbeb',
        border: '1px solid #fde68a',
        borderRadius: 8,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        fontSize: 12,
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
          flex: isStrip ? '0 0 auto' : 1,
          fontWeight: 500,
          color: '#374151',
          maxWidth: isStrip ? 220 : undefined,
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
        Open →
      </a>
    </div>
  )
}

export default OptiMateProposalCard
