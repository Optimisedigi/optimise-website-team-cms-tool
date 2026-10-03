'use client'

/**
 * Custom Field for the `googleMapsUrls` array (maxRows 10) on Clients.
 * Inline-editable table bound to `${path}.${i}.label` / `${path}.${i}.url`.
 */
import { useAllFormFields, useForm } from '@payloadcms/ui'
import { useCallback, useMemo } from 'react'

type FieldState = { value?: unknown; errorMessage?: string; valid?: boolean }

export const MAX_LISTINGS = 10

type ListingRow = { url: string; label: string }

function extractRows(fields: Record<string, FieldState>, basePath: string): ListingRow[] {
  const rows: ListingRow[] = []
  let i = 0
  while (
    fields[`${basePath}.${i}.url`] !== undefined ||
    fields[`${basePath}.${i}.label`] !== undefined ||
    fields[`${basePath}.${i}.id`] !== undefined
  ) {
    rows.push({
      url: String(fields[`${basePath}.${i}.url`]?.value ?? ''),
      label: String(fields[`${basePath}.${i}.label`]?.value ?? ''),
    })
    i++
  }
  return rows
}

function MapsListingsField(props: {
  path?: string
  schemaPath?: string
  field?: { label?: unknown; maxRows?: number; admin?: { description?: string } }
}): React.ReactElement {
  const path = props?.path || 'googleMapsUrls'
  const schemaPath = props?.schemaPath || 'googleMapsUrls'
  const maxRows = props?.field?.maxRows ?? MAX_LISTINGS
  const [fields, dispatchFields] = useAllFormFields()
  const { addFieldRow, removeFieldRow } = useForm()

  const typedFields = fields as Record<string, FieldState>
  const rows = useMemo(() => extractRows(typedFields, path), [typedFields, path])

  const update = useCallback(
    (index: number, sub: 'url' | 'label', value: string) => {
      dispatchFields({ type: 'UPDATE', path: `${path}.${index}.${sub}`, value })
    },
    [dispatchFields, path],
  )

  const handleAdd = useCallback(() => {
    addFieldRow({ path, schemaPath, rowIndex: rows.length })
  }, [addFieldRow, path, schemaPath, rows.length])

  return (
    <div className="field-type od-biz-maps">
      <div className="od-biz-table-wrap">
        <table className="od-biz-table">
          <thead>
            <tr>
              <th scope="col" className="od-biz-maps__label-col">
                Label
              </th>
              <th scope="col">Google Maps URL</th>
              <th scope="col" className="od-biz-maps__x-col">
                <span className="od-biz-sr-only">Remove</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const name = row.label || `listing ${index + 1}`
              const urlState = typedFields[`${path}.${index}.url`]
              const urlError =
                urlState && urlState.valid === false ? urlState.errorMessage : undefined
              return (
                <tr key={index}>
                  <td>
                    <input
                      className="od-biz-cell-input"
                      aria-label={`Label for listing ${index + 1}`}
                      placeholder="e.g. Head Office"
                      value={row.label}
                      onChange={(e) => update(index, 'label', e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      type="url"
                      className="od-biz-cell-input od-biz-maps__url"
                      aria-label={`Google Maps URL for listing ${index + 1}`}
                      aria-invalid={urlError ? true : undefined}
                      placeholder="https://maps.google.com/…"
                      value={row.url}
                      onChange={(e) => update(index, 'url', e.target.value)}
                    />
                    {urlError && <p className="od-biz-error">{urlError}</p>}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="od-biz-remove"
                      aria-label={`Remove ${name}`}
                      title="Remove"
                      onClick={() => removeFieldRow({ path, rowIndex: index })}
                    >
                      ×
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {rows.length < maxRows && (
          <div className="od-biz-table-foot">
            <button type="button" className="od-biz-link" onClick={handleAdd}>
              + Add listing <small>(up to {maxRows})</small>
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default MapsListingsField
