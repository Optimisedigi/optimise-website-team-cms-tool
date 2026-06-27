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

interface BriefingActivityEntry {
  id: string
  savedAt: string
  savedBy: string
  changes: string[]
  snapshot?: Record<string, unknown>
}

interface BriefingSummary {
  id: number | string | null
  markdown: string | null
  updatedAt: string | null
  parentSlug: string | null
  briefingIdPadded: string
  /** Whether the briefing's public link requires the parent PIN to view. */
  requirePin: boolean
  /**
   * The PIN the public route will compare against when `requirePin` is on.
   * Empty string when no PIN is configured on the parent — in that case the
   * panel renders a warning instead of the "Share PIN" hint.
   */
  parentPin: string
  /**
   * Section ids the team has hidden. Same shape as the form's
   * `state.hiddenSections` and the markdown renderer's skip list —
   * editing here also drives what the public link shows.
   */
  hiddenSections: string[]
  activity: BriefingActivityEntry[]
}

/**
 * Display rows for the section-visibility checklist. Order + labels match
 * the form's `<SectionHead num="..." title="..." />` order; ids are the
 * stable `DISCOVERY_BRIEFING_SECTIONS` strings shared with the form.
 */
const SECTION_VISIBILITY_ROWS: Array<{ id: string; label: string }> = [
  { id: 'businessOverview', label: '1 · Business Overview' },
  { id: 'coreServices', label: '2 · Core Services' },
  { id: 'targetAudience', label: '3 · Target Audience' },
  { id: 'commercials', label: '4 · Commercials & Growth' },
  { id: 'usp', label: '5 · USP & Differentiation' },
  { id: 'brand', label: '6 · Brand Assets & Voice' },
  { id: 'techStack', label: '7 · Tech Stack & Tools' },
  { id: 'seoPresence', label: '8 · Current SEO & Online Presence' },
  { id: 'socialProof', label: '9 · Social Proof & Case Studies' },
  { id: 'leadMagnets', label: '10 · Lead Magnets' },
  { id: 'contentStrategy', label: '11 · Content Strategy' },
  { id: 'googleAds', label: '12 · Google Ads' },
  { id: 'timeline', label: '13 · Timeline' },
  { id: 'workingRelationship', label: '14 · Working Relationship' },
  { id: 'raci', label: '15 · RACI & Approvals' },
  { id: 'leadNurturing', label: '16 · Lead Nurturing' },
  { id: 'discoveryNotes', label: '17 · Discovery Notes' },
  { id: 'additionalDetails', label: '18 · Additional details' },
]

const PREVIEW_LINE_LIMIT = 60

function resolveScope(collectionSlug: string | undefined): ScopeKey | null {
  if (collectionSlug === 'clients') return 'client'
  if (collectionSlug === 'client-proposals') return 'proposal'
  return null
}

