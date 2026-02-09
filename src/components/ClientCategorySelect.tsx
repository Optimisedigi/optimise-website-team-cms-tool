'use client'

import { useField, useAllFormFields } from '@payloadcms/ui'
import { useEffect, useState } from 'react'

const ClientCategorySelect = () => {
  const { value, setValue } = useField<string>({ path: 'category' })
  const [fields] = useAllFormFields()
  const clientId = fields?.client?.value as string | undefined

  const [categories, setCategories] = useState<string[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!clientId) {
      setCategories([])
      return
    }

    setLoading(true)
    fetch(`/api/clients/${clientId}?depth=0`)
      .then((res) => res.json())
      .then((data) => {
        const raw = data?.blogCategories as string | undefined
        if (raw) {
          setCategories(
            raw
              .split('\n')
              .map((s: string) => s.trim())
              .filter(Boolean)
          )
        } else {
          setCategories([])
        }
      })
      .catch(() => setCategories([]))
      .finally(() => setLoading(false))
  }, [clientId])

  if (!clientId) {
    return (
      <div style={{ marginBottom: 20 }}>
        <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>Category</label>
        <p style={{ color: '#888', fontSize: 13 }}>Select a client first to see categories.</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div style={{ marginBottom: 20 }}>
        <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>Category</label>
        <p style={{ color: '#888', fontSize: 13 }}>Loading categories…</p>
      </div>
    )
  }

  if (categories.length === 0) {
    return (
      <div style={{ marginBottom: 20 }}>
        <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>Category</label>
        <p style={{ color: '#888', fontSize: 13 }}>
          No categories configured for this client. Add them in the Client settings.
        </p>
      </div>
    )
  }

  return (
    <div style={{ marginBottom: 20 }}>
      <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>Category</label>
      <select
        value={value || ''}
        onChange={(e) => setValue(e.target.value || null)}
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
        <option value="">— Select a category —</option>
        {categories.map((cat) => (
          <option key={cat} value={cat}>
            {cat}
          </option>
        ))}
      </select>
      <p style={{ color: '#888', fontSize: 12, marginTop: 4 }}>
        Primary category for this post.
      </p>
    </div>
  )
}

export default ClientCategorySelect
