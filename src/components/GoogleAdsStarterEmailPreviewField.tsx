'use client'

import { useFormFields } from '@payloadcms/ui'
import { useEffect, useState } from 'react'

type PreviewVariant =
  | 'google-ads-starter'
  | 'google-ads-starter-cpa'
  | 'google-ads-audit-active-1'
  | 'google-ads-audit-active-2'
  | 'google-ads-audit-active-3'
  | 'google-ads-audit-active-4'
  | 'google-ads-audit-consultation-1'
  | 'google-ads-audit-consultation-2'
  | 'google-ads-audit-consultation-3'
  | 'google-ads-audit-consultation-4'
  | 'google-ads-audit-website-1'
  | 'google-ads-audit-website-2'
  | 'google-ads-audit-website-3'
  | 'google-ads-audit-website-4'

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

const PREVIEW_TABS: Array<{ label: string; variant: PreviewVariant; description: string }> = [
  {
    label: 'Starter',
    variant: 'google-ads-starter',
    description:
      'Sent immediately from the “Ready to get started with Google Ads?” starter form. This is the normal starter enquiry auto-reply using the editable fields below.',
  },
  {
    label: 'Starter + CPA',
    variant: 'google-ads-starter-cpa',
    description:
      'Same starter form preview, but with sample CPA calculator values included so you can see how that optional block appears when calculator data is submitted.',
  },
  {
    label: 'Active · Email 1',
    variant: 'google-ads-audit-active-1',
    description:
      'Google Ads Audit form → lead says they are currently spending on Google Ads. Email 1 is sent immediately after the audit request and asks for read-only Google Ads access.',
  },
  {
    label: 'Active · Email 2',
    variant: 'google-ads-audit-active-2',
    description:
      'Google Ads Audit form → currently spending on Google Ads. Email 2 is the +24 hour follow-up if read-only access has not been received.',
  },
  {
    label: 'Active · Email 3',
    variant: 'google-ads-audit-active-3',
    description:
      'Google Ads Audit form → currently spending on Google Ads. Email 3 is the +3 day resource email if access still has not been received.',
  },
  {
    label: 'Active · Email 4',
    variant: 'google-ads-audit-active-4',
    description:
      'Google Ads Audit form → currently spending on Google Ads. Email 4 is the +7 day closing-the-loop email.',
  },
  {
    label: 'Consult · Email 1',
    variant: 'google-ads-audit-consultation-1',
    description:
      'Google Ads Audit form → lead selects “not currently spending” and asks to talk to someone. Email 1 is sent immediately with the booking link.',
  },
  {
    label: 'Consult · Email 2',
    variant: 'google-ads-audit-consultation-2',
    description:
      'Google Ads Audit form → not currently spending + wants a consultation. Email 2 is the +24 hour nudge to book a call.',
  },
  {
    label: 'Consult · Email 3',
    variant: 'google-ads-audit-consultation-3',
    description:
      'Google Ads Audit form → not currently spending + wants a consultation. Email 3 is the +3 day useful-tools email.',
  },
  {
    label: 'Consult · Email 4',
    variant: 'google-ads-audit-consultation-4',
    description:
      'Google Ads Audit form → not currently spending + wants a consultation. Email 4 is the +7 day closing-the-loop email.',
  },
  {
    label: 'Website · Email 1',
    variant: 'google-ads-audit-website-1',
    description:
      'Google Ads Audit form → lead selects “not currently spending” and wants a website/campaign-structure audit before running ads. Email 1 confirms the website audit request.',
  },
  {
    label: 'Website · Email 2',
    variant: 'google-ads-audit-website-2',
    description:
      'Google Ads Audit form → not currently spending + wants website/campaign-structure audit. Email 2 is the +24 hour offer to walk through the audit.',
  },
  {
    label: 'Website · Email 3',
    variant: 'google-ads-audit-website-3',
    description:
      'Google Ads Audit form → not currently spending + wants website/campaign-structure audit. Email 3 is the +3 day useful-tools email.',
  },
  {
    label: 'Website · Email 4',
    variant: 'google-ads-audit-website-4',
    description:
      'Google Ads Audit form → not currently spending + wants website/campaign-structure audit. Email 4 is the +7 day closing-the-loop email.',
  },
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

  const activeTab = PREVIEW_TABS.find((tab) => tab.variant === activeVariant)

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
          <span>Live preview — Starter uses editable fields below; audit drip tabs show the hard-coded flow emails. Shared signature is pulled from the Signature tab where the live email uses it.</span>
          <span style={{ fontWeight: 400, color: 'var(--theme-elevation-500)' }}>
            {isLoading ? 'Loading… ' : ''}Subject: {result.subject}
          </span>
        </div>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
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
        {activeTab ? (
          <div
            style={{
              padding: '10px 12px',
              background: '#f8fafc',
              borderBottom: '1px solid var(--theme-elevation-100)',
              color: 'var(--theme-elevation-700)',
              fontSize: 13,
              lineHeight: 1.45,
            }}
          >
            <strong>{activeTab.label}:</strong> {activeTab.description}
          </div>
        ) : null}
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
