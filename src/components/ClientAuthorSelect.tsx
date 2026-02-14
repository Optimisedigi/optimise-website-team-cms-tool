'use client'

import { useField, useAllFormFields } from '@payloadcms/ui'
import { useEffect, useState } from 'react'

type AuthorEntry = {
  name: string
  jobTitle?: string | null
}

const ClientAuthorSelect = () => {
  const { value, setValue } = useField<string>({ path: 'author' })
  const [fields] = useAllFormFields()
  const clientId = fields?.client?.value as string | undefined

  const [authors, setAuthors] = useState<AuthorEntry[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!clientId) {
      setAuthors([])
      return
    }

    setLoading(true)
    fetch(`/api/clients/${clientId}?depth=0`)
      .then((res) => res.json())
      .then((data) => {
        const raw = data?.authors as AuthorEntry[] | undefined
        if (Array.isArray(raw) && raw.length > 0) {
          setAuthors(raw.filter((a) => a.name))
        } else {
          setAuthors([])
        }
      })
      .catch(() => setAuthors([]))
      .finally(() => setLoading(false))
  }, [clientId])

  if (!clientId) {
    return (
      <div style={{ marginBottom: 20 }}>
        <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>Author</label>
        <p style={{ color: '#888', fontSize: 13 }}>Select a client first to see authors.</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div style={{ marginBottom: 20 }}>
        <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>Author</label>
        <p style={{ color: '#888', fontSize: 13 }}>Loading authors…</p>
      </div>
    )
  }

  if (authors.length === 0) {
    return (
      <div style={{ marginBottom: 20 }}>
        <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>Author</label>
        <p style={{ color: '#888', fontSize: 13 }}>
          No authors configured for this client. Add them in the Client &gt; Authors tab.
        </p>
      </div>
    )
  }

  return (
    <div style={{ marginBottom: 20 }}>
      <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>Author</label>
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
        <option value="">— Select an author —</option>
        {authors.map((author) => (
          <option key={author.name} value={author.name}>
            {author.name}{author.jobTitle ? ` — ${author.jobTitle}` : ''}
          </option>
        ))}
      </select>
      <p style={{ color: '#888', fontSize: 12, marginTop: 4 }}>
        Author name as it should appear on the post.
      </p>
    </div>
  )
}

export default ClientAuthorSelect
