import React from 'react'

/** Amber, screen-reader-announced box for image problems an editor should fix. */
export function ImageWarningBox({ warnings, notes = [] }: { warnings: string[]; notes?: string[] }): React.ReactElement | null {
  if (!warnings.length && !notes.length) return null
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        margin: '-8px 0 24px',
        padding: '10px 12px',
        border: '1px solid var(--theme-warning-500, #d97706)',
        borderRadius: 4,
        background: 'var(--theme-warning-100, #fef3c7)',
        color: 'var(--theme-warning-900, #78350f)',
        fontSize: 13,
        lineHeight: 1.45,
      }}
    >
      {warnings.map((warning) => (
        <p key={warning} style={{ margin: '0 0 4px' }}>
          <strong>Warning:</strong> {warning}
        </p>
      ))}
      {notes.map((note) => (
        <p key={note} style={{ margin: '0 0 4px' }}>
          {note}
        </p>
      ))}
    </div>
  )
}
