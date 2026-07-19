'use client'

import { useDocumentInfo } from '@payloadcms/ui'
import { useCallback, useEffect, useMemo, useState } from 'react'
import './GoogleAdsAuditDeckReview.css'

type Slide = { id: string; title: string; required: boolean; hidden: boolean; assessment: string; completeness: string }
type CoverageRow = { datasetKey: string; rowCount: number; status: 'completed' | 'unavailable' | 'failed'; providers?: string[]; failureReasons?: string[] }
type Scorecard = { id: string; label: string; score: number | null; maximum: number; status: 'scored' | 'insufficient_evidence' }
type ReviewData = { businessName: string; published: boolean; generatedAt?: string; deck: { slides: Slide[] } | null; snapshot: { status: string; requestedAt: string; capturedAt?: string; periodStart: string; periodEnd: string; accountTimeZone: string; currencyCode: string; earliestAvailableActivityDate: string; sourceRowCounts?: Record<string, number>; error?: string; schemaVersion?: number; rubricVersion?: string; evidenceCoverage?: { datasets?: CoverageRow[]; unavailableProviders?: string[] }; scorecards?: Scorecard[] } | null }

export default function GoogleAdsAuditDeckReview() {
  const { id } = useDocumentInfo()
  const [data, setData] = useState<ReviewData | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [pending, setPending] = useState<'load' | 'generate' | 'save' | 'publish' | null>('load')
  const [notice, setNotice] = useState('Loading snapshot provenance…')

  const load = useCallback(async () => {
    if (!id) return
    setPending('load')
    try {
      const response = await fetch(`/api/google-ads-audits/${id}/deck-review`, { credentials: 'include' })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Review data could not be loaded')
      setData(result)
      setSelectedId((current) => current ?? result.deck?.slides?.[0]?.id ?? null)
      setNotice('Review data loaded.')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Review data could not be loaded')
    } finally { setPending(null) }
  }, [id])

  useEffect(() => { void load() }, [load])
  const slides = data?.deck?.slides ?? []
  const selected = slides.find((slide) => slide.id === selectedId) ?? slides[0]
  const visibleCount = slides.filter((slide) => !slide.hidden && slide.completeness !== 'unavailable' && slide.assessment !== 'not_applicable').length
  const visibility = useMemo(() => Object.fromEntries(slides.map((slide) => [slide.id, slide.hidden])), [slides])
  const coverageAvailable = data?.snapshot?.schemaVersion === 3 && Boolean(data.snapshot.evidenceCoverage)
  const coverage = data?.snapshot?.evidenceCoverage?.datasets ?? []
  const unavailableCoverage = coverage.filter((item) => item.status !== 'completed')
  const completedCoverage = coverage.filter((item) => item.status === 'completed').length

  const generate = async () => {
    if (!id) return
    setPending('generate'); setNotice('Generating from stored analysis…')
    try {
      const response = await fetch(`/api/google-ads-audits/${id}/generate-deck`, { method: 'POST', credentials: 'include' })
      const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Generation failed')
      await load(); setNotice(`Generated ${result.slideCount} catalog slides from the stored snapshot.`)
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Generation failed'); setPending(null) }
  }

  const setHidden = async (slide: Slide, hidden: boolean) => {
    if (!id || slide.required) return
    const previous = data
    const nextVisibility = { ...visibility, [slide.id]: hidden }
    setData((current) => current?.deck ? { ...current, deck: { ...current.deck, slides: current.deck.slides.map((item) => item.id === slide.id ? { ...item, hidden } : item) } } : current)
    setPending('save'); setNotice(`Saving ${slide.title} visibility…`)
    try {
      const response = await fetch(`/api/google-ads-audits/${id}/deck-slides`, { method: 'PATCH', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ visibility: nextVisibility }) })
      const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Visibility could not be saved')
      await load(); setNotice(hidden ? `${slide.title} hidden from the client deck.` : `${slide.title} restored to the client deck.`)
    } catch (error) { setData(previous); setNotice(error instanceof Error ? error.message : 'Visibility could not be saved'); setPending(null) }
  }

  const retrySnapshot = async () => {
    if (!id) return
    setPending('generate'); setNotice('Retrying the same frozen snapshot window…')
    try {
      const response = await fetch(`/api/google-ads-audits/${id}/snapshot`, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: '{}' })
      const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Snapshot retry failed')
      await load(); setNotice(`Snapshot retry started for ${String(result.periodStart).slice(0, 10)} to ${String(result.periodEnd).slice(0, 10)}.`)
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Snapshot retry failed'); setPending(null) }
  }

  const publish = async () => {
    if (!id || !data?.deck) return
    setPending('publish'); setNotice(data.published ? 'Unpublishing deck…' : 'Publishing reviewed deck…')
    try {
      const response = await fetch(`/api/google-ads-audits/${id}/publish-deck`, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ published: !data.published }) })
      const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Publish state could not be changed')
      setData((current) => current ? { ...current, published: result.published } : current); setNotice(result.published ? `Published at ${result.path}.` : 'Deck unpublished.')
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Publish state could not be changed') } finally { setPending(null) }
  }

  if (!id) return null
  return <section className="gads-review" aria-labelledby="gads-review-title">
    <header className="gads-review__header">
      <div><h2 id="gads-review-title">Audit deck review</h2><p>Verify evidence first, then narrow the improvement story.</p></div>
      <div className="gads-review__actions">
        <button type="button" className="btn" onClick={() => void generate()} disabled={Boolean(pending) || data?.snapshot?.status !== 'completed'}>{pending === 'generate' ? 'Generating…' : data?.deck ? 'Regenerate deck' : 'Generate deck'}</button>
        <button type="button" className="btn btn--style-primary" onClick={() => void publish()} disabled={Boolean(pending) || !data?.deck || (!data?.published && data?.snapshot?.status !== 'completed')}>{pending === 'publish' ? 'Saving…' : data?.published ? 'Unpublish' : 'Publish reviewed deck'}</button>
      </div>
    </header>
    {data?.snapshot ? <dl className="gads-review__provenance">
      <div><dt>Snapshot</dt><dd>{data.snapshot.status}</dd></div><div><dt>Window</dt><dd>{String(data.snapshot.periodStart).slice(0, 10)} to {String(data.snapshot.periodEnd).slice(0, 10)}</dd></div>
      <div><dt>Account timezone</dt><dd>{data.snapshot.accountTimeZone}</dd></div><div><dt>Captured</dt><dd>{data.snapshot.capturedAt ? new Date(data.snapshot.capturedAt).toLocaleString() : 'Pending'}</dd></div>
      <div><dt>Earliest activity</dt><dd>{String(data.snapshot.earliestAvailableActivityDate).slice(0, 10)}</dd></div><div><dt>Source rows</dt><dd>{Object.values(data.snapshot.sourceRowCounts ?? {}).reduce((sum, count) => sum + count, 0).toLocaleString()}</dd></div>
    </dl> : <p className="gads-review__empty">No frozen snapshot exists yet.</p>}
    {pending === 'load' && !data && <div className="gads-review__loading" role="status">Loading immutable evidence coverage…</div>}
    {data?.snapshot && ['pending', 'running'].includes(data.snapshot.status) && <div className="gads-review__loading" role="status"><strong>Capture in progress.</strong> The review will unlock after Growth Tools finalizes every dataset manifest.</div>}
    {data?.snapshot?.status === 'failed' && <div className="gads-review__error" role="alert"><strong>Capture failed.</strong> {data.snapshot.error || 'The evidence provider did not complete the frozen snapshot.'} <button type="button" onClick={() => void retrySnapshot()} disabled={Boolean(pending)}>Retry frozen snapshot</button></div>}
    {data?.snapshot?.status === 'completed' && <section className="gads-review__evidence" aria-labelledby="gads-evidence-title">
      <div className="gads-review__evidence-heading"><div><h3 id="gads-evidence-title">Evidence coverage</h3><p>{coverageAvailable ? `${completedCoverage} of ${coverage.length} collectors completed. Unavailable evidence remains Not assessed.` : 'Coverage metadata is unavailable for this legacy snapshot. Evidence is Not assessed.'}</p></div><span data-status={!coverageAvailable || unavailableCoverage.length ? 'partial' : 'complete'}>{!coverageAvailable ? 'Not assessed' : unavailableCoverage.length ? `${unavailableCoverage.length} unavailable` : 'Complete'}</span></div>
      {coverageAvailable && unavailableCoverage.length > 0 && <ul className="gads-review__coverage-list">{unavailableCoverage.map((item) => <li key={item.datasetKey}><div><strong>{item.datasetKey.replace(/_/g, ' ')}</strong><small>{item.providers?.join(', ') || 'Provider unavailable'}</small></div><span data-status={item.status}>{item.status}</span>{item.failureReasons?.[0] && <p>{item.failureReasons[0]}</p>}</li>)}</ul>}
      {(data.snapshot.scorecards?.length ?? 0) > 0 && <div className="gads-review__scorecards" aria-label="Thirteen audit category scores">{data.snapshot.scorecards?.map((category) => <div key={category.id} data-status={category.status}><span>{category.label}</span><strong>{category.score == null ? 'Not assessed' : `${category.score}/10`}</strong></div>)}</div>}
    </section>}
    {data?.deck ? <div className="gads-review__workspace">
      <aside className="gads-review__slides" aria-label={`Slides, ${visibleCount} visible`}><ol>{slides.map((slide, index) => <li key={slide.id} className={selected?.id === slide.id ? 'is-selected' : ''}>
        <button type="button" className="gads-review__select" onClick={() => setSelectedId(slide.id)} aria-current={selected?.id === slide.id ? 'true' : undefined}><span>{String(index + 1).padStart(2, '0')}</span><span><strong>{slide.title}</strong><small>{slide.assessment.replace('_', ' ')} · {slide.completeness}</small></span></button>
        <label><input type="checkbox" checked={!slide.hidden} disabled={slide.required || Boolean(pending) || data?.snapshot?.status !== 'completed'} onChange={(event) => void setHidden(slide, !event.target.checked)} /><span>{slide.required ? 'Required' : slide.hidden ? 'Hidden' : 'Visible'}</span></label>
      </li>)}</ol></aside>
      <div className="gads-review__preview"><div className="gads-review__preview-frame">{selected && <iframe title={`Preview: ${selected.title}`} src={`/partners/_audit-preview/${id}?slide=${encodeURIComponent(selected.id)}`} key={`${selected.id}-${selected.hidden}`} />}</div></div>
    </div> : <div className="gads-review__empty"><strong>No generated deck.</strong><p>Complete the snapshot, then generate the standardized slide catalog.</p></div>}
    <p className="gads-review__status" aria-live="polite">{notice}</p>
  </section>
}
