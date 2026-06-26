'use client'

import { useAllFormFields, useField } from '@payloadcms/ui'
import { useMemo, useState } from 'react'

type KeywordResult = {
  keyword: string
  avgMonthlySearches: number
  competition?: string
  lowCpc?: number
  highCpc?: number
}

type CategoryResult = {
  categoryName: string
  sourceUrl?: string
  totalMonthlyVolume: number
  keywords: KeywordResult[]
}

type ResearchResult = {
  websiteUrl: string
  businessName?: string
  location: string
  generatedAt: string
  categories: CategoryResult[]
}

type CategoryRow = {
  categoryName: string
  keywords: string
}

const nf = new Intl.NumberFormat('en-US')

function getFieldValue(fields: Record<string, any>, path: string): string {
  const value = fields?.[path]?.value
  return typeof value === 'string' ? value : ''
}

function categoryText(category: CategoryResult, selectedKeywords?: Set<string>) {
  return category.keywords
    .filter((kw) => !selectedKeywords || selectedKeywords.has(kw.keyword))
    .map((kw) => kw.keyword)
    .join('\n')
}

export default function KeywordResearchAutofill() {
  const [fields] = useAllFormFields()
  const { setValue } = useField<CategoryRow[]>({ path: 'keywordCategories' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ResearchResult | null>(null)
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set())
  const [selectedKeywords, setSelectedKeywords] = useState<Record<string, Set<string>>>({})
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [copied, setCopied] = useState<string | null>(null)

  const websiteUrl = getFieldValue(fields, 'websiteUrl')
  const businessName = getFieldValue(fields, 'businessName')
  const targetLocation = getFieldValue(fields, 'targetLocation') || 'us'
  const selectedCount = selectedCategories.size

  const remainingText = useMemo(() => {
    if (!result) return ''
    return result.categories
      .map((category) => {
        const categorySelected = selectedCategories.has(category.categoryName)
        const keywordSet = selectedKeywords[category.categoryName]
        const remainingKeywords = category.keywords.filter((kw) => !categorySelected || !keywordSet?.has(kw.keyword))
        if (remainingKeywords.length === 0) return ''
        return `${category.categoryName}\n${remainingKeywords.map((kw) => kw.keyword).join('\n')}`
      })
      .filter(Boolean)
      .join('\n\n')
  }, [result, selectedCategories, selectedKeywords])

  async function copyText(key: string, text: string) {
    await navigator.clipboard.writeText(text)
    setCopied(key)
    setTimeout(() => setCopied(null), 1500)
  }

  async function research() {
    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const res = await fetch('/api/client-proposals/keyword-research', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ websiteUrl, businessName, location: targetLocation }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || `Keyword research failed (${res.status})`)

      const categories = Array.isArray(data.categories) ? data.categories : []
      const topSix = new Set<string>(categories.slice(0, 6).map((category: CategoryResult) => category.categoryName))
      const keywordSelections: Record<string, Set<string>> = {}
      for (const category of categories) {
        keywordSelections[category.categoryName] = new Set(category.keywords.map((kw: KeywordResult) => kw.keyword))
      }
      setResult(data)
      setSelectedCategories(topSix)
      setSelectedKeywords(keywordSelections)
      setExpanded(new Set(categories.slice(0, 6).map((category: CategoryResult) => category.categoryName)))
    } catch (err: any) {
      setError(err.message || 'Keyword research failed')
    } finally {
      setLoading(false)
    }
  }

  function toggleCategory(category: CategoryResult) {
    setSelectedCategories((prev) => {
      const next = new Set(prev)
      if (next.has(category.categoryName)) {
        next.delete(category.categoryName)
      } else if (next.size < 6) {
        next.add(category.categoryName)
      }
      return next
    })
  }

  function toggleKeyword(categoryName: string, keyword: string) {
    setSelectedKeywords((prev) => {
      const next = { ...prev }
      const keywords = new Set(next[categoryName] || [])
      if (keywords.has(keyword)) keywords.delete(keyword)
      else keywords.add(keyword)
      next[categoryName] = keywords
      return next
    })
  }

  function applySelected() {
    if (!result) return
    const rows = result.categories
      .filter((category) => selectedCategories.has(category.categoryName))
      .slice(0, 6)
      .map((category) => ({
        categoryName: category.categoryName,
        keywords: categoryText(category, selectedKeywords[category.categoryName]),
      }))
    setValue(rows)
  }

  return (
    <div style={{ border: '1px solid var(--theme-elevation-150)', borderRadius: 8, padding: 16, marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <div>
          <strong>Keyword research autofill</strong>
          <p style={{ margin: '4px 0 0', color: 'var(--theme-elevation-600)' }}>
            Pulls website-based keyword categories from Growth Tools, then lets you choose the 6 to use.
          </p>
        </div>
        <button type="button" className="btn btn--style-primary btn--size-small" disabled={loading || !websiteUrl} onClick={research}>
          {loading ? 'Researching…' : 'Research keyword categories from website'}
        </button>
      </div>

      {!websiteUrl && <p style={{ color: '#b45309' }}>Add a website URL first.</p>}
      {loading && <p>This can take 1–3 minutes while Growth Tools crawls the site and checks Google Ads volume.</p>}
      {error && <p style={{ color: '#dc2626' }}>{error}</p>}

      {result && (
        <div style={{ marginTop: 16 }}>
          <p><strong>{selectedCount}/6 categories selected</strong> · {result.categories.length} categories found</p>
          <div style={{ display: 'grid', gap: 12 }}>
            {result.categories.map((category) => {
              const checked = selectedCategories.has(category.categoryName)
              const disabled = !checked && selectedCount >= 6
              const keywordSet = selectedKeywords[category.categoryName] || new Set<string>()
              const isExpanded = expanded.has(category.categoryName)
              return (
                <div key={category.categoryName} style={{ border: '1px solid var(--theme-elevation-150)', borderRadius: 6, padding: 12, opacity: disabled ? 0.6 : 1 }}>
                  <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input type="checkbox" checked={checked} disabled={disabled} onChange={() => toggleCategory(category)} />
                    <strong>{category.categoryName}</strong>
                    <span>{nf.format(category.totalMonthlyVolume)}/mo</span>
                    <span>{category.keywords.length} keywords</span>
                  </label>
                  <button type="button" className="btn btn--style-secondary btn--size-small" style={{ marginTop: 8 }} onClick={() => setExpanded((prev) => {
                    const next = new Set(prev)
                    if (next.has(category.categoryName)) next.delete(category.categoryName)
                    else next.add(category.categoryName)
                    return next
                  })}>
                    {isExpanded ? 'Hide keywords' : 'Show keywords'}
                  </button>
                  {isExpanded && (
                    <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
                      {category.keywords.map((kw) => (
                        <label key={kw.keyword} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <input type="checkbox" checked={keywordSet.has(kw.keyword)} onChange={() => toggleKeyword(category.categoryName, kw.keyword)} />
                          <span>{kw.keyword}</span>
                          <span style={{ color: 'var(--theme-elevation-600)' }}>{nf.format(kw.avgMonthlySearches)}/mo</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          <button type="button" className="btn btn--style-primary" style={{ marginTop: 16 }} disabled={selectedCount === 0} onClick={applySelected}>
            Use selected categories
          </button>

          <div style={{ marginTop: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <strong>Remaining categories / keywords</strong>
              <button type="button" className="btn btn--style-secondary btn--size-small" disabled={!remainingText} onClick={() => copyText('all', remainingText)}>
                {copied === 'all' ? 'Copied' : 'Copy all remaining'}
              </button>
            </div>
            <textarea readOnly value={remainingText} rows={10} style={{ width: '100%', marginTop: 8, fontFamily: 'monospace' }} />
            {result.categories.map((category) => {
              const categorySelected = selectedCategories.has(category.categoryName)
              const keywordSet = selectedKeywords[category.categoryName]
              const text = `${category.categoryName}\n${category.keywords
                .filter((kw) => !categorySelected || !keywordSet?.has(kw.keyword))
                .map((kw) => kw.keyword)
                .join('\n')}`.trim()
              if (!text || text === category.categoryName) return null
              return (
                <button key={category.categoryName} type="button" className="btn btn--style-secondary btn--size-small" style={{ marginRight: 8, marginTop: 8 }} onClick={() => copyText(category.categoryName, text)}>
                  {copied === category.categoryName ? 'Copied' : `Copy ${category.categoryName}`}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
