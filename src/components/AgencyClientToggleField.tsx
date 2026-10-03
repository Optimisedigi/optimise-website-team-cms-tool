'use client'

import { FieldError, useDocumentInfo, useField } from '@payloadcms/ui'
import { useEffect, useState } from 'react'
import type { CheckboxFieldClientComponent } from 'payload'
import { ToggleRow } from './client-business/ToggleRowField'

type AgencyClient = {
  id: number | string
  name?: string | null
}

const AgencyClientToggleField: CheckboxFieldClientComponent = (props) => {
  const {
    field: {
      admin: { description } = {},
      label,
    } = {},
    path: pathFromProps,
    readOnly,
  } = props
  const { id: documentId } = useDocumentInfo()
  const [agencyClient, setAgencyClient] = useState<AgencyClient | null>(null)
  const [loading, setLoading] = useState(true)

  const { path, setValue, showError, value } = useField<boolean>({
    path: pathFromProps || 'isAgency',
  })

  useEffect(() => {
    let cancelled = false

    const loadAgencyClient = async () => {
      setLoading(true)
      try {
        const response = await fetch('/api/clients/agency-client', { credentials: 'include' })
        if (!response.ok) return
        const data = (await response.json()) as { client?: AgencyClient | null }
        if (!cancelled) setAgencyClient(data.client ?? null)
      } catch {
        // Best-effort UI guard only. Server-side validation prevents duplicates.
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void loadAgencyClient()
    return () => {
      cancelled = true
    }
  }, [])

  const agencyId = agencyClient?.id !== undefined ? String(agencyClient.id) : null
  const currentId = documentId !== undefined && documentId !== null ? String(documentId) : null
  const anotherClientIsAgency = Boolean(agencyId && currentId && agencyId !== currentId)
  const hideToggle = anotherClientIsAgency && !value
  if (hideToggle) {
    return (
      <div className="field-type checkbox od-biz-toggle-field">
        <div className="od-biz-toggle-row">
          <div className="od-biz-toggle-row__text">
            <span className="od-biz-toggle-row__label">{typeof label === 'string' ? label : 'Agency account'}</span>
            <span className="od-biz-toggle-row__desc">
              Agency client is already set to <strong>{agencyClient?.name || `client #${agencyClient?.id}`}</strong>.
            </span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="field-type checkbox od-biz-toggle-field">
      <ToggleRow
        label={typeof label === 'string' ? label : 'Agency account'}
        description={typeof description === 'string' ? description : undefined}
        checked={Boolean(value)}
        disabled={Boolean(readOnly) || loading}
        onToggle={() => {
          if (readOnly || loading) return
          setValue(!value)
        }}
        error={<FieldError path={path} showError={showError} />}
      />
    </div>
  )
}

export default AgencyClientToggleField
