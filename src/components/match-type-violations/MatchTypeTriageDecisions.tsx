'use client'

/**
 * "Auto decisions" tab — the pre-decided subset of pending phrase violations.
 *
 * The weekly triage cron researches every violation with real traffic and files
 * it into one of four buckets. This tab is the approval surface: nothing here
 * has touched Google Ads, and each bucket is approved in one bulk click through
 * the SAME endpoints the manual review uses.
 *
 * Only rows the cron actually decided appear here (status=pending AND
 * aiDecided=true). Untriaged pending violations stay in the Match type
 * violations tab; neither tab hides rows from the other.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'

type Bucket = 'relevant_keyword' | 'competitor' | 'irrelevant' | 'unclear'

interface TriagedCandidate {
  id: string | number
  searchTerm: string
  campaignName?: string | null
  adGroupName?: string | null
  triggeringKeyword?: string | null
  clicks?: number | null
  impressions?: number | null
  cost?: number | null
  aiDecision?: Bucket | null
  aiReason?: string | null
  aiSummary?: string | null
  aiSourceTitle?: string | null
  aiSourceLink?: string | null
  aiSuggestedAdGroup?: string | null
  aiConfidence?: number | null
  aiDecidedAt?: string | null
}

interface ListResponse {
  docs: TriagedCandidate[]
  totalDocs: number
  totalPages: number
}

interface Nkl {
  id: string | number
  name?: string
  relevancyExclusion?: string
}

/**
 * The three things a reviewer can actually do with a term. Every bucket offers
 * all three: the AI's pick is only a recommendation, so a reviewer must be able
 * to overrule it — and rows in "unclear" would otherwise be a dead end.
 */
type ActionKey = 'exact' | 'competitor' | 'negative'

const ACTIONS: Array<{ key: ActionKey; label: string }> = [
  { key: 'exact', label: 'Add as exact keywords' },
  { key: 'competitor', label: 'Add to competitor list' },
  { key: 'negative', label: 'Add as ad-group negatives' },
]

const BUCKETS: Array<{
  key: Bucket
  title: string
  blurb: string
  /** The action pre-highlighted for this bucket; null means "no recommendation". */
  action: ActionKey | null
}> = [
  {
    key: 'relevant_keyword',
    title: 'Add as exact keyword',
    blurb: 'Generic phrases judged relevant to the ad group.',
    action: 'exact',
  },
  {
    key: 'competitor',
    title: 'Competitor negatives',
    blurb: 'Other companies in the same trade as this client.',
    action: 'competitor',
  },
  {
    key: 'irrelevant',
    title: 'Irrelevant negatives',
    blurb: 'Not relevant to the ad group, and not a competitor.',
    action: 'negative',
  },
  {
    key: 'unclear',
    title: 'Unclear — manual review',
    blurb:
      'The AI would only have been guessing. No recommendation — read each one, then pick an action below.',
    action: null,
  },
]

function buttonStyle(variant: 'primary' | 'ghost' | 'danger', disabled = false): React.CSSProperties {
  const background = variant === 'primary' ? '#2563eb' : variant === 'danger' ? '#dc2626' : 'white'
  return {
    padding: '6px 12px',
    borderRadius: 6,
    border: variant === 'ghost' ? '1px solid #d1d5db' : 'none',
    background: disabled ? '#d1d5db' : background,
    color: variant === 'ghost' ? '#374151' : 'white',
    fontSize: 12,
    fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer',
    whiteSpace: 'nowrap',
  }
}