function formatActivityTime(iso: string): string {
  return formatUpdatedAt(iso) ?? iso
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
  /** Optimistic in-flight value for the Require-PIN toggle. */
  const [togglingPin, setTogglingPin] = useState<boolean>(false)
  const [pinToggleError, setPinToggleError] = useState<string | null>(null)
  /**
   * Which section ids have an in-flight visibility PATCH. Tracked per id so
   * the user can tick multiple checkboxes in quick succession without one
   * disabling the others. Reverted on error via the catch branch.
   */
  const [pendingSectionIds, setPendingSectionIds] = useState<Set<string>>(
    new Set(),
  )
  const [sectionsError, setSectionsError] = useState<string | null>(null)
  const [revertingActivityId, setRevertingActivityId] = useState<string | null>(null)
  const [revertError, setRevertError] = useState<string | null>(null)

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
        const jsonExtra = json as unknown as {
          requirePin?: unknown
          parentPin?: unknown
          hiddenSections?: unknown
          activity?: unknown
        }
        const hiddenSections = Array.isArray(jsonExtra.hiddenSections)
          ? jsonExtra.hiddenSections.filter(
              (v): v is string => typeof v === 'string',
            )
          : []
        const activity = Array.isArray(jsonExtra.activity)
          ? jsonExtra.activity.filter(
              (entry): entry is BriefingActivityEntry =>
                !!entry &&
                typeof entry === 'object' &&
                typeof (entry as BriefingActivityEntry).id === 'string' &&
                typeof (entry as BriefingActivityEntry).savedAt === 'string' &&
                typeof (entry as BriefingActivityEntry).savedBy === 'string' &&
                Array.isArray((entry as BriefingActivityEntry).changes) &&
                !!(entry as BriefingActivityEntry).snapshot &&
                typeof (entry as BriefingActivityEntry).snapshot === 'object',
            )
          : []
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
          requirePin: jsonExtra.requirePin === true,
          parentPin:
            typeof jsonExtra.parentPin === 'string' ? jsonExtra.parentPin : '',
          hiddenSections,
          activity,
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

  /**
   * Empty-summary shape returned when an optimistic update fires before the
   * initial GET resolves — keeps every key populated so subsequent updates
   * don't have to null-check.
   */
  const emptySummary = (): BriefingSummary => ({
    id: null,
    markdown: null,
    updatedAt: null,
    parentSlug: null,
    briefingIdPadded: '000',
    requirePin: false,
    parentPin: '',
    hiddenSections: [],
    activity: [],
  })

  // PATCH the briefing's requirePin without touching `data`. Optimistically
  // updates local state; reverts on error.
  const togglePin = async (next: boolean) => {
    if (!id || !scope) return
    setTogglingPin(true)
    setPinToggleError(null)
    const prev = summary?.requirePin ?? false
    // Optimistic UI update
    setSummary((s) =>
      s ? { ...s, requirePin: next } : { ...emptySummary(), requirePin: next },
    )
    try {
      const res = await fetch(
        `/api/client-discovery-briefings/by-scope?scope=${scope}&id=${encodeURIComponent(
          String(id),
        )}`,
        {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ requirePin: next }),
        },
      )
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = (await res.json()) as {
        id?: number | string | null
        requirePin?: boolean
        parentPin?: string
        activity?: BriefingActivityEntry[]
      }
      // Reconcile from the server response so a freshly-created briefing's
      // id surfaces in the panel.
      setSummary((s) => ({
        ...(s ?? emptySummary()),
        id: json.id ?? s?.id ?? null,
        requirePin: json.requirePin === true,
        parentPin:
          typeof json.parentPin === 'string'
            ? json.parentPin
            : s?.parentPin ?? '',
        activity: Array.isArray(json.activity) ? json.activity : s?.activity ?? [],
      }))
    } catch (err) {
      // Revert optimistic update on failure.
      setSummary((s) => (s ? { ...s, requirePin: prev } : s))
      setPinToggleError(err instanceof Error ? err.message : String(err))
    } finally {
      setTogglingPin(false)
    }
  }

  const restoreActivitySnapshot = async (entry: BriefingActivityEntry) => {
    if (!id || !scope || !entry.snapshot) return
    setRevertingActivityId(entry.id)
    setRevertError(null)
    try {
      const res = await fetch(
        `/api/client-discovery-briefings/by-scope?scope=${scope}&id=${encodeURIComponent(
          String(id),
        )}`,
        {
          method: 'PUT',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data: entry.snapshot }),
        },
      )
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = (await res.json()) as {
        id?: number | string | null
        markdown?: string | null
        briefingIdPadded?: string
        activity?: BriefingActivityEntry[]
        data?: { hiddenSections?: unknown }
      }
      const hiddenSections = Array.isArray(json.data?.hiddenSections)
        ? json.data.hiddenSections.filter((v): v is string => typeof v === 'string')
        : summary?.hiddenSections ?? []
      setSummary((s) => ({
        ...(s ?? emptySummary()),
        id: json.id ?? s?.id ?? null,
        markdown: typeof json.markdown === 'string' ? json.markdown : s?.markdown ?? null,
        updatedAt: new Date().toISOString(),
        briefingIdPadded: json.briefingIdPadded ?? s?.briefingIdPadded ?? '000',
        hiddenSections,
        activity: Array.isArray(json.activity) ? json.activity : s?.activity ?? [],
      }))
    } catch (err) {
      setRevertError(err instanceof Error ? err.message : String(err))
    } finally {
      setRevertingActivityId(null)
    }
  }

  /**
   * Toggle a single section's hidden state via PATCH. Sends the FULL
   * resulting array (server replaces, not merges) so the local UI and the
   * persisted `data.hiddenSections` stay in lock-step. Reverts the local
   * change if the request fails.
   */
  const toggleSectionHidden = async (sectionId: string, nextHidden: boolean) => {
    if (!id || !scope) return
    const previous = summary?.hiddenSections ?? []
    const next = nextHidden
      ? previous.includes(sectionId)
        ? previous
        : [...previous, sectionId]
      : previous.filter((v) => v !== sectionId)

    setSectionsError(null)
    setPendingSectionIds((s) => {
      const copy = new Set(s)
      copy.add(sectionId)
      return copy
    })
    setSummary((s) =>
      s
        ? { ...s, hiddenSections: next }
        : { ...emptySummary(), hiddenSections: next },
    )

    try {
      const res = await fetch(
        `/api/client-discovery-briefings/by-scope?scope=${scope}&id=${encodeURIComponent(
          String(id),
        )}`,
        {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ hiddenSections: next }),
        },
      )
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = (await res.json()) as {
        id?: number | string | null
        hiddenSections?: string[]
        activity?: BriefingActivityEntry[]
      }
      const persisted = Array.isArray(json.hiddenSections)
        ? json.hiddenSections.filter((v): v is string => typeof v === 'string')
        : next
      setSummary((s) => ({
        ...(s ?? emptySummary()),
        id: json.id ?? s?.id ?? null,
        hiddenSections: persisted,
        activity: Array.isArray(json.activity) ? json.activity : s?.activity ?? [],
      }))
    } catch (err) {
      setSummary((s) => (s ? { ...s, hiddenSections: previous } : s))
      setSectionsError(err instanceof Error ? err.message : String(err))
    } finally {
      setPendingSectionIds((s) => {
        const copy = new Set(s)
        copy.delete(sectionId)
        return copy
      })
    }
  }

  if (!id) {
    return (
      <section
        className="od-admin-form-section"
        aria-labelledby="discovery-briefing-title"
        style={containerStyle}
      >
        <strong id="discovery-briefing-title" style={headingStyle}>Discovery Briefing</strong>
        <p style={hintStyle}>
          Save this record first to open its discovery briefing.
        </p>
      </section>
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
    <section
      className="od-admin-form-section"
      aria-labelledby="discovery-briefing-title"
      style={containerStyle}
    >
      <div style={headerRowStyle}>
        <strong id="discovery-briefing-title" style={headingStyle}>Discovery Briefing</strong>
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          style={buttonStyle}
        >
          Open Discovery Briefing &rarr;
        </a>
      </div>

      {!loading && !error ? (
        <div style={pinRowStyle}>
          <label style={pinLabelStyle}>
            <input
              type="checkbox"
              checked={summary?.requirePin === true}
              disabled={togglingPin}
              onChange={(e) => togglePin(e.currentTarget.checked)}
            />
            <span>Require PIN to view public link</span>
          </label>
          {summary?.requirePin ? (
            summary.parentPin ? (
              <span style={pinHintStyle}>
                Share this PIN with the client: <strong>{summary.parentPin}</strong>
              </span>
            ) : (
              <span style={errorStyle}>
                No PIN configured on this {scope === 'client' ? 'client' : 'proposal'} — set one before sharing the link, or the gate will reject all attempts.
              </span>
            )
          ) : null}
          {pinToggleError ? (
            <span style={errorStyle}>Could not save toggle: {pinToggleError}</span>
          ) : null}
        </div>
      ) : null}

      {!loading && !error ? (
        <div style={sectionsBlockStyle}>
          <div style={sectionsHeaderRowStyle}>
            <strong style={sectionsHeaderStyle}>Section visibility</strong>
            <span style={pinHintStyle}>
              Tick to hide that section from the public discovery link. Admins
              still see it in the form.
            </span>
          </div>
          <div
            data-testid="section-visibility-grid"
            style={sectionsGridStyle}
          >
            {SECTION_VISIBILITY_ROWS.map((row) => {
              const hidden =
                summary?.hiddenSections?.includes(row.id) ?? false
              const pending = pendingSectionIds.has(row.id)
              return (
                <label
                  key={row.id}
                  style={sectionRowStyle}
                  data-section-id={row.id}
                >
                  <input
                    type="checkbox"
                    checked={hidden}
                    disabled={pending}
                    onChange={(e) =>
                      toggleSectionHidden(row.id, e.currentTarget.checked)
                    }
                  />
                  <span style={{ opacity: hidden ? 0.6 : 1 }}>{row.label}</span>
                </label>
              )
            })}
          </div>
          {sectionsError ? (
            <span style={errorStyle}>
              Could not update section visibility: {sectionsError}
            </span>
          ) : null}
        </div>
      ) : null}

      {loading ? (
        <p style={hintStyle}>Loading…</p>
      ) : error ? (
        <p style={errorStyle}>Could not load briefing summary: {error}</p>
      ) : hasBriefing ? (
        <>
          {updatedLabel ? (
            <p style={metaStyle}>Last updated {updatedLabel}</p>
          ) : null}
          {summary?.activity?.length ? (
            <div style={activityBlockStyle}>
              <strong style={activityHeadingStyle}>Recent saves</strong>
              <ol style={activityListStyle}>
                {summary.activity.slice(0, 5).map((entry) => (
                  <li key={entry.id} style={activityItemStyle}>
                    <div>
                      <strong>{entry.savedBy}</strong>{' '}
                      <span style={pinHintStyle}>{formatActivityTime(entry.savedAt)}</span>
                    </div>
                    <ul style={changeListStyle}>
                      {entry.changes.slice(0, 4).map((change) => (
                        <li key={change}>{change}</li>
                      ))}
                      {entry.changes.length > 4 ? (
                        <li>+{entry.changes.length - 4} more changes</li>
                      ) : null}
                    </ul>
                    {entry.snapshot ? (
                      <button
                        type="button"
                        onClick={() => restoreActivitySnapshot(entry)}
                        disabled={revertingActivityId === entry.id}
                        style={restoreButtonStyle}
                      >
                        {revertingActivityId === entry.id
                          ? 'Restoring…'
                          : 'Restore this save'}
                      </button>
                    ) : null}
                  </li>
                ))}
              </ol>
              {revertError ? (
                <p style={errorStyle}>Could not restore save: {revertError}</p>
              ) : null}
            </div>
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
    </section>
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

const pinRowStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  margin: '0 0 12px',
  padding: '10px 12px',
  background: 'var(--theme-input-bg, #ffffff)',
  border: '1px solid var(--theme-elevation-150, #e4e4e7)',
  borderRadius: 6,
}

const pinLabelStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--theme-text, #18181b)',
  cursor: 'pointer',
}

const pinHintStyle: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--theme-elevation-500, #6b7280)',
}

const sectionsBlockStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  margin: '0 0 12px',
  padding: '10px 12px',
  background: 'var(--theme-input-bg, #ffffff)',
  border: '1px solid var(--theme-elevation-150, #e4e4e7)',
  borderRadius: 6,
}

const sectionsHeaderRowStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
}

const sectionsHeaderStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  color: 'var(--theme-text, #18181b)',
}

const sectionsGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  gap: '4px 16px',
  marginTop: 4,
}

const sectionRowStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  fontSize: 12,
  color: 'var(--theme-text, #18181b)',
  cursor: 'pointer',
  minHeight: 28,
}

const activityBlockStyle: React.CSSProperties = {
  margin: '0 0 12px',
  padding: '10px 12px',
  background: 'var(--theme-input-bg, #ffffff)',
  border: '1px solid var(--theme-elevation-150, #e4e4e7)',
  borderRadius: 6,
}

const activityHeadingStyle: React.CSSProperties = {
  display: 'block',
  marginBottom: 8,
  fontSize: 13,
  fontWeight: 700,
  color: 'var(--theme-text, #18181b)',
}

const activityListStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  margin: 0,
  paddingLeft: 18,
}

const activityItemStyle: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--theme-text, #18181b)',
}

const changeListStyle: React.CSSProperties = {
  margin: '4px 0 0',
  paddingLeft: 16,
  color: 'var(--theme-elevation-600, #52525b)',
}

const restoreButtonStyle: React.CSSProperties = {
  appearance: 'none',
  marginTop: 6,
  background: 'transparent',
  border: '1px solid var(--theme-elevation-200, #d4d4d8)',
  borderRadius: 4,
  padding: '4px 8px',
  fontSize: 12,
  fontWeight: 600,
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
