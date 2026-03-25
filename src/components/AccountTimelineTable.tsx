'use client'

import { useAllFormFields, useForm } from '@payloadcms/ui'
import { useCallback, useMemo } from 'react'

type TimelineEntry = {
  date: string
  serviceArea: string
  actionType: string
  description: string
}

const SERVICE_AREAS = [
  { label: 'Google Ads', value: 'google_ads' },
  { label: 'SEO', value: 'seo' },
  { label: 'Analytics / Tracking', value: 'analytics' },
  { label: 'Website', value: 'website' },
  { label: 'Social / Meta', value: 'social' },
  { label: 'Content', value: 'content' },
  { label: 'Contracts / Legal', value: 'contracts' },
  { label: 'Onboarding', value: 'onboarding' },
  { label: 'General', value: 'general' },
]

const ACTION_TYPES = [
  // Account lifecycle
  { label: 'Account Takeover', value: 'account_takeover' },
  { label: 'Account Access Granted', value: 'access_granted' },
  { label: 'Onboarding Started', value: 'onboarding_started' },
  { label: 'Onboarding Completed', value: 'onboarding_completed' },
  // Contracts & agreements
  { label: 'Contract Signed', value: 'contract_signed' },
  { label: 'Contract Renewed', value: 'contract_renewed' },
  { label: 'Scope of Work Changed', value: 'scope_changed' },
  // Meetings & communication
  { label: 'Kickoff Meeting', value: 'kickoff_meeting' },
  { label: 'Strategy Meeting', value: 'strategy_meeting' },
  { label: 'Review Meeting', value: 'review_meeting' },
  { label: 'Client Presentation', value: 'client_presentation' },
  // Tracking & tagging
  { label: 'Tagging Updated', value: 'tagging_updated' },
  { label: 'Conversion Tracking Changed', value: 'conversion_tracking_changed' },
  { label: 'GA4 Setup / Migration', value: 'ga4_setup' },
  { label: 'GTM Setup / Updated', value: 'gtm_updated' },
  // Google Ads
  { label: 'Campaign Structure Proposed', value: 'campaign_structure_proposed' },
  { label: 'Campaign Structure Implemented', value: 'campaign_structure_implemented' },
  { label: 'Budget Changed', value: 'budget_changed' },
  { label: 'Negative Keyword List Added', value: 'negative_keywords_added' },
  { label: 'Bid Strategy Changed', value: 'bid_strategy_changed' },
  { label: 'Ad Copy Updated', value: 'ad_copy_updated' },
  { label: 'Landing Pages Changed', value: 'landing_pages_changed' },
  // Reporting & dashboards
  { label: 'Dashboard Created', value: 'dashboard_created' },
  { label: 'Reporting Started', value: 'reporting_started' },
  // General
  { label: 'Strategy Change', value: 'strategy_change' },
  { label: 'Process Milestone', value: 'process_milestone' },
  { label: 'Other', value: 'other' },
]

function extractEntries(fields: Record<string, any>, basePath: string): TimelineEntry[] {
  const entries: TimelineEntry[] = []
  let i = 0
  while (true) {
    const hasRow =
      fields[`${basePath}.${i}.date`] !== undefined ||
      fields[`${basePath}.${i}.id`] !== undefined
    if (!hasRow) break
    entries.push({
      date: fields[`${basePath}.${i}.date`]?.value ?? '',
      serviceArea: fields[`${basePath}.${i}.serviceArea`]?.value ?? 'google_ads',
      actionType: fields[`${basePath}.${i}.actionType`]?.value ?? '',
      description: fields[`${basePath}.${i}.description`]?.value ?? '',
    })
    i++
  }
  return entries
}

const cellStyle: React.CSSProperties = {
  padding: '6px 8px',
  borderBottom: '1px solid var(--theme-elevation-100, #e5e7eb)',
  verticalAlign: 'middle',
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '5px 8px',
  border: '1px solid var(--theme-elevation-150, #d1d5db)',
  borderRadius: 4,
  fontSize: 13,
  background: 'var(--theme-input-bg, #fff)',
  color: 'var(--theme-text, inherit)',
  boxSizing: 'border-box',
}

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  cursor: 'pointer',
}

const headerStyle: React.CSSProperties = {
  padding: '8px 8px',
  fontWeight: 600,
  fontSize: 12,
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  color: 'var(--theme-elevation-500, #6b7280)',
  borderBottom: '2px solid var(--theme-elevation-150, #e5e7eb)',
  whiteSpace: 'nowrap',
}

