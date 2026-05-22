'use client'

import { useState } from 'react'
import type { FieldBase } from 'payload'

interface Props {
  field: FieldBase & { admin?: { description?: string } }
  path: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  label?: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  value?: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onChange?: (val: any) => void
}

export default function MatchTypeMonitorToggle({ field, path, label, value, onChange }: Props) {
  const [tooltip, setTooltip] = useState(false)

  const tooltipText =
    'Runs daily ~17:00 UTC. Flags Exact and Phrase keywords that served non-conforming search terms. Review candidates in Growth Tools → Match Type Violation Candidates.'

  const labelText =
    typeof label === 'string' ? label : (typeof field.label === 'string' ? field.label : 'Match Type Monitor')

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, paddingTop: 2 }}>
      {/* Actual checkbox — rendered by Payload, we replicate the toggle here */}
      <input
        id={`field-${path}`}
        type="checkbox"
        checked={!!value}
        onChange={(e) => onChange?.(e.target.checked)}
        style={{ marginTop: 2, cursor: 'pointer', width: 16, height: 16 }}
      />
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <label
            htmlFor={`field-${path}`}
            style={{ fontSize: 13, fontWeight: 500, cursor: 'pointer', color: 'var(--color-label-text)' }}
          >
            {labelText}
          </label>
          {/* Info tooltip icon */}
          <button
            type="button"
            onClick={() => setTooltip(!tooltip)}
            onBlur={() => setTimeout(() => setTooltip(false), 150)}
            title="What is this?"
            style={{
              background: '#e0e7ff',
              border: 'none',
              borderRadius: '50%',
              width: 18,
              height: 18,
              cursor: 'pointer',
              fontSize: 11,
              color: '#3730a3',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0,
              flexShrink: 0,
            }}
          >
            ?
          </button>
        </div>
        {tooltip && (
          <div
            style={{
              background: '#1e293b',
              color: '#f1f5f9',
              borderRadius: 6,
              padding: '10px 12px',
              fontSize: 12,
              lineHeight: 1.6,
              marginTop: 6,
              maxWidth: 320,
              boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
            }}
          >
            {tooltipText}
          </div>
        )}
        {field.admin?.description && !tooltip && (
          <p style={{ margin: '3px 0 0', color: '#6b7280', fontSize: 12, lineHeight: 1.5 }}>
            {field.admin.description}
          </p>
        )}
      </div>
    </div>
  )
}
