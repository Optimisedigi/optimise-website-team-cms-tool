'use client'

import { useDocumentInfo, useField } from '@payloadcms/ui'
import { useState, useEffect } from 'react'

const KeywordCategoryExcluder = () => {
  const { id } = useDocumentInfo()
  const { value, setValue } = useField<string[] | string | null>({ path: 'hiddenKeywordCategories' })
  const [categories, setCategories] = useState<string[]>([])
  const [loading, setLoading] = useState(false)

  // Normalize value — could be an array, a JSON string, or null
  const hidden: string[] = Array.isArray(value)
    ? value
    : typeof value === 'string' && value.startsWith('[')
      ? (() => { try { return JSON.parse(value) } catch { return [] } })()
      : []

  useEffect(() => {
    if (!id) return
    let cancelled = false

    const fetchCategories = async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/client-proposals/${id}?depth=0`, { credentials: 'include' })
        if (res.ok) {
          const proposal = await res.json()
          const cats = proposal.keywordCategories as { categoryName: string }[] | undefined
          if (cats && cats.length > 0 && !cancelled) {
            setCategories(cats.map(c => c.categoryName).filter(Boolean))
          }
        }
      } catch {
        // Silently fail
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchCategories()
    return () => { cancelled = true }
  }, [id])

  if (!id) return null

  if (loading) {
    return (
      <div style={{ marginBottom: 16, fontSize: 13, color: 'var(--theme-elevation-600)' }}>
        Loading keyword categories...
      </div>
    )
  }

  if (categories.length === 0) {
    return (
      <div style={{ marginBottom: 16, fontSize: 13, color: 'var(--theme-elevation-500)' }}>
        No keyword categories found. Add keyword categories in the Audit Inputs tab first.
      </div>
    )
  }

  const toggle = (name: string) => {
    const next = hidden.includes(name)
      ? hidden.filter((n) => n !== name)
      : [...hidden, name]
    setValue(next)
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <label
        style={{
          display: 'block',
          marginBottom: 8,
          fontSize: 13,
          fontWeight: 600,
          color: 'var(--theme-elevation-800)',
        }}
      >
        Hide Keyword Categories from the Report
      </label>
      <p style={{ marginBottom: 8, fontSize: 12, color: 'var(--theme-elevation-500)' }}>
        Checked categories will be hidden from every slide that lists keyword categories: Mission Brief (categories card), Keyword Landscape, and Organic Propulsion.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {categories.map((name) => (
          <label
            key={name}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 13,
              cursor: 'pointer',
              padding: '4px 0',
            }}
          >
            <input
              type="checkbox"
              checked={hidden.includes(name)}
              onChange={() => toggle(name)}
            />
            <span>{name}</span>
          </label>
        ))}
      </div>
    </div>
  )
}

export default KeywordCategoryExcluder
