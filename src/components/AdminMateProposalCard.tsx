'use client'

import {
  PROPOSAL_BUSINESS_TYPE_OPTIONS,
  PROPOSAL_CONVERSION_GOAL_OPTIONS,
  type StagedProposal,
} from '@/lib/agents/adminmate/proposal-tools'

interface Props {
  staged: StagedProposal
  creating: boolean
  onChange: (changes: Partial<StagedProposal>) => void
  onCreate: () => void
}

const TEXT_FIELDS: Array<{ key: keyof StagedProposal; label: string }> = [
  { key: 'businessName', label: 'Business name' },
  { key: 'slug', label: 'Slug' },
  { key: 'websiteUrl', label: 'Website URL' },
  { key: 'contactName', label: 'Contact name' },
  { key: 'contactEmail', label: 'Contact email' },
]

/**
 * Review card for a client proposal AdminMate staged. Nothing is written to
 * the CMS until the admin presses the create button.
 */
export default function AdminMateProposalCard({ staged, creating, onChange, onCreate }: Props) {
  return (
    <section
      aria-label="New client proposal review"
      style={{
        border: '1px solid #c4b5fd',
        borderRadius: 12,
        padding: 12,
        background: 'rgba(124,58,237,.08)',
        display: 'grid',
        gap: 10,
      }}
    >
      <div>
        <strong>Review new client proposal</strong>
      </div>
      {TEXT_FIELDS.map(({ key, label }) => (
        <label key={key} style={labelStyle}>
          {label}
          <input
            aria-label={label}
            value={(staged[key] as string | undefined) ?? ''}
            onChange={(event) => onChange({ [key]: event.target.value } as Partial<StagedProposal>)}
            style={inputStyle}
          />
        </label>
      ))}
      <label style={labelStyle}>
        Business type
        <select
          aria-label="Business type"
          value={staged.businessType ?? ''}
          onChange={(event) =>
            onChange({
              businessType: (event.target.value || undefined) as StagedProposal['businessType'],
            })
          }
          style={inputStyle}
        >
          <option value="">Not set</option>
          {PROPOSAL_BUSINESS_TYPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label style={labelStyle}>
        Conversion goal
        <select
          aria-label="Conversion goal"
          value={staged.conversionGoal ?? ''}
          onChange={(event) =>
            onChange({
              conversionGoal: (event.target.value || undefined) as StagedProposal['conversionGoal'],
            })
          }
          style={inputStyle}
        >
          <option value="">Not set</option>
          {PROPOSAL_CONVERSION_GOAL_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label style={labelStyle}>
        Business goals
        <textarea
          aria-label="Business goals"
          value={staged.businessGoals ?? ''}
          onChange={(event) => onChange({ businessGoals: event.target.value })}
          rows={3}
          maxLength={4000}
          style={{ ...inputStyle, resize: 'vertical' }}
        />
      </label>
      <label style={labelStyle}>
        Internal notes
        <textarea
          aria-label="Internal notes"
          value={staged.notes ?? ''}
          onChange={(event) => onChange({ notes: event.target.value })}
          rows={3}
          maxLength={4000}
          style={{ ...inputStyle, resize: 'vertical' }}
        />
      </label>
      <div role="status" style={noticeStyle}>
        Audits, keywords and presentation slides are set up after the proposal exists, in the CMS.
      </div>
      <button
        type="button"
        onClick={onCreate}
        disabled={creating || !staged.businessName.trim() || !staged.websiteUrl.trim()}
        style={primaryButtonStyle}
      >
        {creating ? 'Creating…' : `Create ${staged.businessName.trim() || 'proposal'}`}
      </button>
    </section>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  border: '1px solid var(--theme-elevation-200)',
  borderRadius: 7,
  padding: '8px 9px',
  background: 'var(--theme-bg)',
  color: 'var(--theme-text)',
  font: 'inherit',
}
const labelStyle: React.CSSProperties = { display: 'grid', gap: 3, fontSize: 12, fontWeight: 700 }
const primaryButtonStyle: React.CSSProperties = {
  border: 0,
  borderRadius: 8,
  padding: '9px 12px',
  background: '#6d28d9',
  color: '#fff',
  fontWeight: 800,
  cursor: 'pointer',
}
const noticeStyle: React.CSSProperties = {
  padding: 10,
  borderRadius: 9,
  // Transparent so the card's own background shows through in light and dark themes.
  border: '1px solid var(--theme-elevation-200)',
  background: 'transparent',
  color: 'inherit',
  fontSize: 13,
  lineHeight: 1.45,
}
