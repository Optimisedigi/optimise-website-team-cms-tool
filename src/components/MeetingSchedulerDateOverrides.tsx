'use client'

import { useField } from '@payloadcms/ui'
import { useMemo } from 'react'

type Override = {
  date: string // YYYY-MM-DD
  enabled: boolean
  start: string // HH:MM
  end: string // HH:MM
  preferred: string // HH:MM — optional ideal start; empty = earliest common slot wins
}

// A window that starts before this hour (24h) is flagged as a likely mistake —
// e.g. accidentally selecting 12am/1am/3am when no meeting would run then.
const EARLY_HOUR_THRESHOLD = 6 // 06:00 — flags any start in the 12am–6am range

function parseHour(time: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time)
  if (!match) return null
  const hour = Number(match[1])
  return Number.isFinite(hour) ? hour : null
}

function isEarlyMorning(time: string): boolean {
  const hour = parseHour(time)
  return hour !== null && hour < EARLY_HOUR_THRESHOLD
}

function normalise(value: unknown): Override[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((r) => r && typeof (r as any).date === 'string')
    .map((r: any) => ({
      date: r.date,
      enabled: r.enabled !== false,
      start: typeof r.start === 'string' ? r.start : '09:00',
      end: typeof r.end === 'string' ? r.end : '17:00',
      preferred: typeof r.preferred === 'string' ? r.preferred : '',
    }))
}

export default function MeetingSchedulerDateOverrides() {
  const { value, setValue } = useField<unknown>({ path: 'dateOverrides' })
  const rows = useMemo(() => normalise(value), [value])

  const updateRow = (idx: number, patch: Partial<Override>) => {
    const next = rows.map((r, i) => (i === idx ? { ...r, ...patch } : r))
    setValue(next)
  }

  const addRow = () => {
    const today = new Date().toISOString().slice(0, 10)
    setValue([...rows, { date: today, enabled: true, start: '09:00', end: '17:00', preferred: '' }])
  }

  const removeRow = (idx: number) => {
    setValue(rows.filter((_, i) => i !== idx))
  }

  return (
    <div className="field-type" style={{ marginBottom: 24 }}>
      <label style={styles.label}>Available Dates &amp; Times</label>
      <p style={styles.help}>
        Add each date you're available with the start and end of that day's window. Add as many rows as you need; each row is one specific date. Times are in the timezone selected above (am / pm shown by your browser locale). Set an optional <strong>Preferred</strong> time and the auto-match will try that time (and later) first, only falling back to earlier slots if no later time works for everyone.
      </p>
      <div style={styles.table}>
        {rows.length > 0 && (
          <div style={{ ...styles.row, ...styles.headerRow }}>
            <div style={styles.cellDate}>Date</div>
            <div style={styles.cellEnabled}>Enabled</div>
            <div style={styles.cellTime}>Start</div>
            <div style={styles.cellTime}>End</div>
            <div style={styles.cellTime}>Preferred</div>
            <div style={styles.cellRemove} />
          </div>
        )}
        {rows.map((row, idx) => {
          const showEarlyWarning =
            row.enabled && (isEarlyMorning(row.start) || isEarlyMorning(row.end))
          return (
            <div key={idx}>
              <div style={{ ...styles.row, opacity: row.enabled ? 1 : 0.55 }}>
                <div style={styles.cellDate}>
                  <input
                    type="date"
                    value={row.date}
                    onChange={(e) => updateRow(idx, { date: e.target.value })}
                    style={styles.input}
                  />
                </div>
                <div style={styles.cellEnabled}>
                  <input
                    type="checkbox"
                    checked={row.enabled}
                    onChange={(e) => updateRow(idx, { enabled: e.target.checked })}
                  />
                </div>
                <div style={styles.cellTime}>
                  <input
                    type="time"
                    value={row.start}
                    disabled={!row.enabled}
                    onChange={(e) => updateRow(idx, { start: e.target.value })}
                    style={{
                      ...styles.input,
                      ...(showEarlyWarning && isEarlyMorning(row.start) ? styles.inputWarn : {}),
                    }}
                  />
                </div>
                <div style={styles.cellTime}>
                  <input
                    type="time"
                    value={row.end}
                    disabled={!row.enabled}
                    onChange={(e) => updateRow(idx, { end: e.target.value })}
                    style={{
                      ...styles.input,
                      ...(showEarlyWarning && isEarlyMorning(row.end) ? styles.inputWarn : {}),
                    }}
                  />
                </div>
                <div style={styles.cellTime}>
                  <input
                    type="time"
                    value={row.preferred}
                    disabled={!row.enabled}
                    onChange={(e) => updateRow(idx, { preferred: e.target.value })}
                    style={styles.input}
                  />
                </div>
                <div style={styles.cellRemove}>
                  <button type="button" onClick={() => removeRow(idx)} style={styles.removeBtn}>
                    ×
                  </button>
                </div>
              </div>
              {showEarlyWarning && (
                <div style={styles.warnRow}>
                  ⚠ This window includes early-morning hours (12am–6am). Are you sure this is the
                  time you want to meet?
                </div>
              )}
            </div>
          )
        })}
        <div style={{ padding: 10, textAlign: 'center', borderTop: rows.length ? '1px solid var(--theme-elevation-100)' : 'none' }}>
          <button type="button" onClick={addRow} style={styles.addBtn}>
            + Add Date
          </button>
        </div>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  label: { display: 'block', fontWeight: 600, marginBottom: 4, color: 'var(--theme-elevation-800)' },
  help: { margin: '0 0 10px', fontSize: 12, color: 'var(--theme-elevation-500)' },
  table: { border: '1px solid var(--theme-elevation-150)', borderRadius: 4, overflow: 'hidden' },
  row: {
    display: 'grid',
    gridTemplateColumns: '1.5fr 70px 1fr 1fr 1fr 40px',
    alignItems: 'center',
    padding: '8px 12px',
    borderBottom: '1px solid var(--theme-elevation-100)',
    gap: 8,
  },
  headerRow: {
    background: 'var(--theme-elevation-50)',
    fontSize: 12,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    color: 'var(--theme-elevation-600)',
  },
  cellDate: {},
  cellEnabled: { textAlign: 'center' },
  cellTime: {},
  cellRemove: { textAlign: 'center' },
  input: {
    width: '100%',
    padding: '4px 8px',
    border: '1px solid var(--theme-elevation-200)',
    borderRadius: 3,
    background: 'var(--theme-input-bg)',
    color: 'var(--theme-text)',
    fontSize: 13,
  },
  inputWarn: {
    borderColor: 'var(--theme-error-500, #dc2626)',
    boxShadow: '0 0 0 1px var(--theme-error-500, #dc2626)',
  },
  warnRow: {
    padding: '6px 12px 8px',
    margin: '0',
    fontSize: 12,
    fontWeight: 500,
    color: 'var(--theme-error-700, #b91c1c)',
    background: 'var(--theme-error-50, #fef2f2)',
    borderBottom: '1px solid var(--theme-elevation-100)',
  },
  removeBtn: {
    width: 24,
    height: 24,
    border: '1px solid var(--theme-elevation-200)',
    background: 'var(--theme-elevation-50)',
    color: 'var(--theme-elevation-600)',
    borderRadius: 4,
    cursor: 'pointer',
    fontSize: 16,
    lineHeight: 1,
    padding: 0,
  },
  addBtn: {
    padding: '6px 14px',
    background: 'var(--theme-elevation-100)',
    border: '1px solid var(--theme-elevation-200)',
    borderRadius: 4,
    color: 'var(--theme-elevation-700)',
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
  },
}