export default function MatchTypeTriageDecisions({ clientId }: { clientId: string | null }) {
  const [docs, setDocs] = useState<TriagedCandidate[]>([])
  const [nklLists, setNklLists] = useState<Nkl[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [competitorListId, setCompetitorListId] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [busyBucket, setBusyBucket] = useState<Bucket | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const fetchDocs = useCallback(async () => {
    if (!clientId) return
    setLoading(true)
    setError(null)
    try {
      const all: TriagedCandidate[] = []
      // Hard cap of 50 pages (5,000 rows) as a runaway guard, matching the
      // manual review. The aiDecided filter keeps this to the decided queue.
      for (let page = 1; page <= 50; page++) {
        const params = new URLSearchParams({
          client: clientId,
          status: 'pending',
          aiDecided: 'true',
          limit: '100',
          page: String(page),
        })
        const res = await fetch(`/api/match-type-violations?${params}`, { credentials: 'include' })
        if (!res.ok) throw new Error(await res.text())
        const data = (await res.json()) as ListResponse
        all.push(...(data.docs ?? []))
        if (page >= (data.totalPages ?? 1)) break
      }
      // Belt and braces: never show a row the cron has not decided.
      setDocs(all.filter((d) => Boolean(d.aiDecidedAt) && Boolean(d.aiDecision)))
      setSelected(new Set())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load auto decisions')
      setDocs([])
    } finally {
      setLoading(false)
    }
  }, [clientId])

  useEffect(() => {
    void fetchDocs()
  }, [fetchDocs])

  useEffect(() => {
    if (!clientId) return
    const params = new URLSearchParams({ limit: '100', 'where[client][equals]': clientId })
    fetch(`/api/negative-keyword-lists?${params}`, { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        const lists: Nkl[] = Array.isArray(data?.docs) ? data.docs : []
        setNklLists(lists)
        const competitor = lists.find((l) => l.relevancyExclusion === 'competitor')
        if (competitor) setCompetitorListId(String(competitor.id))
      })
      .catch(() => setNklLists([]))
  }, [clientId])

  const grouped = useMemo(() => {
    const map = new Map<Bucket, TriagedCandidate[]>(BUCKETS.map((b) => [b.key, []]))
    for (const doc of docs) {
      const bucket = map.get(doc.aiDecision as Bucket)
      if (bucket) bucket.push(doc)
    }
    return map
  }, [docs])

  const toggle = (id: string | number) => {
    setSelected((prev) => {
      const next = new Set(prev)
      const key = String(id)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const selectedIn = (bucket: Bucket): string[] =>
    (grouped.get(bucket) ?? []).map((d) => String(d.id)).filter((id) => selected.has(id))

  const toggleAll = (bucket: Bucket) => {
    const ids = (grouped.get(bucket) ?? []).map((d) => String(d.id))
    const allSelected = ids.length > 0 && ids.every((id) => selected.has(id))
    setSelected((prev) => {
      const next = new Set(prev)
      for (const id of ids) {
        if (allSelected) next.delete(id)
        else next.add(id)
      }
      return next
    })
  }

  const post = async (bucket: Bucket, path: string, body: Record<string, unknown>, verb: string) => {
    setBusyBucket(bucket)
    setError(null)
    setNotice(null)
    try {
      const res = await fetch(`/api/match-type-violations/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error ?? (await res.text().catch(() => `HTTP ${res.status}`)))
      setNotice(`${verb} ${(body.candidateIds as string[]).length} term(s).`)
      await fetchDocs()
    } catch (e) {
      setError(e instanceof Error ? e.message : `Failed to ${verb.toLowerCase()}`)
    } finally {
      setBusyBucket(null)
    }
  }

  /**
   * Apply an action to the rows selected in a bucket. The action is chosen by
   * the reviewer, not fixed by the bucket, so an "unclear" row — or a row the
   * AI bucketed wrongly — can still be actioned without leaving this tab.
   */
  const applyAction = async (bucket: Bucket, action: ActionKey) => {
    const candidateIds = selectedIn(bucket)
    if (candidateIds.length === 0) return
    if (action === 'exact') {
      if (!confirm(`Add ${candidateIds.length} term(s) to Google Ads as exact keywords?`)) return
      // Bare candidateIds 400s: the route needs a targeting mode.
      await post(bucket, 'add-exact-bulk', { candidateIds, autoExactFromCandidates: true, negateSource: true }, 'Added')
      return
    }
    if (action === 'competitor') {
      if (!competitorListId) return
      if (!confirm(`Add ${candidateIds.length} term(s) to the competitor negative list?`)) return
      await post(bucket, 'bulk-approve', { candidateIds, assignedListId: competitorListId }, 'Negated')
      return
    }
    if (!confirm(`Add ${candidateIds.length} term(s) as ad-group negatives?`)) return
    // parseRouting expects an object; a bare string is rejected as no routing.
    await post(bucket, 'bulk-approve', { candidateIds, routing: { mode: 'auto' } }, 'Negated')
  }

  const dismissBucket = async (bucket: Bucket) => {
    const candidateIds = selectedIn(bucket)
    if (candidateIds.length === 0) return
    if (!confirm(`Dismiss ${candidateIds.length} term(s)?`)) return
    await post(bucket, 'bulk-reject', { candidateIds }, 'Dismissed')
  }

  if (!clientId) {
    return (
      <div style={{ margin: '0 24px', padding: 24, border: '1px solid #fcd34d', borderRadius: 8, background: '#fef3c7', color: '#92400e' }}>
        Save or link this record to a client to view auto decisions.
      </div>
    )
  }

  return (
    <div style={{ padding: '0 24px 32px' }}>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>Auto decisions</h2>
        <p style={{ margin: '4px 0 0', color: '#6b7280', fontSize: 13 }}>
          The weekly triage researched these phrase violations and pre-filled a recommendation. Nothing has been applied
          to Google Ads — approve each group to action it.
        </p>
      </div>

      {error && <div style={{ padding: 12, border: '1px solid #fecaca', borderRadius: 6, background: '#fef2f2', color: '#dc2626', marginBottom: 16, fontSize: 13 }}>{error}</div>}
      {notice && <div style={{ padding: 12, border: '1px solid #bbf7d0', borderRadius: 6, background: '#f0fdf4', color: '#166534', marginBottom: 16, fontSize: 13 }}>{notice}</div>}

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>Loading…</div>
      ) : docs.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#6b7280', border: '1px dashed #d1d5db', borderRadius: 8 }}>
          No auto decisions yet. The triage runs weekly over violations with clicks or more than 5 impressions.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 16 }}>
          {BUCKETS.map((bucket) => {
            const rows = grouped.get(bucket.key) ?? []
            if (rows.length === 0) return null
            const chosen = selectedIn(bucket.key)
            const busy = busyBucket === bucket.key
            // Any bucket can now send rows to the competitor list, so the picker
            // and its gating are no longer specific to the competitor bucket.
            const needsCompetitorList = !competitorListId
            return (
              <details key={bucket.key} open style={{ border: '1px solid #e5e7eb', borderRadius: 8, background: 'white', padding: 16 }}>
                <summary style={{ cursor: 'pointer', fontSize: 15, fontWeight: 600, color: '#111827' }}>
                  {bucket.title} ({rows.length})
                </summary>
                <p style={{ margin: '6px 0 12px', color: '#6b7280', fontSize: 12 }}>{bucket.blurb}</p>

                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
                  <button onClick={() => toggleAll(bucket.key)} style={buttonStyle('ghost')}>
                    {rows.every((r) => selected.has(String(r.id))) ? 'Clear selection' : 'Select all'}
                  </button>
                  {(
                    <select
                      value={competitorListId}
                      onChange={(e) => setCompetitorListId(e.target.value)}
                      style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 12 }}
                    >
                      <option value="">Select a negative keyword list…</option>
                      {nklLists.map((l) => (
                        <option key={String(l.id)} value={String(l.id)}>
                          {l.name ?? `List ${l.id}`}
                          {l.relevancyExclusion === 'competitor' ? ' (competitor)' : ''}
                        </option>
                      ))}
                    </select>
                  )}
                  {ACTIONS.map((action) => {
                    // Competitor is the only action needing a destination list.
                    const blocked = busy || chosen.length === 0 || (action.key === 'competitor' && needsCompetitorList)
                    const recommended = bucket.action === action.key
                    return (
                      <button
                        key={action.key}
                        disabled={blocked}
                        onClick={() => void applyAction(bucket.key, action.key)}
                        style={buttonStyle(recommended ? 'primary' : 'ghost', blocked)}
                        title={recommended ? 'Recommended for this group' : 'Overrides the AI suggestion'}
                      >
                        {busy ? 'Working…' : `${action.label} (${chosen.length})`}
                      </button>
                    )
                  })}
                  <button
                    disabled={busy || chosen.length === 0}
                    onClick={() => void dismissBucket(bucket.key)}
                    style={buttonStyle('ghost', busy || chosen.length === 0)}
                  >
                    Dismiss ({chosen.length})
                  </button>
                  {needsCompetitorList && (
                    <span style={{ color: '#92400e', fontSize: 12 }}>
                      Pick a negative keyword list above to enable “Add to competitor list”.
                    </span>
                  )}
                </div>

                <div style={{ display: 'grid', gap: 8 }}>
                  {rows.map((row) => (
                    <label
                      key={String(row.id)}
                      style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: 10, border: '1px solid #f3f4f6', borderRadius: 6, cursor: 'pointer' }}
                    >
                      <input type="checkbox" checked={selected.has(String(row.id))} onChange={() => toggle(row.id)} style={{ marginTop: 3 }} />
                      <span style={{ minWidth: 0 }}>
                        <span style={{ display: 'block', fontWeight: 600, fontSize: 13, color: '#111827' }}>
                          {row.searchTerm}
                        </span>
                        <span style={{ display: 'block', color: '#6b7280', fontSize: 12, marginTop: 2 }}>
                          {row.clicks ?? 0} clicks · {row.impressions ?? 0} impr
                          {row.adGroupName ? ` · ad group: ${row.adGroupName}` : ''}
                          {typeof row.aiConfidence === 'number' ? ` · AI self-rated ${row.aiConfidence}%` : ''}
                        </span>
                        {row.aiSuggestedAdGroup && (
                          <span
                            style={{
                              display: 'block',
                              color: '#92400e',
                              background: '#fef3c7',
                              fontSize: 12,
                              marginTop: 4,
                              padding: '4px 8px',
                              borderRadius: 4,
                            }}
                          >
                            <strong>Better ad group:</strong> {row.aiSuggestedAdGroup} — approving here adds it
                            to <em>{row.adGroupName}</em>, so move it manually if you agree.
                          </span>
                        )}
                        {/* Labelled so a reviewer can tell the AI's judgement from the
                            researched fact from the third-party page it read. */}
                        {row.aiReason && (
                          <span style={{ display: 'block', color: '#374151', fontSize: 12, marginTop: 4 }}>
                            <strong style={{ color: '#111827' }}>Why this bucket:</strong> {row.aiReason}
                          </span>
                        )}
                        {row.aiSummary && (
                          <span style={{ display: 'block', color: '#6b7280', fontSize: 12, marginTop: 2 }}>
                            <strong style={{ color: '#374151' }}>What the term means:</strong> {row.aiSummary}
                          </span>
                        )}
                        {row.aiSourceLink && (
                          <span style={{ display: 'block', color: '#6b7280', fontSize: 12, marginTop: 2 }}>
                            <strong style={{ color: '#374151' }}>Researched from:</strong>{' '}
                            <a
                              href={row.aiSourceLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              style={{ color: '#2563eb' }}
                            >
                              {row.aiSourceTitle || row.aiSourceLink}
                            </a>{' '}
                            <span style={{ color: '#9ca3af' }}>(top Google result — not your ad)</span>
                          </span>
                        )}
                      </span>
                    </label>
                  ))}
                </div>
              </details>
            )
          })}
        </div>
      )}
    </div>
  )
}
