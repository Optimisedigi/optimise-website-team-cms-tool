'use client'

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { buildNegativeFromViolation } from '@/lib/match-type-negative'
import { contentWords, countSynonymOverlap, type SynonymRuleInput } from '@/lib/match-type-synonyms'
import { buildAllowListSet, hasLikelyUnknownBrandToken, type AllowListTermInput } from '@/lib/match-type-allow-list'
import { matchTypeDictionary } from '@/lib/match-type-dictionary'
import type { TermResearchResult } from '@/lib/search-term-research'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Candidate {
  id: string | number
  client?: { id: string | number; name?: string } | string | number
  searchTerm: string
  triggeringKeyword: string
  campaignName: string
  adGroupName: string
  matchType: 'EXACT' | 'PHRASE'
  violationType: 'exact_close_variant' | 'phrase_missing_word'
  impressions: number
  clicks: number
  status: 'pending' | 'approved' | 'rejected'
  assignedListId?: { id: string | number; name?: string } | string | number
  recommendedKeyword?: string
  recommendedMatchType?: 'exact' | 'phrase'
  offendingWords?: string
  nearestKeyword?: string
  lastSeenAt: string
  firstSeenAt: string
}

type RoutingMode = 'auto' | 'existing'
type KeywordTargetMode = 'auto' | 'adGroup'
type NegMatchType = 'exact' | 'phrase'
type ConfidenceFilter = '' | 'safe' | 'review' | 'opportunity'
type NegativeEdit = { keyword: string; matchType: NegMatchType }
interface AdGroupOption {
  adGroupId: string
  adGroupName: string
  campaignName: string
  status: string
}
type CandidateGroup = {
  key: string
  campaignName: string
  adGroupName: string
  candidates: Candidate[]
  pendingCount: number
  impressions: number
  clicks: number
  maxClicks: number
}

type KeywordActionStatus = {
  kind: 'loading' | 'success' | 'error'
  title: string
  lines: string[]
}

// Columns the user can show/hide. Search Term, Negative and Actions stay pinned.
const HIDEABLE_COLUMNS = [
  { key: 'triggeringKeyword', label: 'Triggering Keyword' },
  { key: 'matchType', label: 'Match Type' },
  { key: 'violation', label: 'Violation' },
  { key: 'confidence', label: 'Confidence' },
  { key: 'impressions', label: 'Impressions' },
  { key: 'clicks', label: 'Clicks' },
  { key: 'campaign', label: 'Campaign' },
  { key: 'route', label: 'Route' },
  { key: 'status', label: 'Status' },
  { key: 'lastSeen', label: 'Last Seen' },
] as const

interface NegativeKeywordList {
  id: string | number
  name: string
  client?: { id: string | number; name?: string } | string | number
}

interface ListResponse {
  docs: Candidate[]
  totalDocs: number
  page: number
  totalPages: number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const VIOLATION_LABELS: Record<string, string> = {
  exact_close_variant: 'Exact Close Variant',
  phrase_missing_word: 'Phrase Missing Word',
}

const MATCH_TYPE_LABELS: Record<string, string> = {
  EXACT: 'Exact',
  PHRASE: 'Phrase',
}

const KNOWN_COMPETITOR_BRAND_TOKENS = new Set([
  'pwc', 'rsm', 'ey', 'ay', 'kpmg', 'deloitte', 'wasserman', 'forvis', 'mazars',
  'clifton', 'larson', 'magone', 'venturity', 'kaizen', 'korrectboost', 'socialwick',
])

const SAFE_SHORT_NON_BRAND_TOKENS = new Set([
  'ea', 'va', 'pa', 'it', 'hr', 'seo', 'ppc', 'cpa', 'smm', 'crm', 'erp', 'saas',
])

const REQUIRED_INTENT_QUALIFIER_TOKENS = new Set([
  'outsource', 'outsourcing', 'outsourced', 'service', 'servic', 'company', 'agency',
  'provider', 'consultant', 'staffing', 'hire', 'hiring',
])

function cleanActionError(value: unknown): string {
  const raw = typeof value === 'string' ? value : JSON.stringify(value ?? '')
  return raw
    .replace(/Failed query:[\s\S]*$/i, 'CMS negative-list save failed')
    .replace(/Google Ads mutate failed \(\d+\):[\s\S]*$/i, (match) => match.split('\n')[0] ?? match)
    .trim()
}

function hasLikelyCompetitorBrandDrift(searchWords: string[], keywordSet: Set<string>, allowListTerms: AllowListTermInput[]): boolean {
  const allowList = buildAllowListSet(allowListTerms)
  return searchWords.some((word) => {
    if (keywordSet.has(word)) return false
    if (allowList.has(word)) return false
    if (KNOWN_COMPETITOR_BRAND_TOKENS.has(word)) return true
    return word.length <= 3 && !SAFE_SHORT_NON_BRAND_TOKENS.has(word)
  })
}

function confidenceFor(c: Candidate, synonymRules: SynonymRuleInput[] = [], allowListTerms: AllowListTermInput[] = []): { key: Exclude<ConfidenceFilter, ''>; label: string; reason: string; bg: string; color: string } {
  const clicks = Number(c.clicks || 0)
  const impressions = Number(c.impressions || 0)
  const ctr = impressions > 0 ? clicks / impressions : 0
  const searchWords = contentWords(c.searchTerm)
  const keywordWords = contentWords(c.triggeringKeyword)
  const keywordSet = new Set(keywordWords)
  const searchSet = new Set(searchWords)
  const allowList = buildAllowListSet(allowListTerms)
  const sharedWordCount = searchWords.filter((word) => keywordSet.has(word)).length
  const addedWords = searchWords.filter((word) => !keywordSet.has(word) && !allowList.has(word))
  const offendingWords = contentWords(c.offendingWords || '').filter((word) => !allowList.has(word))
  const missingWordCount = keywordWords.filter((word) => !searchSet.has(word)).length
  const synonymOverlapCount = countSynonymOverlap(searchWords, keywordWords, synonymRules, {
    searchTerm: c.searchTerm,
    triggeringKeyword: c.triggeringKeyword,
    campaignName: c.campaignName,
    adGroupName: c.adGroupName,
  })
  const semanticOverlapCount = sharedWordCount + synonymOverlapCount
  const hasClearDrift = addedWords.length > 0 || missingWordCount > 0 || offendingWords.length > 0
  const hasTrafficSignal = clicks > 0 || impressions >= 10
  const hasCompetitorBrandDrift = hasLikelyCompetitorBrandDrift(searchWords, keywordSet, allowListTerms)
  const hasUnknownBrandDrift = hasLikelyUnknownBrandToken(searchWords, keywordWords, allowListTerms, matchTypeDictionary)
  const isMissingIntentQualifier = keywordWords.some((word) => REQUIRED_INTENT_QUALIFIER_TOKENS.has(word) && !searchSet.has(word))
  const hasWeakSemanticOverlap = semanticOverlapCount <= 1

  if (impressions >= 2 && hasClearDrift && (hasCompetitorBrandDrift || (hasUnknownBrandDrift && hasWeakSemanticOverlap) || (isMissingIntentQualifier && hasWeakSemanticOverlap))) {
    return {
      key: 'safe',
      label: 'Safe to negate',
      reason: hasCompetitorBrandDrift
        ? 'Contains a likely competitor/brand-name token that is not part of the triggering keyword, so treat as safe to negate/remove.'
        : hasUnknownBrandDrift
        ? 'Contains an extra word that is not in the local dictionary or allow-list, so it is likely brand/person/company-name drift.'
        : 'Missing the triggering keyword’s core intent qualifier, such as outsource/services/company, with only weak semantic overlap — likely safe to negate/remove.',
      bg: '#dcfce7',
      color: '#166534',
    }
  }

  if (hasTrafficSignal && semanticOverlapCount >= 2) {
    return {
      key: 'opportunity',
      label: 'Keyword opportunity',
      reason: clicks > 0
        ? 'Clicked 7-day term with strong semantic overlap from shared words/synonyms — review as a possible keyword/ad group before negating.'
        : '10+ impression term with strong semantic overlap from shared words/synonyms — review as a possible keyword/ad group.',
      bg: '#fef3c7',
      color: '#92400e',
    }
  }

  if (impressions >= 2 && hasClearDrift && semanticOverlapCount === 0) {
    return {
      key: 'safe',
      label: 'Safe to negate',
      reason: clicks > 0
        ? 'Has clicks, but no shared words or synonym overlap with the triggering keyword — likely brand/competitor drift to negate/remove.'
        : 'Clear wording drift with no shared words or synonym overlap with the triggering keyword — likely safe to negate/remove.',
      bg: '#dcfce7',
      color: '#166534',
    }
  }

  return {
    key: 'review',
    label: 'Review',
    reason: ctr > 0
      ? 'Has clicks and partial semantic overlap — check before deciding whether to negate or add as a keyword.'
      : 'Mixed signals: some wording or synonym overlap exists, but confidence is not strong enough for opportunity.',
    bg: '#e0e7ff',
    color: '#3730a3',
  }
}

/** Google search URL for a search term, opened in a new tab for quick research. */
function googleSearchUrl(term: string): string {
  return `https://www.google.com/search?q=${encodeURIComponent(term)}`
}

function violationColor(type: string): string {
  return type === 'exact_close_variant'
    ? '#dc2626'
    : type === 'phrase_missing_word'
    ? '#d97706'
    : '#6b7280'
}

function statusColor(status: string): string {
  switch (status) {
    case 'pending': return '#2563eb'
    case 'approved': return '#16a34a'
    case 'rejected': return '#6b7280'
    default: return '#6b7280'
  }
}

function formatNumber(n: number): string {
  return new Intl.NumberFormat('en-GB').format(n)
}

/** Content keyword words absent from the search term — the "missing words". */
function missingWords(searchTerm: string, triggeringKeyword: string): string[] {
  const termSet = new Set(contentWords(searchTerm))
  return contentWords(triggeringKeyword).filter((w) => !termSet.has(w))
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function compareCandidatesByTraffic(a: Candidate, b: Candidate): number {
  const clickDiff = (b.clicks || 0) - (a.clicks || 0)
  if (clickDiff !== 0) return clickDiff
  const impressionDiff = (b.impressions || 0) - (a.impressions || 0)
  if (impressionDiff !== 0) return impressionDiff
  return a.searchTerm.localeCompare(b.searchTerm)
}

function groupCandidatesByAdGroup(candidates: Candidate[]): CandidateGroup[] {
  const groups = new Map<string, CandidateGroup>()

  for (const candidate of candidates) {
    const campaignName = candidate.campaignName || 'Unknown campaign'
    const adGroupName = candidate.adGroupName || 'Unknown ad group'
    const key = `${campaignName}\u0000${adGroupName}`
    const existing = groups.get(key)

    if (existing) {
      existing.candidates.push(candidate)
      existing.impressions += candidate.impressions || 0
      existing.clicks += candidate.clicks || 0
      existing.maxClicks = Math.max(existing.maxClicks, candidate.clicks || 0)
      if (candidate.status === 'pending') existing.pendingCount += 1
    } else {
      groups.set(key, {
        key,
        campaignName,
        adGroupName,
        candidates: [candidate],
        pendingCount: candidate.status === 'pending' ? 1 : 0,
        impressions: candidate.impressions || 0,
        clicks: candidate.clicks || 0,
        maxClicks: candidate.clicks || 0,
      })
    }
  }

  return Array.from(groups.values()).map((group) => ({
    ...group,
    candidates: [...group.candidates].sort(compareCandidatesByTraffic),
  })).sort((a, b) => {
    const maxClickDiff = (b.maxClicks || 0) - (a.maxClicks || 0)
    if (maxClickDiff !== 0) return maxClickDiff
    const clickDiff = (b.clicks || 0) - (a.clicks || 0)
    if (clickDiff !== 0) return clickDiff
    const impressionDiff = (b.impressions || 0) - (a.impressions || 0)
    if (impressionDiff !== 0) return impressionDiff
    if (b.pendingCount !== a.pendingCount) return b.pendingCount - a.pendingCount
    return `${a.campaignName} ${a.adGroupName}`.localeCompare(`${b.campaignName} ${b.adGroupName}`)
  })
}

// ─── NKL Picker Modal ─────────────────────────────────────────────────────────

function NklPickerModal({
  lists,
  onConfirm,
  onCancel,
  pendingCount,
  loading,
}: {
  lists: NegativeKeywordList[]
  onConfirm: (routing: { mode: RoutingMode; listId?: string | number }) => void
  onCancel: () => void
  pendingCount: number
  loading: boolean
}) {
  const [mode, setMode] = useState<RoutingMode>('auto')
  const [selected, setSelected] = useState<string | number | ''>('')
  const canConfirm = mode === 'auto' || !!selected
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      backgroundColor: 'rgba(0,0,0,0.5)',
    }}>
      <div style={{
        background: 'white', borderRadius: 8, padding: 24, width: 440, maxWidth: '90vw',
        boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
      }}>
        <h3 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 600 }}>
          Approve {pendingCount} violation{pendingCount !== 1 ? 's' : ''}
        </h3>
        <p style={{ margin: '0 0 16px', color: '#6b7280', fontSize: 13 }}>
          Each violation is added using its recommended negative (editable per row before bulk approve).
        </p>
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 10, cursor: 'pointer', fontSize: 13 }}>
          <input type="radio" checked={mode === 'auto'} onChange={() => setMode('auto')} style={{ marginTop: 3 }} />
          <span>Ad-group lists <span style={{ color: '#6b7280' }}>— auto-match each candidate to its ad-group list, creating one when none exists.</span></span>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, cursor: 'pointer', fontSize: 13 }}>
          <input type="radio" checked={mode === 'existing'} onChange={() => setMode('existing')} />
          <span>Assign all to one existing list</span>
        </label>
        {mode === 'existing' && (
          <select
            value={String(selected)}
            onChange={(e) => setSelected(e.target.value)}
            style={{
              width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #d1d5db',
              fontSize: 14, marginBottom: 16,
            }}
          >
            <option value="">— Select a list —</option>
            {lists.map((l) => (
              <option key={String(l.id)} value={String(l.id)}>
                {l.name}
              </option>
            ))}
          </select>
        )}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onCancel} disabled={loading} style={btnStyle('ghost')}>Cancel</button>
          <button
            onClick={() => canConfirm && onConfirm(mode === 'existing' ? { mode: 'existing', listId: selected as string | number } : { mode: 'auto' })}
            disabled={!canConfirm || loading}
            style={btnStyle('primary', !canConfirm || loading)}
          >
            {loading ? 'Approving…' : 'Approve'}
          </button>
        </div>
      </div>
    </div>
  )
}