function AccountTimelineTable(props: any) {
  const path = props?.path || 'accountTimeline'
  const schemaPath = props?.schemaPath || 'accountTimeline'
  const [fields, dispatchFields] = useAllFormFields()
  const { addFieldRow, removeFieldRow } = useForm()

  const entries = useMemo(() => extractEntries(fields, path), [fields, path])

  // Sorted indices — earliest date first, entries without dates go to the end
  const sortedIndices = useMemo(() => {
    return entries
      .map((_, i) => i)
      .sort((a, b) => {
        const dateA = entries[a].date
        const dateB = entries[b].date
        if (!dateA && !dateB) return 0
        if (!dateA) return 1
        if (!dateB) return -1
        return dateA.localeCompare(dateB)
      })
  }, [entries])

  const updateValue = useCallback(
    (fieldPath: string, value: any) => {
      dispatchFields({ type: 'UPDATE', path: fieldPath, value })
    },
    [dispatchFields],
  )

  const handleAdd = useCallback(() => {
    addFieldRow({
      path,
      schemaPath,
      rowIndex: entries.length,
    })
    // Set defaults for the new row after adding
    setTimeout(() => {
      const idx = entries.length
      dispatchFields({ type: 'UPDATE', path: `${path}.${idx}.date`, value: new Date().toISOString() })
      dispatchFields({ type: 'UPDATE', path: `${path}.${idx}.serviceArea`, value: 'google_ads' })
    }, 50)
  }, [addFieldRow, path, schemaPath, entries.length, dispatchFields])

  const handleRemove = useCallback(
    (index: number) => {
      removeFieldRow({ path, rowIndex: index })
    },
    [removeFieldRow, path],
  )

  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--theme-text)' }}>
            Account Timeline
          </span>
          <span style={{ fontSize: 13, color: 'var(--theme-elevation-500, #6b7280)', marginLeft: 8 }}>
            {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
          </span>
        </div>
        <button
          type="button"
          onClick={handleAdd}
          style={{
            padding: '6px 14px',
            background: '#3b82f6',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            fontWeight: 600,
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          + Add Entry
        </button>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              <th style={{ ...headerStyle, width: 130 }}>Date</th>
              <th style={{ ...headerStyle, width: 140 }}>Service</th>
              <th style={{ ...headerStyle, width: 220 }}>Action</th>
              <th style={headerStyle}>Description</th>
              <th style={{ ...headerStyle, width: 44, textAlign: 'center' }}></th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 && (
              <tr>
                <td colSpan={5} style={{ ...cellStyle, textAlign: 'center', color: 'var(--theme-elevation-400, #9ca3af)', padding: '20px 8px', fontStyle: 'italic' }}>
                  No timeline entries yet — click &quot;+ Add Entry&quot; to log an account milestone
                </td>
              </tr>
            )}
            {sortedIndices.map((i) => {
              const entry = entries[i]
              return (
                <tr key={i}>
                  <td style={cellStyle}>
                    <input
                      type="date"
                      value={entry.date ? entry.date.split('T')[0] : ''}
                      onChange={(e) => updateValue(`${path}.${i}.date`, e.target.value ? new Date(e.target.value + 'T12:00:00').toISOString() : '')}
                      style={{ ...inputStyle, width: 130 }}
                    />
                  </td>
                  <td style={cellStyle}>
                    <select
                      value={entry.serviceArea}
                      onChange={(e) => updateValue(`${path}.${i}.serviceArea`, e.target.value)}
                      style={selectStyle}
                    >
                      {SERVICE_AREAS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </td>
                  <td style={cellStyle}>
                    <select
                      value={entry.actionType}
                      onChange={(e) => updateValue(`${path}.${i}.actionType`, e.target.value)}
                      style={selectStyle}
                    >
                      <option value="">— Select —</option>
                      {ACTION_TYPES.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </td>
                  <td style={cellStyle}>
                    <input
                      type="text"
                      value={entry.description}
                      onChange={(e) => updateValue(`${path}.${i}.description`, e.target.value)}
                      placeholder="What was done..."
                      style={inputStyle}
                    />
                  </td>
                  <td style={{ ...cellStyle, textAlign: 'center' }}>
                    <button
                      type="button"
                      onClick={() => handleRemove(i)}
                      title="Remove entry"
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: 'var(--theme-elevation-400, #9ca3af)',
                        fontSize: 16,
                        padding: '2px 6px',
                        borderRadius: 4,
                        lineHeight: 1,
                      }}
                      onMouseOver={(e) => (e.currentTarget.style.color = '#ef4444')}
                      onMouseOut={(e) => (e.currentTarget.style.color = 'var(--theme-elevation-400, #9ca3af)')}
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default AccountTimelineTable
