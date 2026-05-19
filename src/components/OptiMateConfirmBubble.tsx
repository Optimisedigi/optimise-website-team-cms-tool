'use client'

import type { CSSProperties } from 'react'

export interface OptiMateConfirmRequest {
  confirmId: string
  proposalType: 'campaign-restructure' | 'campaign-build'
  wording: string
  draftSettings: Record<string, unknown>
}

export type ConfirmResolution = 'pending' | 'confirmed' | 'declined'

interface OptiMateConfirmBubbleProps {
  request: OptiMateConfirmRequest
  resolution: ConfirmResolution
  onConfirm: (confirmId: string, draftSettings: Record<string, unknown>) => void
  onReject: (confirmId: string) => void
}

const TYPE_LABEL: Record<OptiMateConfirmRequest['proposalType'], string> = {
  'campaign-restructure': 'Restructure',
  'campaign-build': 'Build',
}

/**
 * Confirm-gate Yes/No bubble shown under an assistant chat bubble whenever
 * the agent called `request_confirm` before kicking off a heavy restructure
 * or build proposal.
 *
 * Visual borrows from OptiMateProposalCard so the two stack consistently
 * under the same assistant turn (when both fire). Once the user picks Yes
 * or No, the parent flips resolution off "pending" and the buttons turn
 * into a static "Confirmed" / "Declined" pill.
 */
const OptiMateConfirmBubble = ({
  request,
  resolution,
  onConfirm,
  onReject,
}: OptiMateConfirmBubbleProps) => {
  const wrapperStyle: CSSProperties = {
    marginTop: 6,
    padding: '10px 12px',
    background: '#fffbeb',
    border: '1px solid #fde68a',
    borderRadius: 8,
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    fontSize: 12,
    flexWrap: 'wrap',
  }

  const typePillStyle: CSSProperties = {
    background: '#fef3c7',
    color: '#92400e',
    fontSize: 10,
    fontWeight: 600,
    padding: '2px 6px',
    borderRadius: 4,
  }

  const wordingStyle: CSSProperties = {
    flex: 1,
    fontWeight: 500,
    color: '#374151',
    minWidth: 180,
  }

  const buttonBase: CSSProperties = {
    border: '1px solid transparent',
    borderRadius: 6,
    padding: '5px 12px',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
  }

  const yesStyle: CSSProperties = {
    ...buttonBase,
    background: '#16a34a',
    color: '#fff',
    borderColor: '#15803d',
  }

  const noStyle: CSSProperties = {
    ...buttonBase,
    background: '#fff',
    color: '#374151',
    borderColor: '#d1d5db',
  }

  const resolvedPillStyle = (kind: ConfirmResolution): CSSProperties => ({
    fontSize: 10,
    fontWeight: 600,
    padding: '4px 8px',
    borderRadius: 10,
    background: kind === 'confirmed' ? '#d1fae5' : '#fee2e2',
    color: kind === 'confirmed' ? '#065f46' : '#991b1b',
  })

  return (
    <div style={wrapperStyle}>
      <span style={typePillStyle}>{TYPE_LABEL[request.proposalType]}</span>
      <span style={wordingStyle} title={request.wording}>
        {request.wording}
      </span>
      {resolution === 'pending' ? (
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            type="button"
            style={yesStyle}
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onConfirm(request.confirmId, request.draftSettings)
            }}
          >
            Yes, proceed
          </button>
          <button
            type="button"
            style={noStyle}
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onReject(request.confirmId)
            }}
          >
            No
          </button>
        </div>
      ) : (
        <span style={resolvedPillStyle(resolution)}>
          {resolution === 'confirmed' ? '✓ Confirmed' : '✕ Declined'}
        </span>
      )}
    </div>
  )
}

export default OptiMateConfirmBubble
