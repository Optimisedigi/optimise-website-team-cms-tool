'use client'

/** Small uppercase divider heading ("Primary contact") from a `ui` field label. */

import type { UIFieldClientComponent } from 'payload'
import type { ReactNode } from 'react'

const BusinessEyebrow: UIFieldClientComponent = ({ field }): ReactNode => {
  const label = typeof field.label === 'string' ? field.label : ''
  if (!label) return null
  return <h3 className="od-biz-eyebrow">{label}</h3>
}

export default BusinessEyebrow
