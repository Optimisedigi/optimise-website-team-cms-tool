'use client'

import { useField, useAllFormFields } from '@payloadcms/ui'
import { useEffect, useState } from 'react'

const MAX_TAGS = 3

const ClientTagsSelect = () => {
  const { value, setValue } = useField<string[]>({ path: 'tags' })
  const [fields] = useAllFormFields()
  const clientId = fields?.client?.value as string | undefined

  const [availableTags, setAvailableTags] = useState<string[]>([])
  const [loading, setLoading] = useState(false)

  const selected: string[] = Array.isArray(value) ? value : []

  useEffect(() => {
    if (!clientId) {
      setAvailableTags([])
      return
    }

    setLoading(true)
    fetch(`/api/clients/${clientId}?depth=0`)
      .then((res) => res.json())
      .then((data) => {
        const raw = data?.blogTags as string | undefined
        if (raw) {
          setAvailableTags(
            raw
              .split('\n')
              .map((s: string) => s.trim())
              .filter(Boolean)
          )
        } else {
          setAvailableTags([])
        }
      })
      .catch(() => setAvailableTags([]))
      .finally(() => setLoading(false))
  }, [clientId])

  const addTag = (tag: string) => {
    if (!tag || selected.includes(tag) || selected.length >= MAX_TAGS) return
    setValue([...selected, tag])
  }

  const removeTag = (tag: string) => {
    setValue(selected.filter((t) => t !== tag))
  }

  if (!clientId) {
    return (
      <div style={{ marginBottom: 20 }}>
        <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>Tags</label>
        <p style={{ color: '#888', fontSize: 13 }}>Select a client first to see tags.</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div style={{ marginBottom: 20 }}>
        <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>Tags</label>
        <p style={{ color: '#888', fontSize: 13 }}>Loading tags…</p>
      </div>
    )
  }

  if (availableTags.length === 0) {
    return (
      <div style={{ marginBottom: 20 }}>
        <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>Tags</label>
        <p style={{ color: '#888', fontSize: 13 }}>
          No tags configured for this client. Add them in the Client settings.
        </p>
      </div>
    )
  }

  const remainingOptions = availableTags.filter((t) => !selected.includes(t))
  const atLimit = selected.length >= MAX_TAGS

  return (
    <div style={{ marginBottom: 20 }}>
      <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>
        Tags ({selected.length}/{MAX_TAGS})
      </label>

      {selected.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
          {selected.map((tag) => (
            <span
              key={tag}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '5px 12px',
                fontSize: 13,
                borderRadius: 20,
                background: '#3b82f6',
                color: '#fff',
                fontWeight: 500,
              }}
            >
              {tag}
              <button
                type="button"
                onClick={() => removeTag(tag)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#fff',
                  cursor: 'pointer',
                  padding: 0,
                  fontSize: 15,
                  lineHeight: 1,
                  fontWeight: 700,
                }}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {!atLimit && remainingOptions.length > 0 && (
        <select
          value=""
          onChange={(e) => {
            addTag(e.target.value)
            e.target.value = ''
          }}
          style={{
            width: '100%',
            padding: '10px 12px',
            fontSize: 14,
            border: '1px solid var(--theme-elevation-150, #ccc)',
            borderRadius: 4,
            background: 'var(--theme-input-bg, #fff)',
            color: 'var(--theme-text, #333)',
          }}
        >
          <option value="">— Select a tag —</option>
          {remainingOptions.map((tag) => (
            <option key={tag} value={tag}>
              {tag}
            </option>
          ))}
        </select>
      )}

      {atLimit && (
        <p style={{ color: '#888', fontSize: 12, marginTop: 4 }}>
          Maximum of {MAX_TAGS} tags reached. Remove a tag to add a different one.
        </p>
      )}
    </div>
  )
}

export default ClientTagsSelect
