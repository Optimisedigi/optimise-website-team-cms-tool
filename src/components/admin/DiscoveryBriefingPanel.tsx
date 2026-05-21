'use client'

/**
 * Admin-only UI field that surfaces the Client Discovery Briefing inside
 * the Payload edit views for both the `clients` and `client-proposals`
 * collections.
 *
 * - Shows an "Open Discovery Briefing" button linking to
 *   `/discovery/client/<id>` or `/discovery/proposal/<id>` (depending on
 *   which collection the field is rendered in).
 * - When a briefing already exists for this doc, also shows the most
 *   recent `updatedAt` and a collapsed read-only preview of the first
 *   ~60 lines of the canonical markdown.
 * - When no briefing exists yet, shows a short "open the form to start"
 *   hint instead.
 *
 * The same component is wired into both collections — the hosting
 * collection is detected at runtime via `useDocumentInfo().collectionSlug`.
 */

import { useEffect, useState } from 'react'
import { useDocumentInfo } from '@payloadcms/ui'

type ScopeKey = 'client' | 'proposal'

interface BriefingSummary {
  id: number | string | null
  markdown: string | null
  updatedAt: string | null
  parentSlug: string | null
  briefingIdPadded: string
}

const PREVIEW_LINE_LIMIT = 60

function resolveScope(collectionSlug: string | undefined): ScopeKey | null {
  if (collectionSlug === 'clients') return 'client'
  if (collectionSlug === 'client-proposals') return 'proposal'
  return null
}

function formatUpdatedAt(iso: string | null): string | null {
  if (!iso) return null
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return null
    return d.toLocaleString()
  } catch {
    return null
  }
}

function trimMarkdownPreview(md: string | null): {
  preview: string
  truncated: boolean
} {
  if (!md) return { preview: '', truncated: false }
  const lines = md.split(/\r?\n/)
  if (lines.length <= PREVIEW_LINE_LIMIT) {
    return { preview: lines.join('\n'), truncated: false }
  }
  return {
    preview: lines.slice(0, PREVIEW_LINE_LIMIT).join('\n'),
    truncated: true,
  }
}

