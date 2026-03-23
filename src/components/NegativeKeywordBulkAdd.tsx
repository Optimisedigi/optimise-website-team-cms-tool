'use client'

import { useDocumentInfo, useField } from '@payloadcms/ui'
import { useState } from 'react'

/**
 * Parse bulk keywords input. Rules:
 * - One keyword per line
 * - [keyword] = phrase match
 * - "keyword" = phrase match (alternative syntax)
 * - Everything else = exact match (default)
 * - Empty lines are skipped
 * - Duplicates are skipped
 */
function parseKeywords(text: string): Array<{ keyword: string; matchType: string }> {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
  const seen = new Set<string>()
  const result: Array<{ keyword: string; matchType: string }> = []

  for (const line of lines) {
    let keyword = line
    let matchType = 'exact'

    // [keyword] = phrase match
    if (keyword.startsWith('[') && keyword.endsWith(']')) {
      keyword = keyword.slice(1, -1).trim()
      matchType = 'phrase'
    }
    // "keyword" = phrase match (alternative)
    else if (keyword.startsWith('"') && keyword.endsWith('"')) {
      keyword = keyword.slice(1, -1).trim()
      matchType = 'phrase'
    }

    if (!keyword) continue

    const key = `${keyword.toLowerCase()}|${matchType}`
    if (seen.has(key)) continue
    seen.add(key)

    result.push({ keyword, matchType })
  }

  return result
}

export default function NegativeKeywordBulkAdd() {
  const { initialData } = useDocumentInfo()
  const data = initialData as any
  const [text, setText] = useState('')
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  const existingKeywords: any[] = data?.keywords || []
  const parsed = text.trim() ? parseKeywords(text) : []

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

      const res = await fetch(`/api/negative-keyword-lists/${data.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keywords: mergedKeywords }),
      })

      if (res.ok) {
        const skipped = parsed.length - newKeywords.length
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
    <div style={{ marginBottom: 16 }}>
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
            background: 'var(--theme-elevation-50)',
            border: '1px solid var(--theme-elevation-150)',
            borderRadius: 8,
            padding: 16,
          }}
        >
          <div style={{ fontSize: 13, color: 'var(--theme-elevation-500)', marginBottom: 8, lineHeight: 1.5 }}>
            Paste keywords one per line. Default match type is <strong>exact</strong>.
            Wrap in square brackets for phrase match: <code>[keyword]</code>
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
[digital marketing]
[seo services]
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
          {!data?.id && (
            <div style={{ fontSize: 12, color: '#b45309', marginTop: 6 }}>
              Save the list first before bulk adding keywords.
            </div>
          )}
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
