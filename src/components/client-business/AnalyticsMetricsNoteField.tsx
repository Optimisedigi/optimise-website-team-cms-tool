'use client'

import { useField } from '@payloadcms/ui'
import type { SelectFieldClientProps } from 'payload'
import type React from 'react'
import { normalizeOptions } from './options'

/** One muted line summarising the legacy `clientPulse.analyticsMetrics` selection. */
export default function AnalyticsMetricsNoteField(props: SelectFieldClientProps): React.ReactElement | null {
  const path = props.path || 'clientPulse.analyticsMetrics'
  const { value } = useField<string[] | string | null>({ path })
  const options = normalizeOptions(props.field?.options)
  const values = Array.isArray(value) ? value : typeof value === 'string' && value ? [value] : []
  if (values.length === 0) return null
  const labels = values.map((v) => options.find((o) => o.value === v)?.label ?? v)
  return (
    <p className="od-biz-muted-line">
      Legacy metric selection: {labels.join(', ')}. Used only until card metrics are set.
    </p>
  )
}
