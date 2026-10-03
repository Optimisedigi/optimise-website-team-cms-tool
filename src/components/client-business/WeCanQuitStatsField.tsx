'use client'

import { useFormFields } from '@payloadcms/ui'
import type React from 'react'

const toNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null

/** "3 Oct, 9:12 am" in Sydney time. Returns '' for invalid input. */
export function formatSyncedAt(value: unknown): string {
  if (typeof value !== 'string' && !(value instanceof Date)) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const parts = new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Sydney',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).formatToParts(date)
  const get = (type: Intl.DateTimeFormatPartTypes): string => parts.find((p) => p.type === type)?.value ?? ''
  return `${get('day')} ${get('month')}, ${get('hour')}:${get('minute')} ${get('dayPeriod').toLowerCase()}`
}

const formatCount = (value: number): string => value.toLocaleString('en-AU')

function Stat({ label, value, target }: { label: string; value: number | null; target: number | null }): React.ReactElement {
  return (
    <div className="od-biz-stat">
      <span className="od-biz-stat__label">{label}</span>
      <span className="od-biz-stat__value od-biz-num">
        {formatCount(value ?? 0)}
        {target !== null && target > 0 ? (
          <span className="od-biz-stat__target"> / {formatCount(target)}</span>
        ) : null}
      </span>
    </div>
  )
}

/** UI field: WeCanQuit assessment / prescription counters against their targets. */
export default function WeCanQuitStatsField(): React.ReactElement {
  const assessments = useFormFields(([f]) => toNumber(f?.wcqAssessmentsCompleted?.value))
  const prescriptions = useFormFields(([f]) => toNumber(f?.wcqPrescriptionCount?.value))
  const assessmentTarget = useFormFields(([f]) => toNumber(f?.wcqAssessmentTarget?.value))
  const prescriptionTarget = useFormFields(([f]) => toNumber(f?.wcqPrescriptionTarget?.value))
  return (
    <div className="od-biz-stats">
      <Stat label="Assessments (paid + completed)" value={assessments} target={assessmentTarget} />
      <Stat label="Prescriptions" value={prescriptions} target={prescriptionTarget} />
    </div>
  )
}

/** Section-header label: "Last synced 3 Oct, 9:12 am" or "Not synced yet". */
export function WeCanQuitSyncedLabel(): React.ReactElement {
  const syncedAt = useFormFields(([f]) => f?.wcqMetricsLastSyncedAt?.value)
  const formatted = formatSyncedAt(syncedAt)
  return (
    <span className="od-biz-synced">{formatted ? `Last synced ${formatted}` : 'Not synced yet'}</span>
  )
}