function KeywordTargetPickerModal({
  adGroups,
  error,
  onConfirm,
  onCancel,
  pendingCount,
}: {
  adGroups: AdGroupOption[]
  error: string | null
  onConfirm: (target: { mode: KeywordTargetMode; adGroupIds?: string[] }) => void
  onCancel: () => void
  pendingCount: number
}) {
  const [mode, setMode] = useState<KeywordTargetMode>('auto')
  const [adGroupIds, setAdGroupIds] = useState<string[]>([])
  const [adGroupSearch, setAdGroupSearch] = useState('')
  const filteredAdGroups = useMemo(() => {
    const query = adGroupSearch.trim().toLowerCase()
    if (!query) return adGroups
    return adGroups.filter((group) => `${group.campaignName ?? ''} ${group.adGroupName ?? ''} ${group.adGroupId}`.toLowerCase().includes(query))
  }, [adGroupSearch, adGroups])
  const canConfirm = mode === 'auto' || adGroupIds.length > 0
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div style={{ background: 'white', borderRadius: 8, padding: 24, width: 760, maxWidth: '96vw', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <h3 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 600 }}>Add {pendingCount} as exact keyword{pendingCount !== 1 ? 's' : ''}</h3>
        <p style={{ margin: '0 0 16px', color: '#6b7280', fontSize: 13 }}>
          Add selected search terms as enabled EXACT keywords. Choose the matching exact ad group automatically, or move them into one ad group you select.
        </p>
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 10, cursor: 'pointer', fontSize: 13 }}>
          <input type="radio" checked={mode === 'auto'} onChange={() => setMode('auto')} style={{ marginTop: 3 }} />
          <span>Matching exact ad group <span style={{ color: '#6b7280' }}>— uses the row’s ad group/campaign and prefers Exact/EM campaigns.</span></span>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, cursor: 'pointer', fontSize: 13 }}>
          <input type="radio" checked={mode === 'adGroup'} onChange={() => setMode('adGroup')} />
          <span>Move all selected terms to selected ad group(s)</span>
        </label>
        {mode === 'adGroup' && (
          <>
            <input
              type="search"
              value={adGroupSearch}
              onChange={(e) => setAdGroupSearch(e.currentTarget.value)}
              placeholder="Search campaign or ad group…"
              style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13, marginBottom: 8 }}
            />
            <div style={{ maxHeight: 320, overflowY: 'auto', border: '1px solid #d1d5db', borderRadius: 6, marginBottom: 6, background: 'white' }}>
              {adGroups.length === 0 ? (
                <div style={{ padding: '10px 12px', color: '#6b7280', fontSize: 13 }}>No active ad groups found.</div>
              ) : filteredAdGroups.length === 0 ? (
                <div style={{ padding: '10px 12px', color: '#6b7280', fontSize: 13 }}>No ad groups match “{adGroupSearch}”.</div>
              ) : filteredAdGroups.map((group) => {
                const checked = adGroupIds.includes(group.adGroupId)
                return (
                  <label key={group.adGroupId} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '8px 10px', borderBottom: '1px solid #f3f4f6', cursor: 'pointer', fontSize: 13 }}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => setAdGroupIds((prev) => checked ? prev.filter((id) => id !== group.adGroupId) : [...prev, group.adGroupId])}
                      style={{ marginTop: 2 }}
                    />
                    <span style={{ minWidth: 0 }}>
                      <strong>{group.campaignName || 'Unknown campaign'}</strong>
                      <span style={{ color: '#6b7280' }}> — {group.adGroupName || group.adGroupId}</span>
                    </span>
                  </label>
                )
              })}
            </div>
            <div style={{ marginBottom: 12, color: '#6b7280', fontSize: 12 }}>
              Select one or more active ad groups. Selected: {adGroupIds.length}
            </div>
          </>
        )}
        {error && <div style={{ marginBottom: 12, color: '#dc2626', fontSize: 12 }}>{error}</div>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onCancel} style={btnStyle('ghost')}>Cancel</button>
          <button onClick={() => canConfirm && onConfirm(mode === 'adGroup' ? { mode, adGroupIds } : { mode })} disabled={!canConfirm} style={btnStyle('primary', !canConfirm)}>Add exact keywords</button>
        </div>
      </div>
    </div>
  )
}

function uniqueDisplayWords(text: string): string[] {
  return Array.from(
    new Set(
      String(text ?? '')
        .toLowerCase()
        .split(/\s+/)
        .map((word) => word.replace(/^[^a-z0-9]+|[^a-z0-9]+$/gi, '').trim())
        .filter(Boolean),
    ),
  ).sort()
}

function TeachSynonymModal({
  candidate,
  saving,
  error,
  onCancel,
  onSave,
}: {
  candidate: Candidate
  saving: boolean
  error: string | null
  onCancel: () => void
  onSave: (input: { termA: string; termB: string; contextTerms: string; notes: string }) => void
}) {
  const searchWords = uniqueDisplayWords(candidate.searchTerm)
  const keywordWords = uniqueDisplayWords(candidate.triggeringKeyword)
  const [termA, setTermA] = useState(searchWords[0] ?? '')
  const [termB, setTermB] = useState(keywordWords[0] ?? '')
  const [contextTerms, setContextTerms] = useState('')
  const [notes, setNotes] = useState('')
  const canSave = termA.trim() && termB.trim() && termA.trim().toLowerCase() !== termB.trim().toLowerCase()

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: 'white', borderRadius: 10, padding: 22, width: 520, maxWidth: '95vw', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
        <h3 style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 600 }}>Teach synonym</h3>
        <p style={{ margin: '0 0 14px', color: '#64748b', fontSize: 13, lineHeight: 1.45 }}>
          Saved synonym rules affect review confidence only. Add context when this synonym is only valid in a niche.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
          <label style={{ fontSize: 12, color: '#475569', fontWeight: 600 }}>
            Search-term word/phrase
            <input list="mtv-search-words" value={termA} onChange={(e) => setTermA(e.target.value)} style={inputStyle()} placeholder="e.g. support" />
            <datalist id="mtv-search-words">{searchWords.map((word) => <option key={word} value={word} />)}</datalist>
          </label>
          <label style={{ fontSize: 12, color: '#475569', fontWeight: 600 }}>
            Triggering-keyword word/phrase
            <input list="mtv-keyword-words" value={termB} onChange={(e) => setTermB(e.target.value)} style={inputStyle()} placeholder="e.g. services" />
            <datalist id="mtv-keyword-words">{keywordWords.map((word) => <option key={word} value={word} />)}</datalist>
          </label>
        </div>
        <label style={{ display: 'block', fontSize: 12, color: '#475569', fontWeight: 600, marginBottom: 12 }}>
          Context terms <span style={{ color: '#94a3b8', fontWeight: 400 }}>(optional)</span>
          <input value={contextTerms} onChange={(e) => setContextTerms(e.target.value)} style={inputStyle()} placeholder="e.g. bookkeeping, assistant, outsourcing" />
          <span style={{ display: 'block', marginTop: 4, color: '#64748b', fontWeight: 400 }}>
            Leave blank for generic synonyms like support ↔ services. Add context for risky pairs like virtual ↔ outsourcing.
          </span>
        </label>
        <label style={{ display: 'block', fontSize: 12, color: '#475569', fontWeight: 600, marginBottom: 12 }}>
          Notes <span style={{ color: '#94a3b8', fontWeight: 400 }}>(optional)</span>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} style={{ ...inputStyle(), minHeight: 70, resize: 'vertical' }} placeholder="Why this synonym is valid" />
        </label>
        <div style={{ color: '#64748b', fontSize: 12, marginBottom: 12, lineHeight: 1.45 }}>
          Source: “{candidate.searchTerm}” ↔ “{candidate.triggeringKeyword}”
        </div>
        {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', borderRadius: 6, padding: '8px 10px', fontSize: 12, marginBottom: 12 }}>{error}</div>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onCancel} disabled={saving} style={btnStyle('ghost')}>Cancel</button>
          <button onClick={() => canSave && onSave({ termA, termB, contextTerms, notes })} disabled={!canSave || saving} style={btnStyle('primary', !canSave || saving)}>
            {saving ? 'Saving…' : 'Save synonym'}
          </button>
        </div>
      </div>
    </div>
  )
}

