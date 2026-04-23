'use client'

import { useField } from '@payloadcms/ui'
import { useMemo } from 'react'

type DayRow = {
  day: string
  enabled: boolean
  start: string
  end: string
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const DEFAULT_SCHEDULE: DayRow[] = DAYS.map((day) => ({
  day,
  enabled: day !== 'Sat' && day !== 'Sun',
  start: '09:00',
  end: '17:00',
}))

function normalise(value: unknown): DayRow[] {
  if (!Array.isArray(value) || value.length !== 7) return DEFAULT_SCHEDULE
  return DAYS.map((day, i) => {
    const row = value[i] as any
    return {
      day,
      enabled: row?.enabled !== false,
      start: typeof row?.start === 'string' ? row.start : '09:00',
      end: typeof row?.end === 'string' ? row.end : '17:00',
    }
  })
}

export default function MeetingSchedulerDaySchedule() {
  const { value, setValue } = useField<unknown>({ path: 'daySchedule' })
  const schedule = useMemo(() => normalise(value), [value])

  const updateRow = (idx: number, patch: Partial<DayRow>) => {
    const next = schedule.map((row, i) => (i === idx ? { ...row, ...patch } : row))
    setValue(next)
  }

  return (
    <div className="field-type" style={{ marginBottom: 24 }}>
      <label style={styles.label}>Day Schedule</label>
      <p style={styles.help}>
        Set available hours per day of the week. Disabled days are skipped when generating slots.
      </p>
      <div style={styles.table}>
        <div style={{ ...styles.row, ...styles.headerRow }}>
          <div style={styles.cellDay}>Day</div>
          <div style={styles.cellEnabled}>Enabled</div>
          <div style={styles.cellTime}>Start</div>
          <div style={styles.cellTime}>End</div>
        </div>
        {schedule.map((row, idx) => (
          <div key={row.day} style={{ ...styles.row, opacity: row.enabled ? 1 : 0.55 }}>
            <div style={styles.cellDay}>{row.day}</div>
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
                style={styles.input}
              />
            </div>
            <div style={styles.cellTime}>
              <input
                type="time"
                value={row.end}
                disabled={!row.enabled}
                onChange={(e) => updateRow(idx, { end: e.target.value })}
                style={styles.input}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  label: {
    display: 'block',
    fontWeight: 600,
    marginBottom: 4,
    color: 'var(--theme-elevation-800)',
  },
  help: {
    margin: '0 0 10px',
    fontSize: 12,
    color: 'var(--theme-elevation-500)',
  },
  table: {
    border: '1px solid var(--theme-elevation-150)',
    borderRadius: 4,
    overflow: 'hidden',
  },
  row: {
    display: 'grid',
    gridTemplateColumns: '1fr 80px 1fr 1fr',
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
  cellDay: { fontWeight: 500 },
  cellEnabled: { textAlign: 'center' },
  cellTime: {},
  input: {
    width: '100%',
    padding: '4px 8px',
    border: '1px solid var(--theme-elevation-200)',
    borderRadius: 3,
    background: 'var(--theme-input-bg)',
    color: 'var(--theme-text)',
    fontSize: 13,
  },
}
