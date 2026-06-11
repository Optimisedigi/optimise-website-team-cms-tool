'use client'

import { useCallback, useEffect, useState } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface DismissedCandidate {
  id: string | number
  searchTerm: string
  triggeringKeyword: string
  campaignName: string
  adGroupName: string
  matchType: 'EXACT' | 'PHRASE'
  impressions: number
  clicks: number
  status: 'pending' | 'approved' | 'rejected'
  rejectedAt?: string | null
  addedAsKeywordAt?: string | null
  addedAsKeywordOutcome?: 'added' | 'already_exists' | 'skipped' | null
}

interface ListResponse {
  docs: DismissedCandidate[]
  totalDocs: number
  page: number
  totalPages: number
}

type RowOutcome = { outcome: 'added' | 'already_exists' | 'skipped' }

interface AdGroupOption {
  adGroupId: string
  adGroupName: string
  campaignName: string
  status: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatNumber(n: number): string {
  return new Intl.NumberFormat('en-GB').format(n)
}

function btnStyle(variant: 'primary' | 'ghost', disabled?: boolean): React.CSSProperties {
  if (variant === 'primary') {
    return {
      padding: '4px 10px', borderRadius: 6, border: 'none',
      background: disabled ? '#d1d5db' : '#2563eb', color: 'white',
      fontSize: 11, fontWeight: 500, cursor: disabled ? 'not-allowed' : 'pointer',
    }
  }
  return {
    padding: '4px 10px', borderRadius: 6, border: '1px solid #d1d5db',
    background: 'white', color: '#374151', fontSize: 11,
    cursor: disabled ? 'not-allowed' : 'pointer',
  }
}

function thStyle(): React.CSSProperties {
  return {
    padding: '8px 8px', textAlign: 'left', fontSize: 11, fontWeight: 600,
    color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em',
    whiteSpace: 'nowrap',
  }
}

function tdStyle(): React.CSSProperties {
  return { padding: '8px 8px', verticalAlign: 'middle' }
}

// ─── Main Component ───────────────────────────────────────────────────────────

/**
 * Dismissed tab: rejected match-type-violation terms that haven't been
 * actioned yet. Each one is a potential *positive* exact keyword — the term
 * was reviewed and judged fine (that's why it was dismissed), so capturing it
 * as an exact keyword keeps future serving hyper-relevant. Terms that already
 * exist as exact keywords are skipped server-side by Growth Tools and drop
 * off this list automatically.
 */
export default function DismissedKeywordReview({ clientId }: { clientId: string | null }) {
  const [rows, setRows] = useState<DismissedCandidate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<Set<string | number>>(new Set())
  // Per-row keyword text edits (defaults to the search term)
  const [edits, setEdits] = useState<Map<string | number, string>>(new Map())
  // Rows actioned this session — shown with their outcome before disappearing on refetch
  const [outcomes, setOutcomes] = useState<Map<string | number, RowOutcome>>(new Map())

  const fetchRows = useCallback(async () => {
    if (!clientId) return
    setLoading(true)
    setError(null)
    try {
      const all: DismissedCandidate[] = []
      for (let pageNum = 1; pageNum <= 50; pageNum++) {
        const params = new URLSearchParams({
          limit: '100',
          page: String(pageNum),
          client: clientId,
          status: 'rejected',
        })
        const res = await fetch(`/api/match-type-violations?${params}`)
        if (!res.ok) throw new Error(await res.text())
        const data: ListResponse = await res.json()
        all.push(...data.docs)
        if (pageNum >= data.totalPages) break
      }
      // Only un-actioned terms: actioned ones were added / already exist / skipped.
      setRows(all.filter((c) => !c.addedAsKeywordAt))
      setOutcomes(new Map())
      setEdits(new Map())
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [clientId])

  useEffect(() => { void fetchRows() }, [fetchRows])

  const keywordFor = (c: DismissedCandidate): string => edits.get(c.id) ?? c.searchTerm

  // Ad-group options for the per-row target picker, fetched once per client.
  const [adGroupOptions, setAdGroupOptions] = useState<AdGroupOption[] | null>(null)
  const [adGroupError, setAdGroupError] = useState<string | null>(null)
  useEffect(() => {
    if (!clientId) return
    setAdGroupOptions(null)
    setAdGroupError(null)
    ;(async () => {
      try {
        const res = await fetch(`/api/match-type-violations/ad-groups?client=${encodeURIComponent(clientId)}`)
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
        setAdGroupOptions(data.adGroups ?? [])
      } catch (e: any) {
        setAdGroupError(e.message)
        setAdGroupOptions([])
      }
    })()
  }, [clientId])

  const runAction = async (c: DismissedCandidate, payload: { skip: true } | { keyword: string; adGroupIds: string[] }) => {
    setActionLoading((prev) => new Set(prev).add(c.id))
    try {
      const res = await fetch(`/api/match-type-violations/${c.id}/add-exact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
      setOutcomes((prev) => {
        const next = new Map(prev)
        next.set(c.id, { outcome: data.outcome })
        return next
      })
    } catch (e: any) {
      alert(`Error: ${e.message}`)
    } finally {
      setActionLoading((prev) => { const s = new Set(prev); s.delete(c.id); return s })
    }
  }

  if (!clientId) {
    return (
      <div style={{ margin: '0 24px', padding: 24, border: '1px solid #fcd34d', borderRadius: 8, background: '#fef3c7', color: '#92400e' }}>
        Save or link this record to a client to view dismissed terms.
      </div>
    )
  }

  const visible = rows
  const remaining = visible.filter((c) => !outcomes.has(c.id)).length

  return (
    <div style={{ padding: '0 15px 32px' }}>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>Dismissed Terms → Exact Keywords</h2>
        <p style={{ margin: '4px 0 0', color: '#6b7280', fontSize: 13 }}>
          Dismissed terms you judged fine — capture them as exact keywords so future serving stays hyper-relevant
        </p>
      </div>

      <div style={{
        marginBottom: 16, padding: '12px 16px', background: '#eff6ff',
        border: '1px solid #bfdbfe', borderRadius: 8, color: '#1e40af', fontSize: 13, lineHeight: 1.6,
      }}>
        <strong>How it works —</strong> a dismissed violation means the search term was fine, so it's a
        candidate to own as an <strong>exact</strong> keyword. <strong>Add as Exact</strong> lets you pick
        the ad groups (own ad group pre-selected) and pushes the keyword paused via Growth Tools, copying
        the <strong>final URLs, max CPC, and labels</strong> from an existing keyword in each target ad
        group so new keywords behave like what's already there. Exact keywords that already exist are
        detected as duplicates and drop off this list. <strong>Skip</strong> hides terms you don't want as
        keywords. {remaining} term{remaining !== 1 ? 's' : ''} awaiting review.
        {adGroupError && <div style={{ marginTop: 6, color: '#b45309' }}>Ad-group picker unavailable: {adGroupError}</div>}
      </div>

      {error && (
        <div style={{ padding: '12px 16px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, marginBottom: 16, color: '#dc2626', fontSize: 13 }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#6b7280' }}>Loading…</div>
      ) : visible.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#6b7280', border: '1px dashed #d1d5db', borderRadius: 8 }}>
          No dismissed terms awaiting review.
        </div>
      ) : (
        <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: 8 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, background: 'white' }}>
            <thead>
              <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                <th style={thStyle()}>Search Term</th>
                <th style={thStyle()}>Keyword To Add (Exact)</th>
                <th style={thStyle()}>Ad Group</th>
                <th style={thStyle()}>Campaign</th>
                <th style={thStyle()} title="Impressions">Impr</th>
                <th style={thStyle()}>Clicks</th>
                <th style={thStyle()}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((c) => {
                const done = outcomes.get(c.id)
                const busy = actionLoading.has(c.id)
                return (
                  <tr key={String(c.id)} style={{ borderBottom: '1px solid #f3f4f6', opacity: done ? 0.55 : 1 }}>
                    <td style={tdStyle()}>
                      <span title={c.searchTerm} style={{ maxWidth: 220, display: 'block', whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.35 }}>
                        {c.searchTerm}
                      </span>
                    </td>
                    <td style={tdStyle()}>
                      {done ? (
                        <span style={{ fontSize: 12, color: '#6b7280' }}>[{keywordFor(c)}]</span>
                      ) : (
                        <input
                          value={keywordFor(c)}
                          onChange={(e) =>
                            setEdits((prev) => {
                              const next = new Map(prev)
                              next.set(c.id, e.target.value)
                              return next
                            })
                          }
                          title="Edit the keyword before adding it as exact match"
                          style={{ width: 180, padding: '4px 6px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 12 }}
                        />
                      )}
                    </td>
                    <td style={tdStyle()}>
                      <span title={c.adGroupName} style={{ maxWidth: 160, display: 'block', whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.35 }}>
                        {c.adGroupName || '—'}
                      </span>
                    </td>
                    <td style={tdStyle()}>
                      <span title={c.campaignName} style={{ maxWidth: 160, display: 'block', whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.35 }}>
                        {c.campaignName || '—'}
                      </span>
                    </td>
                    <td style={{ ...tdStyle(), textAlign: 'right' }}>{formatNumber(c.impressions)}</td>
                    <td style={{ ...tdStyle(), textAlign: 'right' }}>{formatNumber(c.clicks)}</td>
                    <td style={tdStyle()}>
                      {done ? (
                        <span style={{ fontSize: 12, fontWeight: 500, color: done.outcome === 'added' ? '#16a34a' : '#6b7280' }}>
                          {done.outcome === 'added' ? 'Added (paused)' : done.outcome === 'already_exists' ? 'Already exists' : 'Skipped'}
                        </span>
                      ) : (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <AddExactPopover
                            candidate={c}
                            keyword={keywordFor(c)}
                            adGroups={adGroupOptions}
                            busy={busy}
                            onConfirm={(adGroupIds) => void runAction(c, { keyword: keywordFor(c), adGroupIds })}
                          />
                          <button
                            onClick={() => void runAction(c, { skip: true })}
                            disabled={busy}
                            style={btnStyle('ghost', busy)}
                          >
                            Skip
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Add-as-Exact popover (ad-group targets) ────────────────────────────────

function AddExactPopover({
  candidate,
  keyword,
  adGroups,
  busy,
  onConfirm,
}: {
  candidate: DismissedCandidate
  keyword: string
  adGroups: AdGroupOption[] | null
  busy: boolean
  onConfirm: (adGroupIds: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  // Pre-select the candidate's own ad group (matched by name, preferring its
  // campaign) whenever the popover opens.
  const openPopover = () => {
    if (open) { setOpen(false); return }
    const own = (adGroups ?? []).filter(
      (g) => g.adGroupName.toLowerCase() === (candidate.adGroupName ?? '').toLowerCase(),
    )
    const preferred =
      own.find((g) => g.campaignName.toLowerCase() === (candidate.campaignName ?? '').toLowerCase()) ?? own[0]
    setSelected(new Set(preferred ? [preferred.adGroupId] : []))
    setOpen(true)
  }

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  // Group options by campaign for a scannable list.
  const byCampaign = new Map<string, AdGroupOption[]>()
  for (const g of adGroups ?? []) {
    const key = g.campaignName || '(no campaign)'
    const bucket = byCampaign.get(key)
    if (bucket) bucket.push(g)
    else byCampaign.set(key, [g])
  }

  const toggleCampaign = (groups: AdGroupOption[], allSelected: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev)
      for (const g of groups) {
        if (allSelected) next.delete(g.adGroupId)
        else next.add(g.adGroupId)
      }
      return next
    })

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={openPopover}
        disabled={busy || !keyword.trim() || adGroups === null}
        style={{ ...btnStyle('primary', busy || !keyword.trim() || adGroups === null), display: 'flex', alignItems: 'center', gap: 4 }}
        title={adGroups === null ? 'Loading ad groups…' : 'Choose the ad groups to push this exact keyword to'}
      >
        {busy ? '…' : 'Add as Exact'}
        <span style={{ fontSize: 10 }}>▾</span>
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
          <div style={{
            position: 'absolute', right: 0, top: '100%', zIndex: 50, marginTop: 4,
            background: 'white', border: '1px solid #e5e7eb', borderRadius: 8,
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)', width: 340, padding: 12,
            fontSize: 12, textAlign: 'left',
          }}>
            <div style={{ fontWeight: 600, color: '#374151', marginBottom: 2 }}>
              Push [{keyword}] to:
            </div>
            <div style={{ color: '#6b7280', marginBottom: 8, fontSize: 11 }}>
              Added paused, matching each ad group's existing URLs, max CPC and labels.
            </div>
            <div style={{ maxHeight: 260, overflowY: 'auto', border: '1px solid #f3f4f6', borderRadius: 6, padding: 6 }}>
              {byCampaign.size === 0 ? (
                <div style={{ color: '#6b7280', padding: 8 }}>No ad groups found.</div>
              ) : (
                Array.from(byCampaign.entries()).map(([campaign, groups]) => {
                  const allSelected = groups.every((g) => selected.has(g.adGroupId))
                  return (
                    <div key={campaign} style={{ marginBottom: 6 }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, color: '#374151', cursor: 'pointer', padding: '2px 0' }}>
                        <input
                          type="checkbox"
                          checked={allSelected}
                          onChange={() => toggleCampaign(groups, allSelected)}
                        />
                        {campaign}
                      </label>
                      {groups.map((g) => (
                        <label key={g.adGroupId} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 0 2px 20px', cursor: 'pointer', color: '#4b5563' }}>
                          <input
                            type="checkbox"
                            checked={selected.has(g.adGroupId)}
                            onChange={() => toggle(g.adGroupId)}
                          />
                          <span style={{ whiteSpace: 'normal', wordBreak: 'break-word' }}>
                            {g.adGroupName}
                            {g.status && g.status !== 'ENABLED' ? <span style={{ color: '#9ca3af' }}> ({g.status.toLowerCase()})</span> : null}
                          </span>
                        </label>
                      ))}
                    </div>
                  )
                })
              )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
              <span style={{ color: '#6b7280' }}>{selected.size} selected</span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => setOpen(false)} style={btnStyle('ghost')}>Cancel</button>
                <button
                  onClick={() => { setOpen(false); onConfirm(Array.from(selected)) }}
                  disabled={selected.size === 0}
                  style={btnStyle('primary', selected.size === 0)}
                >
                  Push to {selected.size} ad group{selected.size !== 1 ? 's' : ''}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