function TermResearchModal({
  adGroupName,
  loading,
  error,
  results,
  grounded,
  termCandidates,
  busy,
  onApproveTerms,
  onDismissTerms,
  onClose,
}: {
  adGroupName: string
  loading: boolean
  error: string | null
  results: TermResearchResult[] | null
  grounded: boolean
  /** Lowercased search term → still-pending candidate it maps to. */
  termCandidates: Map<string, Candidate>
  busy: boolean
  onApproveTerms: (ids: (string | number)[]) => void | Promise<void>
  onDismissTerms: (ids: (string | number)[]) => void | Promise<void>
  onClose: () => void
}) {
  // Track selected terms by lowercased key so selection survives re-renders as
  // candidates drop out after actioning.
  const [selectedTerms, setSelectedTerms] = useState<Set<string>>(new Set())

  const actionableKeys = (results ?? [])
    .map((r) => r.term.toLowerCase())
    .filter((key) => termCandidates.has(key))
  const selectableCount = actionableKeys.length
  const selectedCount = actionableKeys.filter((key) => selectedTerms.has(key)).length
  const allSelected = selectableCount > 0 && selectedCount === selectableCount

  const toggleTerm = (key: string) =>
    setSelectedTerms((prev) => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })

  const toggleAll = (checked: boolean) =>
    setSelectedTerms(checked ? new Set(actionableKeys) : new Set())

  const idsFor = (keys: string[]): (string | number)[] =>
    keys.map((key) => termCandidates.get(key)?.id).filter((id): id is string | number => id != null)

  const runAction = async (action: (ids: (string | number)[]) => void | Promise<void>, keys: string[]) => {
    const ids = idsFor(keys)
    if (ids.length === 0) return
    await action(ids)
    setSelectedTerms((prev) => {
      const next = new Set(prev)
      keys.forEach((key) => next.delete(key))
      return next
    })
  }

  const selectedKeys = actionableKeys.filter((key) => selectedTerms.has(key))

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 70, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: 'white', borderRadius: 10, width: 720, maxWidth: '96vw', maxHeight: '86vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
        <div style={{ padding: '22px 22px 0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 6 }}>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>Research search terms</h3>
            <button onClick={onClose} style={{ ...btnStyle('ghost'), fontSize: 12, padding: '4px 10px' }}>Close</button>
          </div>
          <p style={{ margin: '0 0 12px', color: '#64748b', fontSize: 13, lineHeight: 1.45 }}>
            {adGroupName} — one-sentence summary per term, based on the top Google result. Approve or dismiss terms without leaving this window.
            {!grounded && (
              <span style={{ display: 'block', marginTop: 6, color: '#9a3412' }}>
                Live Google grounding is unavailable (Growth Tools SERP lookup not reachable/configured), so summaries fall back to the model’s own knowledge.
              </span>
            )}
          </p>
          {selectableCount > 0 && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#374151', marginBottom: 10, cursor: 'pointer' }}>
              <input type="checkbox" checked={allSelected} onChange={(e) => toggleAll(e.target.checked)} />
              Select all {selectableCount} pending term{selectableCount !== 1 ? 's' : ''}
            </label>
          )}
        </div>
        <div style={{ padding: '0 22px', overflowY: 'auto', flex: 1 }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 32, color: '#6b7280', fontSize: 13 }}>Searching Google and summarising…</div>
          ) : error ? (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', borderRadius: 6, padding: '10px 12px', fontSize: 13 }}>{error}</div>
          ) : results && results.length > 0 ? (
            <div style={{ display: 'grid', gap: 10, paddingBottom: 4 }}>
              {results.map((r) => {
                const key = r.term.toLowerCase()
                const candidate = termCandidates.get(key)
                const isSelected = selectedTerms.has(key)
                return (
                  <div key={r.term} style={{ border: `1px solid ${isSelected ? '#bfdbfe' : '#e5e7eb'}`, background: isSelected ? '#eff6ff' : 'white', borderRadius: 8, padding: '10px 12px', display: 'flex', gap: 10 }}>
                    <div style={{ paddingTop: 1 }}>
                      {candidate ? (
                        <input type="checkbox" checked={isSelected} onChange={() => toggleTerm(key)} title="Select this term" />
                      ) : (
                        <span title="Already actioned or not pending" style={{ display: 'inline-block', width: 13 }} />
                      )}
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                        <a href={googleSearchUrl(r.term)} target="_blank" rel="noopener noreferrer" style={{ fontWeight: 600, color: '#1d4ed8', textDecoration: 'none', fontSize: 13 }}>
                          {r.term}
                        </a>
                        {!r.grounded && <span style={badgeStyle('#fef3c7', '#92400e')}>ungrounded</span>}
                        {!candidate && <span style={badgeStyle('#e5e7eb', '#6b7280')}>done</span>}
                      </div>
                      <div style={{ fontSize: 13, color: '#111827', lineHeight: 1.45 }}>{r.summary}</div>
                      {r.source && (
                        <a href={r.source.link} target="_blank" rel="noopener noreferrer" title={r.source.link} style={{ display: 'block', marginTop: 4, fontSize: 12, color: '#6b7280', textDecoration: 'none', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          Source: {r.source.title}
                        </a>
                      )}
                      {candidate && (
                        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                          <button
                            onClick={() => void runAction(onApproveTerms, [key])}
                            disabled={busy}
                            title="Approve this term as an ad-group negative keyword"
                            style={{ ...btnStyle('primary', busy), fontSize: 11, padding: '4px 10px' }}
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => void runAction(onDismissTerms, [key])}
                            disabled={busy}
                            title="Dismiss this term so it no longer appears as pending"
                            style={{ ...btnStyle('ghost'), fontSize: 11, padding: '4px 10px' }}
                          >
                            Dismiss
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: 32, color: '#6b7280', fontSize: 13 }}>No results.</div>
          )}
        </div>
        {selectableCount > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 22px', borderTop: '1px solid #e5e7eb' }}>
            <span style={{ fontSize: 12, color: '#64748b', marginRight: 'auto' }}>
              {selectedCount} selected
            </span>
            <button
              onClick={() => void runAction(onDismissTerms, selectedKeys)}
              disabled={busy || selectedCount === 0}
              style={{ ...btnStyle('ghost'), fontSize: 12, padding: '6px 12px', opacity: busy || selectedCount === 0 ? 0.5 : 1 }}
            >
              Dismiss selected
            </button>
            <button
              onClick={() => void runAction(onApproveTerms, selectedKeys)}
              disabled={busy || selectedCount === 0}
              style={{ ...btnStyle('primary', busy || selectedCount === 0), fontSize: 12, padding: '6px 12px' }}
            >
              Approve selected
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function inputStyle(): React.CSSProperties {
  return {
    display: 'block', width: '100%', boxSizing: 'border-box', marginTop: 5,
    padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6,
    fontSize: 13, color: '#111827', fontWeight: 400,
  }
}

function btnStyle(variant: 'primary' | 'ghost', disabled?: boolean): React.CSSProperties {
  if (variant === 'primary') {
    return {
      padding: '7px 16px', borderRadius: 6, border: 'none',
      background: disabled ? '#d1d5db' : '#2563eb', color: 'white',
      fontSize: 13, fontWeight: 500, cursor: disabled ? 'not-allowed' : 'pointer',
    }
  }
  return {
    padding: '7px 16px', borderRadius: 6, border: '1px solid #d1d5db',
    background: 'white', color: '#374151', fontSize: 13, cursor: 'pointer',
  }
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function MatchTypeViolationReview({
  initialClientId,
}: {
  initialClientId?: string
}) {
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [totalDocs, setTotalDocs] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [syncRunCount, setSyncRunCount] = useState<number | null>(null)
  const [synonymRules, setSynonymRules] = useState<SynonymRuleInput[]>([])
  const [synonymRulesLoading, setSynonymRulesLoading] = useState(false)
  const [synonymError, setSynonymError] = useState<string | null>(null)
  const [allowListTerms, setAllowListTerms] = useState<AllowListTermInput[]>([])
  const [allowListError, setAllowListError] = useState<string | null>(null)
  const [teachCandidate, setTeachCandidate] = useState<Candidate | null>(null)
  const [teachSaving, setTeachSaving] = useState(false)
  const [teachError, setTeachError] = useState<string | null>(null)

  // Filters
  const [filterClient, setFilterClient] = useState(initialClientId ?? '')
  const [filterStatus, setFilterStatus] = useState('pending')
  const [filterMatchType, setFilterMatchType] = useState('PHRASE')
  const [filterViolationType, setFilterViolationType] = useState('')
  const [filterConfidence, setFilterConfidence] = useState<ConfidenceFilter>('')

  // Bulk selection
  const [selected, setSelected] = useState<Set<string | number>>(new Set())
  const [showNklPicker, setShowNklPicker] = useState(false)
  const [showKeywordTargetPicker, setShowKeywordTargetPicker] = useState(false)
  const [nklLists, setNklLists] = useState<NegativeKeywordList[]>([])
  const [adGroupOptions, setAdGroupOptions] = useState<AdGroupOption[]>([])
  const [adGroupError, setAdGroupError] = useState<string | null>(null)
  const [bulkLoading, setBulkLoading] = useState(false)
  const [keywordActionStatus, setKeywordActionStatus] = useState<KeywordActionStatus | null>(null)

  // Per-row action loading
  const [actionLoading, setActionLoading] = useState<Set<string | number>>(new Set())

  // Batch search-term research (grounded one-sentence summaries)
  const [researchGroup, setResearchGroup] = useState<{ key: string; adGroupName: string } | null>(null)
  const [researchLoading, setResearchLoading] = useState(false)
  const [researchError, setResearchError] = useState<string | null>(null)
  const [researchResults, setResearchResults] = useState<TermResearchResult[] | null>(null)
  const [researchGrounded, setResearchGrounded] = useState(true)

  // Collapsible help, inline negative edits, and column visibility
  const [helpOpen, setHelpOpen] = useState(false)
  const [edits, setEdits] = useState<Map<string | number, NegativeEdit>>(new Map())
  const [hiddenCols, setHiddenCols] = useState<Set<string>>(new Set())
  const [showColMenu, setShowColMenu] = useState(false)
  const toolbarAnchorRef = useRef<HTMLDivElement | null>(null)
  const toolbarRef = useRef<HTMLDivElement | null>(null)
  const [toolbarPinned, setToolbarPinned] = useState(false)
  const [toolbarBox, setToolbarBox] = useState({ left: 0, right: 0, height: 0 })

  const isVisible = useCallback((key: string) => !hiddenCols.has(key), [hiddenCols])
  const toggleCol = (key: string) =>
    setHiddenCols((prev) => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })

  // Resolve the negative a row will add: the user's inline edit if present,
  // else the detector recommendation / violation-type default.
  const negativeFor = useCallback(
    (c: Candidate): NegativeEdit => {
      const edited = edits.get(c.id)
      if (edited) return edited
      const fallback = buildNegativeFromViolation({
        searchTerm: c.searchTerm,
        triggeringKeyword: c.triggeringKeyword,
        violationType: c.violationType,
        recommendedKeyword: c.recommendedKeyword,
        recommendedMatchType: c.recommendedMatchType,
        nearestKeyword: c.nearestKeyword,
      })
      return { keyword: fallback.keyword, matchType: 'exact' }
    },
    [edits, synonymRules, allowListTerms],
  )

  const setNegative = (id: string | number, patch: Partial<NegativeEdit>, base: NegativeEdit) =>
    setEdits((prev) => {
      const next = new Map(prev)
      next.set(id, { ...base, ...patch })
      return next
    })

  // Bulk-set the negative match type for selected pending rows first; if nothing
  // is selected, fall back to every pending row in the current loaded set.
  const setAllMatchTypes = (matchType: NegMatchType) =>
    setEdits((prev) => {
      const next = new Map(prev)
      const hasSelection = selected.size > 0
      for (const c of candidates) {
        if (c.status !== 'pending') continue
        if (hasSelection && !selected.has(c.id)) continue
        next.set(c.id, { ...negativeFor(c), matchType })
      }
      return next
    })

  const fetchSynonymRules = useCallback(async () => {
    setSynonymRulesLoading(true)
    setSynonymError(null)
    try {
      const res = await fetch('/api/match-type-synonyms')
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      setSynonymRules(Array.isArray(data.docs) ? data.docs : [])
    } catch (e: any) {
      setSynonymError(e?.message || 'Failed to load synonym rules')
      setSynonymRules([])
    } finally {
      setSynonymRulesLoading(false)
    }
  }, [])

  useEffect(() => { void fetchSynonymRules() }, [fetchSynonymRules])

  const fetchAllowListTerms = useCallback(async () => {
    setAllowListError(null)
    try {
      const res = await fetch('/api/match-type-allow-list')
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      setAllowListTerms(Array.isArray(data.docs) ? data.docs : [])
    } catch (e: any) {
      setAllowListError(e?.message || 'Failed to load allow-list terms')
      setAllowListTerms([])
    }
  }, [])

  useEffect(() => { void fetchAllowListTerms() }, [fetchAllowListTerms])

  // Fetch total sync run count from activity log
  useEffect(() => {
    ;(async () => {
      try {
        const res = await fetch('/api/activity-log?where[type][equals]=match_type_violation_sync&limit=1&depth=0')
        if (res.ok) {
          const data = await res.json()
          setSyncRunCount(data.totalDocs ?? 0)
        }
      } catch { /* non-critical */ }
    })()
  }, [])

  // Load every page up front so the table is one continuous scrollable list
  // (no Previous/Next pagination).
  // `silent` skips the full-table Loading state so post-action reconciliation
  // refetches don't flash every ad group away — the optimistic row removal has
  // already updated the UI, so a group stays visible until its own terms are
  // all actioned/dismissed rather than briefly vanishing on every approve.
  const fetchCandidates = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent === true
    if (!silent) setLoading(true)
    setError(null)
    const baseParams = new URLSearchParams({ limit: '100' })
    if (filterClient) baseParams.set('client', filterClient)
    if (filterStatus) baseParams.set('status', filterStatus)
    if (filterMatchType) baseParams.set('matchType', filterMatchType)
    if (filterViolationType) baseParams.set('violationType', filterViolationType)

    try {
      const all: Candidate[] = []
      let pageNum = 1
      let total = 0
      // Hard cap of 50 pages (5,000 rows) as a runaway guard.
      for (; pageNum <= 50; pageNum++) {
        const params = new URLSearchParams(baseParams)
        params.set('page', String(pageNum))
        const res = await fetch(`/api/match-type-violations?${params}`)
        if (!res.ok) throw new Error(await res.text())
        const data: ListResponse = await res.json()
        all.push(...data.docs)
        total = data.totalDocs
        if (pageNum >= data.totalPages) break
      }
      setCandidates(all)
      setTotalDocs(total)
      // A silent post-action refetch must preserve the reviewer's selections and
      // inline negative edits in other ad groups (the whole point of acting
      // without losing your place). Only a full/filter reload clears them.
      if (!silent) {
        setSelected(new Set())
        setEdits(new Map())
      }
    } catch (e: any) {
      setError(e.message)
    } finally {
      if (!silent) setLoading(false)
    }
  }, [filterClient, filterStatus, filterMatchType, filterViolationType])

  const saveSynonymRule = async (input: { termA: string; termB: string; contextTerms: string; notes: string }) => {
    if (!teachCandidate) return
    setTeachSaving(true)
    setTeachError(null)
    try {
      const res = await fetch('/api/match-type-synonyms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...input,
          sourceSearchTerm: teachCandidate.searchTerm,
          sourceTriggeringKeyword: teachCandidate.triggeringKeyword,
        }),
      })
      if (!res.ok) throw new Error(await res.text())
      await fetchSynonymRules()
      setTeachCandidate(null)
    } catch (e: any) {
      setTeachError(e?.message || 'Failed to save synonym rule')
    } finally {
      setTeachSaving(false)
    }
  }

  const fetchNklLists = useCallback(async () => {
    const clientId = filterClient
    const params = new URLSearchParams({ limit: '100' })
    if (clientId) params.set('where[client][equals]', clientId)
    const res = await fetch(`/api/negative-keyword-lists?${params}`)
    if (res.ok) {
      const data = await res.json()
      setNklLists(data.docs ?? [])
    }
  }, [filterClient])

  const fetchAdGroups = useCallback(async () => {
    const clientId = filterClient || initialClientId
    if (!clientId) return
    setAdGroupError(null)
    try {
      const res = await fetch(`/api/match-type-violations/ad-groups?client=${encodeURIComponent(String(clientId))}`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
      setAdGroupOptions(Array.isArray(data.adGroups) ? data.adGroups : [])
    } catch (e: any) {
      setAdGroupError(e?.message || 'Failed to load ad groups')
      setAdGroupOptions([])
    }
  }, [filterClient, initialClientId])

  useEffect(() => { void fetchCandidates() }, [fetchCandidates])

  useEffect(() => {
    let frame = 0
    const headerOffset = 56
    const measureToolbar = () => {
      const anchor = toolbarAnchorRef.current
      const toolbar = toolbarRef.current
      if (!anchor || !toolbar) return
      const anchorRect = anchor.getBoundingClientRect()
      const toolbarRect = toolbar.getBoundingClientRect()
      setToolbarPinned(anchorRect.top <= headerOffset)
      setToolbarBox({
        left: anchorRect.left,
        right: Math.max(0, window.innerWidth - anchorRect.right),
        height: toolbarRect.height || anchorRect.height || 78,
      })
    }
    const schedule = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(measureToolbar)
    }
    schedule()
    window.addEventListener('scroll', schedule, true)
    window.addEventListener('resize', schedule)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', schedule, true)
      window.removeEventListener('resize', schedule)
    }
  }, [selected.size, filterStatus, filterMatchType, filterViolationType, filterConfidence, showColMenu])

  const handleApprove = async (
    id: string | number,
    payload: { assignedListId?: string | number; routing?: { mode: RoutingMode; listId?: string | number }; keyword?: string; matchType?: 'exact' | 'phrase' },
  ) => {
    setActionLoading((prev) => new Set(prev).add(id))
    try {
      const res = await fetch(`/api/match-type-violations/${id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error(await res.text())
      setCandidates((prev) => prev.filter((candidate) => candidate.id !== id))
      setSelected((prev) => { const s = new Set(prev); s.delete(id); return s })
      setTotalDocs((prev) => Math.max(0, prev - 1))
      void fetchCandidates({ silent: true })
    } catch (e: any) {
      alert(`Error: ${e.message}`)
    } finally {
      setActionLoading((prev) => { const s = new Set(prev); s.delete(id); return s })
    }
  }

  const handleReject = async (id: string | number) => {
    if (!confirm('Reject this violation?')) return
    setActionLoading((prev) => new Set(prev).add(id))
    try {
      const res = await fetch(`/api/match-type-violations/${id}/reject`, { method: 'POST' })
      if (!res.ok) throw new Error(await res.text())
      setCandidates((prev) => prev.filter((candidate) => candidate.id !== id))
      setSelected((prev) => { const s = new Set(prev); s.delete(id); return s })
      setTotalDocs((prev) => Math.max(0, prev - 1))
      void fetchCandidates({ silent: true })
    } catch (e: any) {
      alert(`Error: ${e.message}`)
    } finally {
      setActionLoading((prev) => { const s = new Set(prev); s.delete(id); return s })
    }
  }

  // Core approve used by the toolbar, ad-group shortcut, and the research modal.
  // Takes explicit ids so callers can approve a subset without depending on the
  // global selection; only the actioned ids are removed and deselected, so
  // other ad groups and selections stay intact.
  const approveCandidates = async (
    approveIds: (string | number)[],
    routing: { mode: RoutingMode; listId?: string | number },
  ) => {
    const ids = approveIds
    if (ids.length === 0) return
    const idSet = new Set(ids)
    // Send each selected row's inline-edited negative so bulk approve honours
    // per-row keyword/match-type changes rather than only the stored default.
    const overrides: Record<string, NegativeEdit> = {}
    for (const c of candidates) {
      if (!idSet.has(c.id)) continue
      overrides[String(c.id)] = negativeFor(c)
    }
    setBulkLoading(true)
    setKeywordActionStatus({
      kind: 'loading',
      title: `Approving ${ids.length} negative keyword${ids.length !== 1 ? 's' : ''}…`,
      lines: [routing.mode === 'auto'
        ? 'Adding each selected term to its source ad-group negative keyword list, creating lists where needed.'
        : 'Adding selected terms to the chosen negative keyword list.'],
    })
    try {
      const res = await fetch('/api/match-type-violations/bulk-approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidateIds: ids, routing, overrides }),
      })
      const raw = await res.text()
      const data = raw ? (() => { try { return JSON.parse(raw) } catch { return null } })() : null
      if (!res.ok) throw new Error(data?.error ?? raw)
      const listLines = Array.isArray(data?.listSummaries)
        ? data.listSummaries.slice(0, 8).flatMap((summary: any) => {
            const keywords = Array.isArray(summary.keywords)
              ? summary.keywords.slice(0, 6).map((kw: any) => `[${kw.keyword}] ${kw.matchType || 'exact'}`).join(', ')
              : ''
            return [
              `${summary.listName || summary.listId}: ${summary.added ?? 0} negative${Number(summary.added ?? 0) !== 1 ? 's' : ''} saved`,
              ...(keywords ? [`Keywords: ${keywords}${Array.isArray(summary.keywords) && summary.keywords.length > 6 ? ', …' : ''}`] : []),
            ]
          })
        : []
      setShowNklPicker(false)
      setCandidates((prev) => prev.filter((candidate) => !idSet.has(candidate.id)))
      setSelected((prev) => { const s = new Set(prev); ids.forEach((id) => s.delete(id)); return s })
      setTotalDocs((prev) => Math.max(0, prev - ids.length))
      setKeywordActionStatus({
        kind: 'success',
        title: `Approved ${data?.approved ?? ids.length} negative keyword${Number(data?.approved ?? ids.length) !== 1 ? 's' : ''}`,
        lines: [
          routing.mode === 'auto'
            ? `Saved across ${Array.isArray(data?.listSummaries) ? data.listSummaries.length : 0} ad-group negative keyword list${Array.isArray(data?.listSummaries) && data.listSummaries.length === 1 ? '' : 's'}; ${data?.createdLists ?? 0} list${Number(data?.createdLists ?? 0) !== 1 ? 's' : ''} created.`
            : 'Saved to the selected negative keyword list.',
          ...listLines,
        ],
      })
      void fetchCandidates({ silent: true })
    } catch (e: any) {
      setKeywordActionStatus({ kind: 'error', title: 'Negative keyword approval failed', lines: [cleanActionError(e.message)] })
    } finally {
      setBulkLoading(false)
    }
  }

  const handleBulkApprove = (routing: { mode: RoutingMode; listId?: string | number }) =>
    approveCandidates(Array.from(selected), routing)

  const openBulkPicker = async () => {
    await fetchNklLists()
    setShowNklPicker(true)
  }

  // Dismiss the selected pending rows: marks them rejected so the detector keeps
  // refreshing stats but never re-surfaces them as pending. Lets the team approve
  // the keepers, then dismiss the reviewed leftovers so they don't reappear.
  const downloadSelectedKeywordJson = () => {
    if (pendingSelected.length === 0) return
    const rows = pendingSelected.map((candidate) => ({
      client: typeof candidate.client === 'object' ? candidate.client?.name ?? candidate.client?.id : candidate.client,
      sourceCampaignName: candidate.campaignName,
      sourceAdGroupName: candidate.adGroupName,
      searchTerm: candidate.searchTerm,
      triggeringKeyword: candidate.triggeringKeyword,
      sourceMatchType: candidate.matchType,
      violationType: candidate.violationType,
      recommendedUpload: {
        keywordText: candidate.searchTerm,
        matchType: 'EXACT',
      },
    }))
    const payload = {
      prompt: 'These keywords came through phrase/exact match variants and should be added as positive exact match keywords. Put them into the exact match campaign or the same ad group, depending on what is requested for the account. Use the source campaign/ad group, search term, triggering keyword, source match type, and violation type to decide the right upload target.',
      count: rows.length,
      rows,
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `match-type-keyword-opportunities-${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  // Core dismiss (reject) used by the toolbar and the research modal. Only the
  // actioned ids are removed and deselected so the ad group stays until its own
  // terms are all handled.
  const dismissCandidates = async (dismissIds: (string | number)[]) => {
    const ids = dismissIds
    if (ids.length === 0) return
    if (!confirm(`Dismiss ${ids.length} reviewed term${ids.length !== 1 ? 's' : ''}? They won't show up as pending again.`)) return
    const idSet = new Set(ids)
    setBulkLoading(true)
    try {
      const res = await fetch('/api/match-type-violations/bulk-reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidateIds: ids }),
      })
      if (!res.ok) throw new Error(await res.text())
      setCandidates((prev) => prev.filter((candidate) => !idSet.has(candidate.id)))
      setSelected((prev) => { const s = new Set(prev); ids.forEach((id) => s.delete(id)); return s })
      setTotalDocs((prev) => Math.max(0, prev - ids.length))
      void fetchCandidates({ silent: true })
    } catch (e: any) {
      alert(`Error: ${e.message}`)
    } finally {
      setBulkLoading(false)
    }
  }

  const handleBulkDismiss = () => dismissCandidates(pendingSelected.map((c) => c.id))

  const openKeywordTargetPicker = async () => {
    if (pendingSelected.length === 0) return
    setKeywordActionStatus(null)
    await fetchAdGroups()
    setShowKeywordTargetPicker(true)
  }

  const handleBulkAddOpportunities = async (target: { mode: KeywordTargetMode; adGroupIds?: string[] }) => {
    const ids = pendingSelected.map((candidate) => candidate.id)
    if (ids.length === 0) return
    if (target.mode === 'adGroup' && (!Array.isArray(target.adGroupIds) || target.adGroupIds.length === 0)) {
      setKeywordActionStatus({ kind: 'error', title: 'Choose target ad group(s)', lines: ['Select at least one ad group before adding exact keywords.'] })
      return
    }
    setBulkLoading(true)
    setKeywordActionStatus({
      kind: 'loading',
      title: `Adding ${ids.length} exact keyword${ids.length !== 1 ? 's' : ''} to Google Ads…`,
      lines: ['Creating enabled EXACT keywords, matching URLs/CPC/labels, then adding source exact negatives where needed.'],
    })
    try {
      const body = target.mode === 'adGroup'
        ? { candidateIds: ids, adGroupIds: target.adGroupIds, negateSource: true }
        : { candidateIds: ids, autoExactFromCandidates: true, negateSource: true }
      const res = await fetch('/api/match-type-violations/add-exact-bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        const message = data?.error ?? 'Failed to add exact keywords'
        throw new Error(message)
      }
      const actionedIds = Array.isArray(data.results)
        ? data.results.filter((result: any) => result.outcome && result.outcome !== 'error').map((result: any) => result.id)
        : ids
      const targetLines = Array.isArray(data.targetSummaries)
        ? data.targetSummaries.slice(0, 5).flatMap((target: any) => {
            const campaign = target.campaignName ? `${target.campaignName} / ` : ''
            const addedKeywords = Array.isArray(target.addedKeywords)
              ? target.addedKeywords.map((item: any) => `[${item.keyword}] ${item.matchType || 'EXACT'}`).join(', ')
              : ''
            const skippedKeywords = Array.isArray(target.skippedKeywords)
              ? target.skippedKeywords.map((item: any) => `[${item.keyword}] ${item.matchType || 'EXACT'}`).join(', ')
              : ''
            return [
              `Target: ${campaign}${target.adGroupName || target.adGroupId} — ${target.added ?? 0} added, ${target.alreadyExists ?? 0} skipped, ${target.selected ?? 0} selected`,
              ...(addedKeywords ? [`Added keywords: ${addedKeywords}`] : []),
              ...(skippedKeywords ? [`Skipped existing keywords: ${skippedKeywords}`] : []),
            ]
          })
        : []
      const warningLines = [
        ...(Array.isArray(data.groupErrors) ? data.groupErrors.map((err: any) => `Ad-group error: ${err.adGroupName || 'unknown'} — ${cleanActionError(err.error)}`) : []),
        ...(Array.isArray(data.negateErrors) ? data.negateErrors.map((err: any) => `Negative warning: ${cleanActionError(err)}`) : []),
      ]
      setCandidates((prev) => prev.filter((candidate) => !actionedIds.includes(candidate.id)))
      setShowKeywordTargetPicker(false)
      setSelected(new Set())
      setTotalDocs((prev) => Math.max(0, prev - actionedIds.length))
      setKeywordActionStatus({
        kind: warningLines.length ? 'error' : 'success',
        title: `Added ${data.added ?? 0} exact keyword${Number(data.added ?? 0) !== 1 ? 's' : ''}`,
        lines: [
          `${data.actioned ?? actionedIds.length} selected term${Number(data.actioned ?? actionedIds.length) !== 1 ? 's' : ''} processed; ${data.alreadyExists ?? 0} skipped because they already existed.`,
          ...targetLines,
          `${data.negated ?? 0} source exact negative${Number(data.negated ?? 0) !== 1 ? 's' : ''} added to original ad-group negative lists; ${data.skippedSourceNegatives ?? 0} skipped because the exact keyword stayed in the same source ad group.`,
          ...warningLines,
        ],
      })
      void fetchCandidates({ silent: true })
    } catch (e: any) {
      setKeywordActionStatus({
        kind: 'error',
        title: 'Exact keyword upload failed',
        lines: [cleanActionError(e.message)],
      })
    } finally {
      setBulkLoading(false)
    }
  }

  const visibleCandidates = useMemo(
    () => filterConfidence
      ? candidates.filter((candidate) => confidenceFor(candidate, synonymRules, allowListTerms).key === filterConfidence)
      : candidates,
    [candidates, filterConfidence, synonymRules, allowListTerms],
  )

  const toggleAll = (checked: boolean) => {
    if (checked) {
      const pending = visibleCandidates.filter((c) => c.status === 'pending')
      setSelected(new Set(pending.map((c) => c.id)))
      setEdits((prev) => {
        const next = new Map(prev)
        for (const candidate of pending) {
          const current = next.get(candidate.id) ?? negativeFor(candidate)
          next.set(candidate.id, { ...current, matchType: 'exact' })
        }
        return next
      })
    } else {
      setSelected(new Set())
    }
  }

  const toggleOne = (id: string | number) => {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const toggleGroupSelection = (group: CandidateGroup) => {
    const pendingIds = group.candidates
      .filter((candidate) => candidate.status === 'pending')
      .map((candidate) => candidate.id)
    if (pendingIds.length === 0) return
    setSelected((prev) => {
      const next = new Set(prev)
      const allSelected = pendingIds.every((id) => next.has(id))
      for (const id of pendingIds) {
        if (allSelected) next.delete(id)
        else next.add(id)
      }
      return next
    })
  }

  const pendingSelected = visibleCandidates.filter(
    (c) => selected.has(c.id) && c.status === 'pending',
  )

  const groupedCandidates = useMemo(() => groupCandidatesByAdGroup(visibleCandidates), [visibleCandidates])
  const tableColumnCount = 4 + HIDEABLE_COLUMNS.filter((column) => isVisible(column.key)).length

  // Map each researched search term (lowercased) to its still-pending candidate,
  // so the research modal can approve/dismiss terms directly. Recomputed from the
  // live group, so once a term is actioned its candidate drops out and the modal
  // shows it as done.
  const researchTermCandidates = useMemo(() => {
    const map = new Map<string, Candidate>()
    if (!researchGroup) return map
    const group = groupedCandidates.find((g) => g.key === researchGroup.key)
    for (const candidate of group?.candidates ?? []) {
      if (candidate.status === 'pending') map.set(candidate.searchTerm.toLowerCase(), candidate)
    }
    return map
  }, [researchGroup, groupedCandidates])

  // Batch-research a group's search terms: if some rows in the group are
  // selected, only research those; otherwise research every term in the group.
  const openGroupResearch = async (group: CandidateGroup) => {
    const selectedInGroup = group.candidates.filter((c) => selected.has(c.id))
    const source = selectedInGroup.length > 0 ? selectedInGroup : group.candidates
    const terms = source.map((c) => c.searchTerm).filter(Boolean)
    if (terms.length === 0) return
    setResearchGroup({ key: group.key, adGroupName: group.adGroupName })
    setResearchResults(null)
    setResearchError(null)
    setResearchGrounded(true)
    setResearchLoading(true)
    try {
      const res = await fetch('/api/match-type-violations/research-terms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ terms }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`)
      setResearchResults(Array.isArray(data?.results) ? data.results : [])
      setResearchGrounded(data?.grounded !== false)
    } catch (e: any) {
      setResearchError(e?.message || 'Failed to research search terms')
    } finally {
      setResearchLoading(false)
    }
  }

  // Modal actions: approve terms as ad-group negatives, or dismiss them, using
  // the shared cores. The ad group stays open until all its terms are handled.
  const approveResearchTerms = (ids: (string | number)[]) =>
    approveCandidates(ids, { mode: 'auto' })
  const dismissResearchTerms = (ids: (string | number)[]) => dismissCandidates(ids)

  const openGroupPicker = async (group: CandidateGroup) => {
    const pendingIds = group.candidates
      .filter((candidate) => candidate.status === 'pending')
      .map((candidate) => candidate.id)
    if (pendingIds.length === 0) return
    const selectedInGroup = pendingIds.filter((id) => selected.has(id))
    // If the reviewer selected the ad group then unchecked relevant terms, only
    // approve the still-checked rows. If nothing is checked, keep the old shortcut
    // behaviour and approve the whole ad group.
    setSelected(new Set(selectedInGroup.length > 0 ? selectedInGroup : pendingIds))
    await fetchNklLists()
    setShowNklPicker(true)
  }

  return (
    <div className="mtv-review-root" style={{ padding: '0 15px 32px' }}>
      {/* Header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 0.5fr) minmax(720px, 1.5fr)', gap: 16, alignItems: 'start', marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>Match Type Violations</h2>
          <p style={{ margin: '4px 0 12px', color: '#6b7280', fontSize: 13 }}>
            Review violations where Google served non-conforming search terms
          </p>

        </div>

        {/* How it works info box — collapsible, collapsed by default */}
        <div style={{
          padding: '12px 16px', background: '#eff6ff',
          border: '1px solid #bfdbfe', borderRadius: 8, fontSize: 13, color: '#1e40af',
        }}>
          <button
            onClick={() => setHelpOpen((o) => !o)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left',
              background: 'transparent', border: 'none', padding: 0, cursor: 'pointer',
              color: '#1e40af', fontSize: 13,
            }}
            aria-expanded={helpOpen}
          >
            <span style={{ transform: helpOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s', fontSize: 11 }}>▶</span>
            <span><strong>How it works —</strong> runs daily (~17:00 UTC) · {syncRunCount !== null ? (
              <span title="Number of times the monitor has run">{syncRunCount} sync{syncRunCount !== 1 ? 's' : ''} to date</span>
            ) : '…'} · {totalDocs} candidate{totalDocs !== 1 ? 's' : ''} total</span>
          </button>
          {helpOpen && (
          <div style={{ marginTop: 12, display: 'grid', gap: 12, lineHeight: 1.55 }}>
            <div style={{ padding: 10, borderRadius: 6, background: 'rgba(255,255,255,0.55)' }}>
              Google Ads can now make <strong>Exact</strong> and <strong>Phrase</strong> keywords behave annoyingly close to broad match. This page catches those leaks before they waste more spend.
            </div>
            <div>
              <strong>How this is different from Monthly negative KWs</strong>
              <ul style={{ margin: '6px 0 0 18px', padding: 0 }}>
                <li><strong>Monthly negative KWs</strong> = broad monthly search-term cleanup.</li>
                <li><strong>Match Type Violations</strong> = only search terms where an Exact or Phrase keyword matched too loosely.</li>
              </ul>
            </div>
            <div>
              <strong>What gets shown here?</strong>
              <ul style={{ margin: '6px 0 0 18px', padding: 0 }}>
                <li><strong>Exact close variant:</strong> an Exact keyword triggered a meaningfully different search term. Example: “ppc services” triggered “pay per click management”.</li>
                <li><strong>Phrase missing word:</strong> a Phrase keyword triggered a search term missing an important word. Example: “running shoes” triggered “buy shoes online”.</li>
              </ul>
            </div>
            <div>
              <strong>What gets ignored?</strong> Normal close variants like plurals, typos, accents, stopwords, and word order changes. We only surface genuine intent shifts.
            </div>
            <div>
              <strong>What should you do?</strong> If it is bad traffic, approve it as a negative. If it is a good opportunity, add or export it as an <strong>Exact</strong> keyword. If it is not useful, dismiss it.
            </div>
            <div>
              <strong>Other rules:</strong> only terms with ≥2 impressions in the past 7 days are checked. Per client, Exact and Phrase monitoring can be enabled separately, and the client allow-list can limit this to specific campaigns or ad groups.
            </div>
          </div>
          )}
        </div>
      </div>

      {/* Bulk actions + filters: fixed when pinned, with a placeholder so it does not jump. */}
      <div ref={toolbarAnchorRef} style={{ minHeight: toolbarPinned ? toolbarBox.height : undefined, marginBottom: 16 }}>
      <div ref={toolbarRef} className="mtv-sticky-toolbar" style={{
        position: toolbarPinned ? 'fixed' : 'relative',
        top: toolbarPinned ? 56 : undefined,
        left: toolbarPinned ? toolbarBox.left : undefined,
        right: toolbarPinned ? toolbarBox.right : undefined,
        zIndex: 1000,
        boxSizing: 'border-box',
        display: 'flex', gap: 12, marginBottom: 0, flexWrap: 'wrap', alignItems: 'center',
        padding: '12px 16px', background: 'rgba(249,250,251,0.98)', backdropFilter: 'blur(6px)',
        borderRadius: 8, border: '1px solid #e5e7eb', boxShadow: '0 8px 24px rgba(15,23,42,0.12)',
      }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {pendingSelected.length > 0 ? (
            <>
              <button
                onClick={openKeywordTargetPicker}
                disabled={bulkLoading}
                style={{ ...btnStyle('primary'), display: 'flex', alignItems: 'center', gap: 6, background: bulkLoading ? '#d1d5db' : '#f59e0b' }}
                title="Add selected rows as enabled EXACT keywords in the matching exact ad group/campaign"
              >
                Add {pendingSelected.length} as Exact Keyword{pendingSelected.length !== 1 ? 's' : ''}
              </button>
              <button
                onClick={downloadSelectedKeywordJson}
                disabled={bulkLoading}
                style={{ ...btnStyle('ghost'), display: 'flex', alignItems: 'center', gap: 6 }}
                title="Download selected review/opportunity rows as a JSON brief for an agent to upload as positive keywords"
              >
                Download Keyword JSON
              </button>
              <button
                onClick={handleBulkDismiss}
                disabled={bulkLoading}
                style={{ ...btnStyle('ghost'), display: 'flex', alignItems: 'center', gap: 6 }}
                title="Mark the selected reviewed terms as dismissed so they no longer appear as pending"
              >
                Dismiss {pendingSelected.length} Selected
              </button>
              <button
                onClick={openBulkPicker}
                disabled={bulkLoading}
                style={{ ...btnStyle('primary'), display: 'flex', alignItems: 'center', gap: 6 }}
              >
                Approve {pendingSelected.length} Selected
              </button>
            </>
          ) : (
            <span style={{ color: '#64748b', fontSize: 13 }}>Select rows to bulk action</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginLeft: 'auto' }}>
          {!initialClientId && (
            <select value={filterClient} onChange={(e) => setFilterClient(e.target.value)}
              style={filterStyle()}>
              <option value="">All Clients</option>
            </select>
          )}
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
            style={filterStyle()}>
            <option value="">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
          <select value={filterMatchType} onChange={(e) => setFilterMatchType(e.target.value)}
            style={filterStyle()}>
            <option value="">All Match Types</option>
            <option value="EXACT">Exact</option>
            <option value="PHRASE">Phrase</option>
          </select>
          <select value={filterViolationType} onChange={(e) => setFilterViolationType(e.target.value)}
            style={filterStyle()}>
            <option value="">All Violation Types</option>
            <option value="exact_close_variant">Exact Close Variant</option>
            <option value="phrase_missing_word">Phrase Missing Word</option>
          </select>
          <select value={filterConfidence} onChange={(e) => setFilterConfidence(e.target.value as ConfidenceFilter)}
            style={filterStyle()} title="7-day confidence score for faster review">
            <option value="">All Safety Gates</option>
            <option value="safe">Safe to Negate</option>
            <option value="review">Review</option>
            <option value="opportunity">Keyword Opportunity</option>
          </select>
          {((!initialClientId && filterClient) || filterStatus !== 'pending' || filterMatchType || filterViolationType || filterConfidence) && (
            <button onClick={() => {
              if (!initialClientId) setFilterClient('')
              setFilterStatus('pending'); setFilterMatchType('')
              setFilterViolationType(''); setFilterConfidence('')
            }} style={{ ...btnStyle('ghost'), fontSize: 12 }}>
              Clear Filters
            </button>
          )}
          <div style={{ position: 'relative' }}>
            <button onClick={() => setShowColMenu((o) => !o)} style={{ ...btnStyle('ghost'), fontSize: 12 }}>
              Columns ▾
            </button>
          {showColMenu && (
            <>
              <div onClick={() => setShowColMenu(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
              <div style={{
                position: 'absolute', right: 0, top: '100%', marginTop: 4, zIndex: 50,
                background: 'white', border: '1px solid #e5e7eb', borderRadius: 8,
                boxShadow: '0 8px 24px rgba(0,0,0,0.12)', padding: 8, width: 200,
              }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em', padding: '2px 6px 6px' }}>
                  Show columns
                </div>
                {HIDEABLE_COLUMNS.map((col) => (
                  <label key={col.key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 6px', cursor: 'pointer', fontSize: 13, color: '#374151' }}>
                    <input type="checkbox" checked={isVisible(col.key)} onChange={() => toggleCol(col.key)} />
                    {col.label}
                  </label>
                ))}
              </div>
            </>
          )}
          </div>
        </div>
      </div>
      </div>

      {keywordActionStatus && (
        <div style={{
          padding: '12px 16px',
          background: keywordActionStatus.kind === 'success' ? '#f0fdf4' : keywordActionStatus.kind === 'loading' ? '#eff6ff' : '#fff7ed',
          border: `1px solid ${keywordActionStatus.kind === 'success' ? '#bbf7d0' : keywordActionStatus.kind === 'loading' ? '#bfdbfe' : '#fed7aa'}`,
          borderRadius: 8,
          marginBottom: 16,
          color: keywordActionStatus.kind === 'success' ? '#166534' : keywordActionStatus.kind === 'loading' ? '#1d4ed8' : '#9a3412',
          fontSize: 13,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
            <strong>{keywordActionStatus.title}</strong>
            {keywordActionStatus.kind !== 'loading' && (
              <button type="button" onClick={() => setKeywordActionStatus(null)} style={{ ...btnStyle('ghost'), padding: '2px 8px', fontSize: 11 }}>Dismiss</button>
            )}
          </div>
          <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
            {keywordActionStatus.lines.map((line, index) => <li key={`${index}-${line}`}>{line}</li>)}
          </ul>
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{ padding: '12px 16px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, marginBottom: 16, color: '#dc2626', fontSize: 13 }}>
          {error}
        </div>
      )}
      {synonymError && (
        <div style={{ padding: '10px 14px', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 6, marginBottom: 16, color: '#9a3412', fontSize: 13 }}>
          Synonym rules failed to load; default confidence rules are still active. {synonymError}
        </div>
      )}
      {allowListError && (
        <div style={{ padding: '10px 14px', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 6, marginBottom: 16, color: '#9a3412', fontSize: 13 }}>
          Allow-list terms failed to load; default acronym allow-list is still active. {allowListError}
        </div>
      )}
      {synonymRulesLoading && (
        <div style={{ marginBottom: 12, color: '#64748b', fontSize: 12 }}>Loading synonym rules…</div>
      )}

      {/* Table */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#6b7280' }}>Loading…</div>
      ) : candidates.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#6b7280', border: '1px dashed #d1d5db', borderRadius: 8 }}>
          No violations found.
        </div>
      ) : visibleCandidates.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#64748b', border: '1px dashed #d1d5db', borderRadius: 8 }}>
          No violations match the current confidence filter.
        </div>
      ) : (
        <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: 8 }}>
          <table style={{ width: '100%', minWidth: filterStatus === 'rejected' ? 1900 : 1600, borderCollapse: 'collapse', fontSize: 13, background: 'white' }}>
            <thead>
              <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                <th style={thStyle()}>
                  <input
                    type="checkbox"
                    checked={pendingSelected.length > 0 && pendingSelected.length === visibleCandidates.filter(c => c.status === 'pending').length}
                    onChange={(e) => toggleAll(e.target.checked)}
                  />
                </th>
                <th style={thStyle()}>Search Term</th>
                {isVisible('triggeringKeyword') && <th style={thStyle()}>Triggering Keyword</th>}
                {isVisible('matchType') && <th style={thStyle()}>Match Type</th>}
                {isVisible('violation') && <th style={thStyle()}>Violation</th>}
                {isVisible('confidence') && <th style={thStyle()}>Confidence</th>}
                <th style={thStyle()}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    Bulk Select
                    <select
                      value=""
                      onChange={(e) => {
                        if (e.target.value) setAllMatchTypes(e.target.value as NegMatchType)
                      }}
                      title="Set match type for selected pending rows; if none are selected, set all pending rows"
                      style={{
                        padding: '2px 4px', border: '1px solid #d1d5db', borderRadius: 4,
                        fontSize: 10, background: 'white', color: '#374151',
                        textTransform: 'none', fontWeight: 400, cursor: 'pointer',
                      }}
                    >
                      <option value="">Match type</option>
                      <option value="phrase">Selected Phrase</option>
                      <option value="exact">Selected Exact</option>
                    </select>
                  </div>
                </th>
                {isVisible('impressions') && <th style={thStyle()} title="Impressions">Impr</th>}
                {isVisible('clicks') && <th style={thStyle()}>Clicks</th>}
                {isVisible('campaign') && <th style={thStyle()}>Campaign</th>}
                {isVisible('route') && <th style={thStyle()}>Route</th>}
                {isVisible('status') && <th style={thStyle()}>Status</th>}
                {isVisible('lastSeen') && <th style={thStyle()}>Last Seen</th>}
                <th style={thStyle()}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {groupedCandidates.map((group) => {
                const groupPendingIds = group.candidates.filter((candidate) => candidate.status === 'pending').map((candidate) => candidate.id)
                const groupSelectedCount = groupPendingIds.filter((id) => selected.has(id)).length
                const groupAllSelected = groupPendingIds.length > 0 && groupSelectedCount === groupPendingIds.length
                return (
                <Fragment key={group.key}>
                  <tr style={{ background: '#f8fafc', borderTop: '1px solid #e5e7eb', borderBottom: '1px solid #e5e7eb' }}>
                    <td colSpan={tableColumnCount} style={{ padding: '10px 12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <strong style={{ color: '#111827', fontSize: 13 }}>{group.adGroupName}</strong>
                            <span style={badgeStyle('#e0f2fe', '#075985')}>{group.pendingCount} pending</span>
                            <span style={{ color: '#6b7280', fontSize: 12 }}>{group.candidates.length} total · {formatNumber(group.impressions)} impr · {formatNumber(group.clicks)} clicks</span>
                          </div>
                          <div style={{ color: '#6b7280', fontSize: 12, marginTop: 3 }}>Campaign: {group.campaignName} · Route: auto-create/use this ad group’s negative list</div>
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button
                            onClick={() => void openGroupResearch(group)}
                            disabled={researchLoading}
                            title={groupSelectedCount > 0 ? `Research the ${groupSelectedCount} selected search term(s) in this ad group` : 'Research every search term in this ad group with a one-sentence Google summary'}
                            style={{ ...btnStyle('ghost'), fontSize: 11, padding: '5px 10px' }}
                          >
                            {groupSelectedCount > 0 ? `Research ${groupSelectedCount} selected` : 'Research terms'}
                          </button>
                          {group.pendingCount > 0 && (
                            <>
                              <button
                                onClick={() => toggleGroupSelection(group)}
                                style={{ ...btnStyle('ghost'), fontSize: 11, padding: '5px 10px' }}
                              >
                                {groupAllSelected ? 'Unselect ad group' : 'Select ad group'}
                              </button>
                              <button
                                onClick={() => void openGroupPicker(group)}
                                disabled={bulkLoading}
                                style={{ ...btnStyle('primary', bulkLoading), fontSize: 11, padding: '5px 10px' }}
                              >
                                {groupSelectedCount > 0 && !groupAllSelected ? `Approve ${groupSelectedCount} selected` : 'Approve ad group'}
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                  {group.candidates.map((c) => (
                    <tr key={String(c.id)} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td style={tdStyle()}>
                        {c.status === 'pending' && (
                          <input
                            type="checkbox"
                            checked={selected.has(c.id)}
                            onChange={() => toggleOne(c.id)}
                          />
                        )}
                      </td>
                      <td style={tdStyle()}>
                        <a
                          href={googleSearchUrl(c.searchTerm)}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={`Search Google for “${c.searchTerm}”`}
                          style={{ minWidth: 280, maxWidth: 460, display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.35, color: '#1d4ed8', textDecoration: 'none' }}
                        >
                          {c.searchTerm}
                        </a>
                      </td>
                      {isVisible('triggeringKeyword') && (
                        <td style={tdStyle()}>
                          <span title={c.triggeringKeyword} style={{ minWidth: 220, maxWidth: 360, display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.35 }}>
                            {c.triggeringKeyword}
                          </span>
                        </td>
                      )}
                      {isVisible('matchType') && (
                        <td style={tdStyle()}>
                          <span style={{ ...badgeStyle('#e0e7ff', '#3730a3'), textTransform: 'uppercase', fontSize: 11 }}>
                            {MATCH_TYPE_LABELS[c.matchType] ?? c.matchType}
                          </span>
                        </td>
                      )}
                      {isVisible('violation') && (
                        <td style={tdStyle()}>
                          <span style={{ ...badgeStyle(
                            violationColor(c.violationType) + '20',
                            violationColor(c.violationType),
                          ), fontSize: 11, whiteSpace: 'nowrap' }}>
                            {VIOLATION_LABELS[c.violationType] ?? c.violationType}
                          </span>
                          {c.violationType === 'phrase_missing_word' && (() => {
                            const mw = missingWords(c.searchTerm, c.triggeringKeyword)
                            return mw.length > 0 ? (
                              <div style={{ marginTop: 2, fontSize: 11, color: '#92400e', lineHeight: 1.3 }}
                                title="Keyword words absent from the search term">
                                missing: {mw.join(', ')}
                              </div>
                            ) : null
                          })()}
                          {c.violationType === 'exact_close_variant' && c.nearestKeyword && (
                            <div style={{ marginTop: 2, fontSize: 11, color: '#6b7280', lineHeight: 1.3 }}
                              title="Owned exact keyword this term drifted from">
                              nearest: {c.nearestKeyword}{c.offendingWords ? ` · extra: ${c.offendingWords}` : ''}
                            </div>
                          )}
                        </td>
                      )}
                      {isVisible('confidence') && (() => {
                        const confidence = confidenceFor(c, synonymRules, allowListTerms)
                        return (
                          <td style={tdStyle()}>
                            <span title={confidence.reason} style={{ ...badgeStyle(confidence.bg, confidence.color), fontSize: 11, whiteSpace: 'nowrap' }}>
                              {confidence.label}
                            </span>
                          </td>
                        )
                      })()}
                      <td style={tdStyle()}>
                        {c.status === 'pending' ? (() => {
                          const neg = negativeFor(c)
                          return (
                            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                              <input
                                value={neg.keyword}
                                onChange={(e) => setNegative(c.id, { keyword: e.target.value }, neg)}
                                title="Edit the negative keyword before approving"
                                style={{ width: 150, padding: '4px 6px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 12 }}
                              />
                              <select
                                value={neg.matchType}
                                onChange={(e) => setNegative(c.id, { matchType: e.target.value as NegMatchType }, neg)}
                                style={{ padding: '4px 4px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 12 }}
                              >
                                <option value="phrase">Phrase</option>
                                <option value="exact">Exact</option>
                              </select>
                            </div>
                          )
                        })() : (
                          <span style={{ fontSize: 12, color: '#6b7280' }}>—</span>
                        )}
                      </td>
                      {isVisible('impressions') && <td style={{ ...tdStyle(), textAlign: 'right' }}>{formatNumber(c.impressions)}</td>}
                      {isVisible('clicks') && <td style={{ ...tdStyle(), textAlign: 'right' }}>{formatNumber(c.clicks)}</td>}
                      {isVisible('campaign') && (
                        <td style={tdStyle()}>
                          <span title={c.campaignName} style={{ minWidth: 260, maxWidth: 380, display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.35 }}>
                            {c.campaignName || '—'}
                          </span>
                        </td>
                      )}
                      {isVisible('route') && (
                        <td style={tdStyle()}>
                          <span title={`Auto-match or create an ad-group negative list for ${c.adGroupName || c.campaignName || 'this row'}`} style={{ maxWidth: 170, display: 'block', color: '#075985', fontSize: 12, lineHeight: 1.35 }}>
                            Ad-group NKL: {c.adGroupName || 'auto'}
                          </span>
                        </td>
                      )}
                      {isVisible('status') && (
                        <td style={tdStyle()}>
                          <span style={{ ...badgeStyle(
                            statusColor(c.status) + '20',
                            statusColor(c.status),
                          ), fontSize: 11 }}>
                            {c.status.charAt(0).toUpperCase() + c.status.slice(1)}
                          </span>
                        </td>
                      )}
                      {isVisible('lastSeen') && (
                        <td style={tdStyle()}>
                          <span title={new Date(c.lastSeenAt).toLocaleString()} style={{ whiteSpace: 'nowrap' }}>
                            {timeAgo(c.lastSeenAt)}
                          </span>
                        </td>
                      )}
                      <td style={tdStyle()}>
                        {c.status === 'pending' && (
                          <div style={{ display: 'flex', gap: 6 }}>
                            <ApprovePopover
                              candidate={c}
                              negative={negativeFor(c)}
                              onApprove={handleApprove}
                              loading={actionLoading.has(c.id)}
                              clientId={filterClient ? String(filterClient) : undefined}
                            />
                            <button
                              onClick={() => {
                                setTeachCandidate(c)
                                setTeachError(null)
                              }}
                              disabled={actionLoading.has(c.id)}
                              style={{ ...btnStyle('ghost'), fontSize: 11, padding: '4px 8px' }}
                            >
                              Teach synonym
                            </button>
                            <button
                              onClick={() => handleReject(c.id)}
                              disabled={actionLoading.has(c.id)}
                              style={{ ...btnStyle('ghost'), fontSize: 11, padding: '4px 8px' }}
                            >
                              Reject
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Row count */}
      {!loading && candidates.length > 0 && (
        <div style={{ marginTop: 12, fontSize: 13, color: '#6b7280' }}>
          Showing all {totalDocs} candidate{totalDocs !== 1 ? 's' : ''}
        </div>
      )}

      {/* NKL Picker Modal */}
      {showNklPicker && (
        <NklPickerModal
          lists={nklLists}
          pendingCount={pendingSelected.length}
          loading={bulkLoading}
          onConfirm={handleBulkApprove}
          onCancel={() => setShowNklPicker(false)}
        />
      )}
      {showKeywordTargetPicker && (
        <KeywordTargetPickerModal
          adGroups={adGroupOptions}
          error={adGroupError}
          pendingCount={pendingSelected.length}
          onConfirm={handleBulkAddOpportunities}
          onCancel={() => setShowKeywordTargetPicker(false)}
        />
      )}
      {researchGroup && (
        <TermResearchModal
          adGroupName={researchGroup.adGroupName}
          loading={researchLoading}
          error={researchError}
          results={researchResults}
          grounded={researchGrounded}
          termCandidates={researchTermCandidates}
          busy={bulkLoading}
          onApproveTerms={approveResearchTerms}
          onDismissTerms={dismissResearchTerms}
          onClose={() => setResearchGroup(null)}
        />
      )}
      {teachCandidate && (
        <TeachSynonymModal
          candidate={teachCandidate}
          saving={teachSaving}
          error={teachError}
          onSave={saveSynonymRule}
          onCancel={() => {
            setTeachCandidate(null)
            setTeachError(null)
          }}
        />
      )}
    </div>
  )
}

// ─── Approve Popover ──────────────────────────────────────────────────────────

type ApprovePayload = {
  routing?: { mode: RoutingMode; listId?: string | number }
  keyword?: string
  matchType?: 'exact' | 'phrase'
}

function ApprovePopover({
  candidate,
  negative,
  onApprove,
  loading,
  clientId,
}: {
  candidate: Candidate
  negative: NegativeEdit
  onApprove: (id: string | number, payload: ApprovePayload) => Promise<void>
  loading: boolean
  clientId?: string
}) {
  const [open, setOpen] = useState(false)
  // Seed from the row's inline-edited negative so the two editors stay in sync.
  const [keyword, setKeyword] = useState(negative.keyword)
  const [matchType, setMatchType] = useState<'exact' | 'phrase'>(negative.matchType)
  useEffect(() => {
    setKeyword(negative.keyword)
    setMatchType(negative.matchType)
  }, [negative.keyword, negative.matchType])
  const [mode, setMode] = useState<RoutingMode>('auto')
  const [lists, setLists] = useState<NegativeKeywordList[]>([])
  const [listId, setListId] = useState<string | number | ''>('')
  const [fetching, setFetching] = useState(false)

  const ref = useCallback((node: HTMLDivElement | null) => {
    if (!node) return
    const handler = (e: MouseEvent) => {
      if (!node.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const fetchLists = async () => {
    setFetching(true)
    const params = new URLSearchParams({ limit: '100' })
    if (clientId) params.set('where[client][equals]', clientId)
    const res = await fetch(`/api/negative-keyword-lists?${params}`)
    if (res.ok) {
      const data = await res.json()
      setLists(data.docs ?? [])
    }
    setFetching(false)
  }

  const handleOpen = async () => {
    if (open) { setOpen(false); return }
    if (lists.length === 0) await fetchLists()
    setOpen(true)
  }

  const submit = async () => {
    const trimmed = keyword.trim()
    if (!trimmed) return
    const payload: ApprovePayload = { keyword: trimmed, matchType }
    if (mode === 'existing') {
      if (!listId) return
      payload.routing = { mode: 'existing', listId }
    } else {
      payload.routing = { mode: 'auto' }
    }
    setOpen(false)
    await onApprove(candidate.id, payload)
  }

  const adGroupLabel = candidate.adGroupName || candidate.campaignName || 'this ad group'

  return (
    <div ref={ref as any} style={{ position: 'relative' }}>
      <button
        onClick={handleOpen}
        disabled={loading}
        style={{ ...btnStyle('primary'), fontSize: 11, padding: '4px 8px', display: 'flex', alignItems: 'center', gap: 4 }}
      >
        {loading ? '…' : 'Approve'}
        <span style={{ fontSize: 10 }}>▾</span>
      </button>
      {open && (
        <div style={{
          position: 'absolute', right: 0, top: '100%', zIndex: 100,
          background: 'white', border: '1px solid #e5e7eb', borderRadius: 8,
          boxShadow: '0 8px 24px rgba(0,0,0,0.12)', width: 280, marginTop: 4,
          padding: 12, fontSize: 12, textAlign: 'left',
        }}>
          <label style={{ display: 'block', fontWeight: 600, color: '#374151', marginBottom: 4 }}>
            Negative keyword
          </label>
          <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              style={{ flex: 1, padding: '5px 8px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 12 }}
            />
            <select
              value={matchType}
              onChange={(e) => setMatchType(e.target.value as 'exact' | 'phrase')}
              style={{ padding: '5px 6px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 12 }}
            >
              <option value="phrase">Phrase</option>
              <option value="exact">Exact</option>
            </select>
          </div>

          <div style={{ fontWeight: 600, color: '#374151', marginBottom: 4 }}>Route to</div>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginBottom: 6, cursor: 'pointer' }}>
            <input type="radio" checked={mode === 'auto'} onChange={() => setMode('auto')} style={{ marginTop: 2 }} />
            <span>Ad-group list <span style={{ color: '#6b7280' }}>— auto-match or create for “{adGroupLabel}”</span></span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, cursor: 'pointer' }}>
            <input type="radio" checked={mode === 'existing'} onChange={() => setMode('existing')} />
            <span>Assign existing list</span>
          </label>
          {mode === 'existing' && (
            <select
              value={String(listId)}
              onChange={(e) => setListId(e.target.value)}
              style={{ width: '100%', padding: '5px 8px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 12, marginBottom: 8 }}
            >
              <option value="">{fetching ? 'Loading…' : '— Select a list —'}</option>
              {lists.map((l) => (
                <option key={String(l.id)} value={String(l.id)}>{l.name}</option>
              ))}
            </select>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 6 }}>
            <button onClick={() => setOpen(false)} style={{ ...btnStyle('ghost'), fontSize: 11, padding: '5px 10px' }}>Cancel</button>
            <button
              onClick={submit}
              disabled={!keyword.trim() || (mode === 'existing' && !listId)}
              style={{ ...btnStyle('primary', !keyword.trim() || (mode === 'existing' && !listId)), fontSize: 11, padding: '5px 10px' }}
            >
              Approve
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

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

function badgeStyle(bg: string, color: string): React.CSSProperties {
  return {
    display: 'inline-block', padding: '2px 8px', borderRadius: 9999,
    background: bg, color, fontWeight: 500,
  }
}

function filterStyle(): React.CSSProperties {
  return {
    padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db',
    fontSize: 13, background: 'white', color: '#374151',
  }
}
