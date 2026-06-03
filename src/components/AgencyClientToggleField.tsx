'use client'

import { CheckboxInput, FieldDescription, FieldError, useDocumentInfo, useEditDepth, useField } from '@payloadcms/ui'
import { useEffect, useMemo, useState } from 'react'
import type { CheckboxFieldClientComponent } from 'payload'

type AgencyClient = {
  id: number | string
  name?: string | null
}

const AgencyClientToggleField: CheckboxFieldClientComponent = (props) => {
  const {
    id,
    field,
    field: {
      admin: { description } = {},
      label,
      required,
    } = {},
    path: pathFromProps,
    readOnly,
  } = props
  const { id: documentId } = useDocumentInfo()
  const editDepth = useEditDepth()
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
  const fieldID = id || `${path}-${editDepth}`

  const styles = useMemo(() => {
    return field?.admin?.style ?? undefined
  }, [field])

  if (hideToggle) {
    return (
      <div className="field-type checkbox" style={styles}>
        <p style={{ color: '#6b7280', fontSize: 12, margin: 0 }}>
          Agency client is already set to <strong>{agencyClient?.name || `client #${agencyClient?.id}`}</strong>.
        </p>
      </div>
    )
  }

  return (
    <div className={`field-type checkbox${value ? ' checkbox--checked' : ''}`} style={styles}>
      <FieldError path={path} showError={showError} />
      <CheckboxInput
        checked={Boolean(value)}
        id={fieldID}
        label={label}
        name={path}
        onToggle={() => {
          if (readOnly || loading) return
          setValue(!value)
        }}
        readOnly={readOnly || loading}
        required={required}
      />
      <FieldDescription description={description} path={path} />
    </div>
  )
}

export default AgencyClientToggleField
