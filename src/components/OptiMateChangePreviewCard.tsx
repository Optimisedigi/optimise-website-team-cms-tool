'use client'

import type { CSSProperties } from 'react'

export interface OptiMateChangePreview {
  id: number
  action: string
  /** The agent's own description; `details` is what will actually be sent. */
  summary: string
  details: Record<string, unknown>
  expiresAt: string
}

export type ChangeCardState =
  | { kind: 'pending' }
  | { kind: 'applying' }
  | { kind: 'applied' }
  | { kind: 'cancelled' }
  | { kind: 'error'; message: string }

interface OptiMateChangePreviewCardProps {
  change: OptiMateChangePreview
  state: ChangeCardState
  onApply: (change: OptiMateChangePreview) => void
  onCancel: (change: OptiMateChangePreview) => void
}

function actionLabel(action: string): string {
  const words = action.replace(/_/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

function formatValue(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  const json = JSON.stringify(value)
  return json.length > 240 ? `${json.slice(0, 240)}…` : json
}

function formatExpiry(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

/**
 * Card shown under an OptiMate reply when it prepared a live Google Ads
 * change. Nothing changes in the account until the user taps "Apply live";
 * the card lists the exact fields that will be sent so the user approves the
 * stored request, not the agent's description of it.
 */
const OptiMateChangePreviewCard = ({ change, state, onApply, onCancel }: OptiMateChangePreviewCardProps) => {
  const wrapperStyle: CSSProperties = {
    marginTop: 6,
    padding: '10px 12px',
    background: '#eff6ff',
    border: '1px solid #bfdbfe',
    borderRadius: 8,
    fontSize: 12,
    color: '#1f2937',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  }
  const pillStyle: CSSProperties = {
    alignSelf: 'flex-start',
    background: '#dbeafe',
    color: '#1e40af',
    fontSize: 10,
    fontWeight: 600,
    padding: '2px 6px',
    borderRadius: 4,
  }
  const buttonBase: CSSProperties = {
    border: '1px solid transparent',
    borderRadius: 6,
    padding: '8px 14px',
    minHeight: 36,
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
  }
  const applyStyle: CSSProperties = { ...buttonBase, background: '#1d4ed8', color: '#fff', borderColor: '#1e40af' }
  const cancelStyle: CSSProperties = { ...buttonBase, background: '#fff', color: '#374151', borderColor: '#d1d5db' }
  const detailEntries = Object.entries(change.details)
  const expiry = formatExpiry(change.expiresAt)
  const busy = state.kind === 'applying'

  return (
    <div style={wrapperStyle} role="group" aria-label={`Live Google Ads change: ${actionLabel(change.action)}`}>
      <span style={pillStyle}>Live change · not applied yet</span>
      <strong style={{ fontSize: 13 }}>{actionLabel(change.action)}</strong>
      {change.summary && (
        <div>
          <span style={{ color: '#6b7280' }}>OptiMate&apos;s description: </span>
          {change.summary}
        </div>
      )}
      {detailEntries.length > 0 && (
        <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'max-content 1fr', gap: '2px 8px' }}>
          {detailEntries.map(([key, value]) => (
            <div key={key} style={{ display: 'contents' }}>
              <dt style={{ color: '#6b7280' }}>{key}</dt>
              <dd style={{ margin: 0, wordBreak: 'break-word', fontFamily: 'ui-monospace, monospace' }}>
                {formatValue(value)}
              </dd>
            </div>
          ))}
        </dl>
      )}
      <div aria-live="polite" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        {(state.kind === 'pending' || state.kind === 'applying') && (
          <>
            <button
              type="button"
              style={{ ...applyStyle, opacity: busy ? 0.6 : 1 }}
              disabled={busy}
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onApply(change)
              }}
            >
              {busy ? 'Applying…' : 'Apply live'}
            </button>
            <button
              type="button"
              style={cancelStyle}
              disabled={busy}
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onCancel(change)
              }}
            >
              Cancel
            </button>
            {expiry && !busy && <span style={{ color: '#6b7280', fontSize: 11 }}>Expires {expiry}</span>}
          </>
        )}
        {state.kind === 'applied' && <span style={{ color: '#065f46', fontWeight: 600 }}>✓ Applied live</span>}
        {state.kind === 'cancelled' && <span style={{ color: '#6b7280', fontWeight: 600 }}>Cancelled, nothing changed</span>}
        {state.kind === 'error' && (
          <span role="alert" style={{ color: '#991b1b', fontWeight: 600 }}>
            {state.message}
          </span>
        )}
      </div>
    </div>
  )
}

export default OptiMateChangePreviewCard
