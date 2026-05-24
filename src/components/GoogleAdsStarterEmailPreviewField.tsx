'use client'

import { useFormFields } from '@payloadcms/ui'
import { useEffect, useMemo, useState } from 'react'
import { buildGoogleAdsStarterEmailPreview } from '../lib/google-ads-starter-email-preview'

interface FieldSnapshot {
  googleAdsStarterSubjectTemplate: string
  googleAdsStarterOpening: string
  googleAdsStarterReadinessFragments: Array<{ slug?: string; copy?: string }>
  googleAdsStarterGoalFragments: Array<{ slug?: string; copy?: string }>
  googleAdsStarterWebsiteFragments: Array<{ slug?: string; copy?: string }>
  googleAdsStarterBudgetFragments: Array<{ slug?: string; copy?: string }>
  googleAdsStarterQuestionsIntro: string
  googleAdsStarterClosing: string
}

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
  }))

  const [debounced, setDebounced] = useState<FieldSnapshot>(fieldMap)

  useEffect(() => {
    const timeout = setTimeout(() => setDebounced(fieldMap), 300)
    return () => clearTimeout(timeout)
  }, [fieldMap])

  const result = useMemo(() => {
    try {
      return buildGoogleAdsStarterEmailPreview(debounced)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return {
        subject: '(preview error)',
        html: `<pre style="color:#b91c1c;font-family:monospace;padding:12px;">${message}</pre>`,
      }
    }
  }, [debounced])

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
          <span>Live preview (sample: new Google Ads lead)</span>
          <span style={{ fontWeight: 400, color: 'var(--theme-elevation-500)' }}>Subject: {result.subject}</span>
        </div>
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
