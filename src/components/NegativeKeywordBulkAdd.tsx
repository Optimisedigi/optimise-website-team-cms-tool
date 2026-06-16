'use client'

import { useDocumentInfo } from '@payloadcms/ui'
import { useEffect, useState } from 'react'
import { parseNegativeKeywords } from '../lib/parse-negative-keywords'

export default function NegativeKeywordBulkAdd() {
  const { initialData } = useDocumentInfo()
  const data = initialData as any
  const [text, setText] = useState('')
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const existingKeywords: any[] = data?.keywords || []
  const parsed = text.trim() ? parseNegativeKeywords(text) : []

  if (!mounted || !data?.id) return null

  const handleAdd = async () => {
    if (parsed.length === 0 || !data?.id) return
    setSaving(true)
    setResult(null)

    try {
      // Merge with existing keywords, skip duplicates
      const existingSet = new Set(
        existingKeywords.map((kw: any) => `${kw.keyword?.toLowerCase()}|${kw.matchType}`)
      )
      const newKeywords = parsed.filter(
        (kw) => !existingSet.has(`${kw.keyword.toLowerCase()}|${kw.matchType}`)
      )

      if (newKeywords.length === 0) {
        setResult('All keywords already exist in this list.')
        setSaving(false)
        return
      }

      const mergedKeywords = [
        ...existingKeywords.map((kw: any) => ({
          keyword: kw.keyword,
          matchType: kw.matchType,
          flaggedForRemoval: kw.flaggedForRemoval || false,
        })),
        ...newKeywords.map((kw) => ({
          keyword: kw.keyword,
          matchType: kw.matchType,
          flaggedForRemoval: false,
        })),
      ]

      const skipped = parsed.length - newKeywords.length

      const res = await fetch(`/api/negative-keyword-lists/${data.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keywords: mergedKeywords }),
      })

      if (res.ok) {
        setResult(
          `Added ${newKeywords.length} keyword${newKeywords.length !== 1 ? 's' : ''}` +
          (skipped > 0 ? ` (${skipped} duplicate${skipped !== 1 ? 's' : ''} skipped)` : '') +
          '. Refresh the page to see them below.'
        )
        setText('')
      } else {
        setResult('Failed to save. Try again.')
      }
    } catch {
      setResult('Failed to save. Check your connection.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="negative-keyword-admin-panel" style={{
      position: 'relative',
      zIndex: 1,
      isolation: 'isolate',
      marginBottom: 16,
      color: '#1f2937',
      opacity: 1,
      filter: 'none',
      WebkitFilter: 'none',
    }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{
          background: 'var(--theme-elevation-100)',
          border: '1px solid var(--theme-elevation-200)',
          padding: '8px 16px',
          borderRadius: 6,
          cursor: 'pointer',
          fontSize: 13,
          fontWeight: 500,
          color: 'inherit',
        }}
      >
        {open ? 'Hide Bulk Add' : 'Bulk Add Keywords'}
      </button>

      {open && (
        <div
          style={{
            marginTop: 10,
            background: '#fff',
            border: '1px solid #d7dce3',
            borderRadius: 8,

            padding: 16,
          }}
        >
          <div style={{ fontSize: 13, color: '#374151', marginBottom: 8, lineHeight: 1.5 }}>
            Paste keywords one per line. Default match type is <strong>exact</strong>.
            Wrap in single quotes for phrase match: <code>'keyword'</code>
          </div>
          <div
            style={{
              background: 'var(--theme-elevation-100)',
              padding: '8px 12px',
              borderRadius: 4,
              fontSize: 12,
              fontFamily: 'monospace',
              lineHeight: 1.8,
              marginBottom: 10,
              whiteSpace: 'pre',
            }}
          >
{`free
cheap deals
'digital marketing'
'seo services'
competitor brand name`}
          </div>
          <textarea
            value={text}
            onChange={(e) => { setText(e.target.value); setResult(null) }}
            placeholder="Paste keywords here, one per line..."
            rows={8}
            style={{
              width: '100%',
              padding: '10px 12px',
              border: '1px solid var(--theme-elevation-200)',
              borderRadius: 4,
              fontSize: 13,
              fontFamily: 'monospace',
              background: 'var(--theme-input-bg, var(--theme-elevation-0))',
              color: 'inherit',
              resize: 'vertical',
              boxSizing: 'border-box',
            }}
          />
          {parsed.length > 0 && (
            <div style={{ fontSize: 12, color: 'var(--theme-elevation-500)', margin: '8px 0' }}>
              {parsed.length} keyword{parsed.length !== 1 ? 's' : ''} detected:
              {' '}{parsed.filter((k) => k.matchType === 'exact').length} exact,
              {' '}{parsed.filter((k) => k.matchType === 'phrase').length} phrase
            </div>
          )}
          <button
            type="button"
            onClick={handleAdd}
            disabled={saving || parsed.length === 0 || !data?.id}
            style={{
              background: '#213843',
              color: '#fff',
              border: 'none',
              padding: '8px 16px',
              borderRadius: 6,
              cursor: saving || parsed.length === 0 ? 'default' : 'pointer',
              fontSize: 13,
              fontWeight: 500,
              opacity: saving || parsed.length === 0 ? 0.5 : 1,
            }}
          >
            {saving ? 'Adding...' : `Add ${parsed.length} Keyword${parsed.length !== 1 ? 's' : ''}`}
          </button>

          {result && (
            <div
              style={{
                marginTop: 8,
                padding: '8px 12px',
                borderRadius: 6,
                fontSize: 12,
                background: result.startsWith('Failed') || result.startsWith('All') ? '#fef2f2' : '#f0fdf4',
                border: `1px solid ${result.startsWith('Failed') || result.startsWith('All') ? '#fecaca' : '#bbf7d0'}`,
                color: result.startsWith('Failed') || result.startsWith('All') ? '#991b1b' : '#166534',
              }}
            >
              {result}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