function DiscoveryBriefingPanel() {
  const { id, collectionSlug } = useDocumentInfo()
  const scope = resolveScope(collectionSlug)

  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [summary, setSummary] = useState<BriefingSummary | null>(null)
  const [expanded, setExpanded] = useState<boolean>(false)

  useEffect(() => {
    let cancelled = false

    // No id yet (unsaved doc) or unsupported collection: skip fetch.
    if (!id || !scope) {
      setLoading(false)
      setSummary(null)
      return () => {
        cancelled = true
      }
    }

    setLoading(true)
    setError(null)
    ;(async () => {
      try {
        const url = `/api/client-discovery-briefings/by-scope?scope=${scope}&id=${encodeURIComponent(
          String(id),
        )}`
        const res = await fetch(url, { credentials: 'include' })
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`)
        }
        const json = (await res.json()) as {
          id: number | string | null
          markdown: string | null
          parentSlug?: string | null
          briefingIdPadded?: string | null
          // The by-scope route doesn't return updatedAt today — we look it up
          // separately below if a doc exists.
        }
        if (cancelled) return

        let updatedAt: string | null = null
        if (json.id != null) {
          try {
            const docRes = await fetch(
              `/api/client-discovery-briefings/${encodeURIComponent(
                String(json.id),
              )}?depth=0`,
              { credentials: 'include' },
            )
            if (docRes.ok) {
              const doc = (await docRes.json()) as { updatedAt?: string }
              if (typeof doc.updatedAt === 'string') {
                updatedAt = doc.updatedAt
              }
            }
          } catch {
            // Non-fatal; the panel still renders without a timestamp.
          }
        }

        if (cancelled) return
        setSummary({
          id: json.id ?? null,
          markdown: typeof json.markdown === 'string' ? json.markdown : null,
          updatedAt,
          parentSlug:
            typeof json.parentSlug === 'string' && json.parentSlug
              ? json.parentSlug
              : null,
          briefingIdPadded:
            typeof json.briefingIdPadded === 'string' && json.briefingIdPadded
              ? json.briefingIdPadded
              : '000',
        })
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : String(err))
        setSummary(null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [id, scope])

  if (!scope) {
    // Should never happen because the field is only mounted on the two
    // supported collections, but bail safely if it does.
    return null
  }

  if (!id) {
    return (
      <div style={containerStyle}>
        <strong style={headingStyle}>Discovery Briefing</strong>
        <p style={hintStyle}>
          Save this record first to open its discovery briefing.
        </p>
      </div>
    )
  }

  // Canonical: /client/<slug>/discovery/<paddedId> or
  // /client-proposal/<slug>/discovery/<paddedId>. Falls back to the legacy
  // shape (which 308-redirects to the canonical) while the summary is still
  // loading or the parent has no slug yet.
  const scopePath = scope === 'client' ? 'client' : 'client-proposal'
  const canonicalHref =
    summary && summary.parentSlug
      ? `/${scopePath}/${encodeURIComponent(summary.parentSlug)}/discovery/${summary.briefingIdPadded}`
      : null
  const legacyHref = `/discovery/${scope}/${encodeURIComponent(String(id))}`
  const href = canonicalHref ?? legacyHref
  const hasBriefing = !!summary && summary.id != null
  const updatedLabel = formatUpdatedAt(summary?.updatedAt ?? null)
  const { preview, truncated } = trimMarkdownPreview(summary?.markdown ?? null)

  return (
    <div style={containerStyle}>
      <div style={headerRowStyle}>
        <strong style={headingStyle}>Discovery Briefing</strong>
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          style={buttonStyle}
        >
          Open Discovery Briefing &rarr;
        </a>
      </div>

      {loading ? (
        <p style={hintStyle}>Loading…</p>
      ) : error ? (
        <p style={errorStyle}>Could not load briefing summary: {error}</p>
      ) : hasBriefing ? (
        <>
          {updatedLabel ? (
            <p style={metaStyle}>Last updated {updatedLabel}</p>
          ) : null}
          {preview ? (
            <>
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                style={toggleStyle}
              >
                {expanded ? 'Hide preview' : 'Show markdown preview'}
              </button>
              {expanded ? (
                <pre style={previewStyle}>
                  {preview}
                  {truncated ? '\n\n…(truncated)' : ''}
                </pre>
              ) : null}
            </>
          ) : (
            <p style={hintStyle}>Briefing saved but markdown is empty.</p>
          )}
        </>
      ) : (
        <p style={hintStyle}>
          No briefing yet — open the form to start.
        </p>
      )}
    </div>
  )
}

export default DiscoveryBriefingPanel

// ── Inline styles ───────────────────────────────────────────────────────
// Kept inline to match the lightweight pattern used by neighbouring admin
// components (AgencyBadge, DownloadMarkdownButton, etc.).

const containerStyle: React.CSSProperties = {
  border: '1px solid var(--theme-elevation-150, #e4e4e7)',
  borderRadius: 8,
  padding: 16,
  marginBottom: 20,
  background: 'var(--theme-elevation-50, #fafafa)',
}

const headerRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  flexWrap: 'wrap',
  marginBottom: 8,
}

const headingStyle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 700,
  letterSpacing: '0.02em',
  textTransform: 'uppercase',
  color: 'var(--theme-text, #18181b)',
}

const buttonStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '8px 14px',
  background: '#3b82f6',
  color: '#fff',
  borderRadius: 6,
  textDecoration: 'none',
  fontWeight: 600,
  fontSize: 13,
}

const hintStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 13,
  color: 'var(--theme-elevation-500, #6b7280)',
}

const errorStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 13,
  color: '#b91c1c',
}

const metaStyle: React.CSSProperties = {
  margin: '0 0 8px',
  fontSize: 12,
  color: 'var(--theme-elevation-500, #6b7280)',
}

const toggleStyle: React.CSSProperties = {
  appearance: 'none',
  background: 'transparent',
  border: '1px solid var(--theme-elevation-200, #d4d4d8)',
  borderRadius: 4,
  padding: '4px 10px',
  fontSize: 12,
  fontWeight: 500,
  cursor: 'pointer',
  color: 'var(--theme-text, #18181b)',
}

const previewStyle: React.CSSProperties = {
  marginTop: 8,
  padding: 12,
  maxHeight: 360,
  overflow: 'auto',
  background: 'var(--theme-input-bg, #ffffff)',
  border: '1px solid var(--theme-elevation-150, #e4e4e7)',
  borderRadius: 6,
  fontFamily:
    'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
  fontSize: 12,
  lineHeight: 1.5,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
}
