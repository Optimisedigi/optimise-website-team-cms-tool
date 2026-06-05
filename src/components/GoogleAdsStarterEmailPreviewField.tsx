'use client'

import { useFormFields } from '@payloadcms/ui'
import { useEffect, useState } from 'react'

type PreviewVariant = 'google-ads-starter' | 'google-ads-starter-cpa' | 'google-ads-audit'

interface FieldSnapshot {
  googleAdsStarterSubjectTemplate: string
  googleAdsStarterOpening: string
  googleAdsStarterReadinessFragments: Array<{ slug?: string; copy?: string }>
  googleAdsStarterGoalFragments: Array<{ slug?: string; copy?: string }>
  googleAdsStarterWebsiteFragments: Array<{ slug?: string; copy?: string }>
  googleAdsStarterBudgetFragments: Array<{ slug?: string; copy?: string }>
  googleAdsStarterQuestionsIntro: string
  googleAdsStarterClosing: string
  signatureHtml: string
}

interface PreviewResult {
  subject: string
  html: string
}

const WEBSITE_URL = process.env.NEXT_PUBLIC_WEBSITE_URL || 'https://www.optimisedigital.online'

const PREVIEW_TABS: Array<{ label: string; variant: PreviewVariant }> = [
  { label: 'Starter', variant: 'google-ads-starter' },
  { label: 'Starter + CPA', variant: 'google-ads-starter-cpa' },
  { label: 'Audit', variant: 'google-ads-audit' },
]

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function asFragments(value: unknown): Array<{ slug?: string; copy?: string }> {
  return Array.isArray(value) ? (value as Array<{ slug?: string; copy?: string }>) : []
}

const GoogleAdsStarterEmailPreviewField = () => {
  const fieldMap = useFormFields(([fields]) => ({
    googleAdsStarterSubjectTemplate: asString(fields?.googleAdsStarterSubjectTemplate?.value),
    googleAdsStarterOpening: asString(fields?.googleAdsStarterOpening?.value),
    googleAdsStarterReadinessFragments: asFragments(fields?.googleAdsStarterReadinessFragments?.value),
    googleAdsStarterGoalFragments: asFragments(fields?.googleAdsStarterGoalFragments?.value),
    googleAdsStarterWebsiteFragments: asFragments(fields?.googleAdsStarterWebsiteFragments?.value),
    googleAdsStarterBudgetFragments: asFragments(fields?.googleAdsStarterBudgetFragments?.value),
    googleAdsStarterQuestionsIntro: asString(fields?.googleAdsStarterQuestionsIntro?.value),
    googleAdsStarterClosing: asString(fields?.googleAdsStarterClosing?.value),
    signatureHtml: asString(fields?.signatureHtml?.value),
  }))

  const [activeVariant, setActiveVariant] = useState<PreviewVariant>('google-ads-starter')
  const [debounced, setDebounced] = useState<FieldSnapshot>(fieldMap)
  const [result, setResult] = useState<PreviewResult>({ subject: 'Loading preview…', html: '' })
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const timeout = setTimeout(() => setDebounced(fieldMap), 300)
    return () => clearTimeout(timeout)
  }, [fieldMap])

  useEffect(() => {
    const controller = new AbortController()

    async function fetchPreview() {
      setIsLoading(true)
      setError(null)

      try {
        const response = await fetch(`${WEBSITE_URL}/api/email-previews`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ variant: activeVariant, templates: debounced }),
          signal: controller.signal,
        })

        if (!response.ok) {
          throw new Error(`Preview request failed with status ${response.status}`)
        }

        const preview = (await response.json()) as PreviewResult
        setResult(preview)
      } catch (err) {
        if (controller.signal.aborted) return
        const message = err instanceof Error ? err.message : String(err)
        setError(message)
        setResult({
          subject: '(preview error)',
          html: `<pre style="color:#b91c1c;font-family:monospace;padding:12px;white-space:pre-wrap;">${message}</pre>`,
        })
      } finally {
        if (!controller.signal.aborted) setIsLoading(false)
      }
    }

    void fetchPreview()

    return () => controller.abort()
  }, [activeVariant, debounced])

  return (
    <div style={{ marginBottom: 16 }}>
      <div
        style={{
          border: '1px solid var(--theme-elevation-100)',
          borderRadius: 6,
          overflow: 'hidden',
          background: '#fff',
        }}
      >
        <div
          style={{
            padding: '6px 12px',
            background: 'var(--theme-elevation-50)',
            fontSize: 12,
            color: 'var(--theme-elevation-600)',
            fontWeight: 600,
            display: 'flex',
            justifyContent: 'space-between',
            gap: 8,
          }}
        >
          <span>Live preview only — edit the fields below. Shared signature is pulled from the Signature tab.</span>
          <span style={{ fontWeight: 400, color: 'var(--theme-elevation-500)' }}>
            {isLoading ? 'Loading… ' : ''}Subject: {result.subject}
          </span>
        </div>
        <div
          style={{
            display: 'flex',
            gap: 6,
            padding: '8px 12px',
            borderBottom: '1px solid var(--theme-elevation-100)',
            background: '#fff',
          }}
        >
          {PREVIEW_TABS.map((tab) => {
            const isActive = tab.variant === activeVariant
            return (
              <button
                key={tab.variant}
                type="button"
                onClick={() => setActiveVariant(tab.variant)}
                style={{
                  border: '1px solid var(--theme-elevation-150)',
                  borderRadius: 4,
                  cursor: 'pointer',
                  padding: '6px 10px',
                  background: isActive ? 'var(--theme-elevation-800)' : 'var(--theme-elevation-50)',
                  color: isActive ? '#fff' : 'var(--theme-elevation-800)',
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                {tab.label}
              </button>
            )
          })}
        </div>
        {error ? (
          <div
            style={{
              padding: '8px 12px',
              background: '#fef2f2',
              color: '#b91c1c',
              fontSize: 12,
              borderBottom: '1px solid #fecaca',
            }}
          >
            Could not load the website-rendered email preview. {error}
          </div>
        ) : null}
        <iframe
          title="Google Ads starter email preview"
          srcDoc={result.html}
          sandbox=""
          style={{ width: '100%', minHeight: 640, border: 0, background: '#fff' }}
        />
      </div>
    </div>
  )
}

export default GoogleAdsStarterEmailPreviewField
