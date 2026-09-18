'use client'

import type { CSSProperties } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { ClientPulseScoreStatus, ClientPulseSummary } from '../lib/client-pulse'

export interface ClientPulseAvailableClient {
  id: number
  name: string
}

export function ClientPulsePage({
  initialData,
  availableClients = [],
}: {
  initialData: ClientPulseSummary[]
  availableClients?: ClientPulseAvailableClient[]
}) {
  const router = useRouter()
  const [expandedClientId, setExpandedClientId] = useState<string | null>(null)
  const [gridColumns, setGridColumns] = useState<2 | 3 | 4>(4)
  const [selectedClientIds, setSelectedClientIds] = useState<number[]>([])
  const [isAddingClients, setIsAddingClients] = useState(false)
  const [addClientsMessage, setAddClientsMessage] = useState('')
  const summaries = useMemo(() => [...initialData].sort(sortSummaries), [initialData])

  useEffect(() => {
    try {
      const saved = Number(window.localStorage.getItem('client-pulse-grid-columns'))
      if (saved === 2 || saved === 3 || saved === 4) setGridColumns(saved)
    } catch {
      // Storage can be unavailable in restricted browser sessions; keep the default.
    }
  }, [])

  function chooseGridColumns(columns: 2 | 3 | 4) {
    setGridColumns(columns)
    try {
      window.localStorage.setItem('client-pulse-grid-columns', String(columns))
    } catch {
      // The current view still updates when the preference cannot be persisted.
    }
  }

  function toggleSelectedClient(id: number) {
    setSelectedClientIds((current) =>
      current.includes(id) ? current.filter((clientId) => clientId !== id) : [...current, id],
    )
  }

  async function addSelectedClients() {
    if (selectedClientIds.length === 0 || isAddingClients) return
    setIsAddingClients(true)
    setAddClientsMessage('')
    try {
      const response = await fetch('/api/client-pulse/clients', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ clientIds: selectedClientIds }),
      })
      const result = (await response.json().catch(() => ({}))) as { added?: number; error?: string }
      if (!response.ok) throw new Error(result.error || 'Could not add the selected clients.')
      setSelectedClientIds([])
      setAddClientsMessage(
        `${result.added ?? 0} client${result.added === 1 ? '' : 's'} added to Client Pulse.`,
      )
      router.refresh()
    } catch (error) {
      setAddClientsMessage(
        error instanceof Error ? error.message : 'Could not add the selected clients.',
      )
    } finally {
      setIsAddingClients(false)
    }
  }
  const counts = summaries.reduce(
    (result, summary) => ({
      ...result,
      [summary.scores.overall.status]: (result[summary.scores.overall.status] ?? 0) + 1,
    }),
    {} as Record<string, number>,
  )

  return (
    <section className="client-pulse-page" aria-labelledby="client-pulse-heading">
      <header className="client-pulse-header">
        <div>
          <p className="client-pulse-eyebrow">Client health</p>
          <h1 id="client-pulse-heading">Client Pulse</h1>
          <p>Prioritise accounts that need intervention and keep audits on schedule.</p>
        </div>
        <div className="client-pulse-status-summary" aria-label="Client pulse status summary">
          <StatusCount label="At risk" count={counts.risk ?? 0} tone="risk" />
          <StatusCount label="Watch" count={counts.watch ?? 0} tone="watch" />
          <StatusCount label="On track" count={counts.good ?? 0} tone="good" />
          <span>Comparison: trailing 30 days</span>
        </div>
      </header>

      <div className="client-pulse-toolbar">
        <details className="client-pulse-client-picker">
          <summary>
            Add clients
            {availableClients.length > 0 ? <span>{availableClients.length} available</span> : null}
          </summary>
          <div className="client-pulse-client-picker__panel">
            <div className="client-pulse-client-picker__heading">
              <div>
                <strong>Add clients to this view</strong>
                <span>Choose active clients that are not already shown.</span>
              </div>
              {availableClients.length > 0 ? (
                <button
                  type="button"
                  onClick={() =>
                    setSelectedClientIds(
                      selectedClientIds.length === availableClients.length
                        ? []
                        : availableClients.map((client) => client.id),
                    )
                  }
                >
                  {selectedClientIds.length === availableClients.length
                    ? 'Clear all'
                    : 'Select all'}
                </button>
              ) : null}
            </div>
            {availableClients.length > 0 ? (
              <div className="client-pulse-client-picker__options">
                {availableClients.map((client) => (
                  <label key={client.id}>
                    <input
                      type="checkbox"
                      checked={selectedClientIds.includes(client.id)}
                      onChange={() => toggleSelectedClient(client.id)}
                    />
                    <span>{client.name}</span>
                  </label>
                ))}
              </div>
            ) : (
              <p className="client-pulse-client-picker__empty">
                All active clients are already in Client Pulse.
              </p>
            )}
            <div className="client-pulse-client-picker__actions">
              <span aria-live="polite">{addClientsMessage}</span>
              <button
                type="button"
                className="btn btn--style-primary btn--size-small"
                disabled={selectedClientIds.length === 0 || isAddingClients}
                onClick={addSelectedClients}
              >
                {isAddingClients
                  ? 'Adding…'
                  : `Add selected${selectedClientIds.length ? ` (${selectedClientIds.length})` : ''}`}
              </button>
            </div>
          </div>
        </details>

        <div className="client-pulse-grid-control" role="group" aria-label="Clients shown per row">
          <span>Cards per row</span>
          {[2, 3, 4].map((columns) => (
            <button
              key={columns}
              type="button"
              aria-pressed={gridColumns === columns}
              onClick={() => chooseGridColumns(columns as 2 | 3 | 4)}
            >
              {columns}
            </button>
          ))}
        </div>
      </div>

      <div
        className="client-pulse-grid"
        role="list"
        data-columns={gridColumns}
        style={{ '--pulse-grid-columns': gridColumns } as CSSProperties}
      >
        {summaries.map((summary) => {
          const expanded = expandedClientId === String(summary.client.id)
          return (
            <article
              key={summary.client.id}
              className={`client-pulse-card is-${summary.scores.overall.status}`}
              style={pulseColorStyle(summary)}
              role="listitem"
            >
              <div className="client-pulse-card__top">
                <div className="client-pulse-card__identity">
                  <a href={`/admin/collections/clients/${summary.client.id}`}>
                    <h2>{summary.client.name}</h2>
                  </a>
                  <ServiceLabels services={summary.client.services} />
                </div>
                <div className="client-pulse-score-group">
                  <PulseSparkline history={summary.scoreHistory} />
                  <ScoreRing summary={summary} />
                </div>
              </div>

              <TenureTimeline client={summary.client} />

              <div
                className="client-pulse-metrics"
                aria-label={`${summary.client.name} selected metrics`}
              >
                {summary.dashboardMetrics.map((metric) => (
                  <Metric key={metric.metric + metric.label} {...metric} />
                ))}
              </div>

              <SessionsChart
                clientId={String(summary.client.id)}
                sessions={summary.ga4Sessions}
                mom={summary.ga4SessionsMomPercent}
              />
              <BudgetPacing pacing={summary.budgetPacing} />

              <div className="client-pulse-card__footer">
                <p>{summary.reasons[0] ?? 'No current client health concerns recorded.'}</p>
                <button
                  type="button"
                  className="client-pulse-details-toggle"
                  aria-expanded={expanded}
                  aria-controls={`client-pulse-details-${summary.client.id}`}
                  onClick={() => setExpandedClientId(expanded ? null : String(summary.client.id))}
                >
                  {expanded ? 'Hide detail' : 'Detail'}
                </button>
              </div>

              {expanded ? (
                <ClientDetails summary={summary} id={`client-pulse-details-${summary.client.id}`} />
              ) : null}
            </article>
          )
        })}
        {summaries.length === 0 ? (
          <p className="client-pulse-empty">No active clients have Client Pulse enabled.</p>
        ) : null}
      </div>
    </section>
  )
}

function StatusCount({ label, count, tone }: { label: string; count: number; tone: string }) {
  return (
    <span className={`client-pulse-status-count is-${tone}`}>
      <strong>{count}</strong>
      {label}
    </span>
  )
}

function ServiceLabels({ services }: { services: string[] }) {
  if (services.length === 0)
    return <span className="client-pulse-service-empty">No services set</span>
  return (
    <div className="client-pulse-service-labels" aria-label="Client services">
      {services.map((service) => (
        <span key={service}>{serviceLabel(service)}</span>
      ))}
    </div>
  )
}

function Metric({
  label,
  displayValue,
  deltaPercent,
  source,
  invertedDelta,
}: ClientPulseSummary['dashboardMetrics'][number]) {
  const good = deltaPercent === null ? null : invertedDelta ? deltaPercent <= 0 : deltaPercent >= 0
  return (
    <div className="client-pulse-metric" title={source}>
      <span>{label}</span>
      <div>
        <strong>{displayValue}</strong>
        <small className={good === null ? '' : good ? 'is-good' : 'is-risk'}>
          {deltaPercent === null
            ? 'No comparison'
            : `${deltaPercent >= 0 ? '↑' : '↓'} ${Math.abs(deltaPercent)}%`}
        </small>
      </div>
    </div>
  )
}

function ScoreRing({ summary }: { summary: ClientPulseSummary }) {
  const value = summary.scores.overall.score ?? 0
  return (
    <div
      className="client-pulse-score-ring"
      style={{
        background: `conic-gradient(var(--pulse-status) ${clamp(value)}%, #e8e9e7 0)`,
      }}
      aria-label={`Pulse score ${summary.scores.overall.score ?? 'unavailable'}`}
    >
      <strong>{summary.scores.overall.score ?? '—'}</strong>
    </div>
  )
}

function PulseSparkline({ history }: { history: ClientPulseSummary['scoreHistory'] }) {
  if (history.length < 2) {
    return (
      <span className="client-pulse-sparkline-empty">Pulse history starts after two snapshots</span>
    )
  }
  const points = history
    .map(
      (point, index) =>
        `${(index / (history.length - 1)) * 100},${34 - (clamp(point.score) / 100) * 32}`,
    )
    .join(' ')
  const change = history.at(-1)!.score - history[0]!.score
  return (
    <div className="client-pulse-sparkline-wrap">
      <svg
        className="client-pulse-sparkline"
        viewBox="0 0 100 36"
        role="img"
        aria-label={`Pulse history from ${history[0]?.score} to ${history.at(-1)?.score}`}
      >
        <polyline points={points} fill="none" stroke="currentColor" strokeWidth="3" />
      </svg>
      <span className={change >= 0 ? 'is-good' : 'is-risk'}>
        {change >= 0 ? '+' : ''}
        {change} pts <small>30d</small>
      </span>
    </div>
  )
}

function SessionsChart({
  clientId,
  sessions,
  mom,
}: {
  clientId: string
  sessions: ClientPulseSummary['ga4Sessions']
  mom: number | null
}) {
  const max = Math.max(1, ...sessions.map((point) => point.sessions ?? 0))
  const latest = sessions.at(-1)
  const headingId = `ga4-${clientId}`
  return (
    <section className="client-pulse-sessions" aria-labelledby={headingId}>
      <div className="client-pulse-sessions__header">
        <div>
          <h3 id={headingId}>GA4 sessions</h3>
          <strong>{latest?.sessions?.toLocaleString('en-AU') ?? 'No data'}</strong>
        </div>
        <span className={mom === null ? '' : mom >= 0 ? 'is-good' : 'is-risk'}>
          {mom === null ? 'No MoM comparison' : `${mom >= 0 ? '↑' : '↓'} ${Math.abs(mom)}% MoM`}
        </span>
      </div>
      {sessions.length ? (
        <div
          className="client-pulse-sessions__chart"
          role="img"
          aria-label={`Twelve-month GA4 sessions chart. ${sessions.map((point) => `${point.month}: ${point.sessions ?? 'no data'}`).join(', ')}`}
        >
          {sessions.map((point, index) => (
            <div key={point.month}>
              <span
                className={index === sessions.length - 1 ? 'is-latest' : ''}
                title={`${point.month}: ${point.sessions ?? 'No data'}`}
                style={{ height: `${((point.sessions ?? 0) / max) * 100}%` }}
              />
              <small>{monthLabel(point.month)}</small>
            </div>
          ))}
        </div>
      ) : (
        <p className="client-pulse-sessions__empty">
          No GA4 monthly snapshots. Connect GA4 and run the analytics snapshot sync.
        </p>
      )}
      <small className="client-pulse-sessions__range">Last 12 complete months</small>
    </section>
  )
}

function BudgetPacing({ pacing }: { pacing: ClientPulseSummary['budgetPacing'] }) {
  if (pacing.monthlyBudget === null) {
    return <p className="client-pulse-no-budget">No monthly Google Ads budget configured.</p>
  }
  const actual = Math.min(100, pacing.actualBudgetPercent ?? 0)
  const expected = Math.min(100, pacing.expectedBudgetPercent ?? 0)
  const onPace = pacing.deltaPercentPoints !== null && Math.abs(pacing.deltaPercentPoints) <= 10
  return (
    <section className="client-pulse-budget" aria-label="Budget pacing">
      <div>
        <strong>
          Budget pace{' '}
          <em>
            {onPace
              ? 'On pace'
              : pacing.deltaPercentPoints && pacing.deltaPercentPoints > 0
                ? 'Ahead'
                : 'Behind'}
          </em>
        </strong>
        <span>
          {currency(pacing.mtdSpend)} of {currency(pacing.monthlyBudget)}
        </span>
      </div>
      <div className="client-pulse-budget__track">
        <span style={{ width: `${actual}%` }} />
        <i style={{ left: `${expected}%` }} aria-label={`${expected}% expected spend marker`} />
      </div>
    </section>
  )
}

function TenureTimeline({ client }: { client: ClientPulseSummary['client'] }) {
  const months = client.monthsActive
  // Month + year only: the exact day adds width without telling the team anything
  // they act on at a glance.
  const formatStartDate = (value: string | null) =>
    value
      ? new Intl.DateTimeFormat('en-AU', { month: 'short', year: 'numeric' }).format(new Date(value))
      : null
  const campaignStartDate = formatStartDate(client.campaignStartDate)
  const contractStartDate = formatStartDate(client.contractStartDate)

  if (months == null) {
    return (
      <div className="client-pulse-tenure is-missing">
        <div>
          <strong>Campaign date needed</strong>
          <span>Add it on the Business tab.</span>
        </div>
      </div>
    )
  }

  const currentMonth = months > 0 ? (months - 1) % 12 : 0
  const quarterlyDue = months > 0 && months % 3 === 0
  const monthsToQuarter = quarterlyDue ? 0 : 3 - (months % 3)
  const cadenceText = quarterlyDue ? 'Audit due' : `Audit in ${monthsToQuarter} mo`

  return (
    <section className="client-pulse-tenure" aria-label={`${client.name} campaign tenure and audit cadence`}>
      <div className="client-pulse-tenure__heading">
        <div>
          <strong>
            {months} month{months === 1 ? '' : 's'}
          </strong>
          <span>
            {campaignStartDate ? `Campaign ${campaignStartDate}` : 'Add a campaign date'}
          </span>
          {contractStartDate ? <span>Contract {contractStartDate}</span> : null}
        </div>
        <span className={quarterlyDue ? 'is-due' : ''}>{cadenceText}</span>
      </div>
      <div
        className="client-pulse-tenure__track"
        role="img"
        aria-label={`Current annual campaign cycle: month ${currentMonth + 1} of 12. Monthly checkpoints are shown; quarter ends are months 3, 6, 9 and 12.`}
      >
        {Array.from({ length: 12 }, (_, index) => (
          <span
            key={index}
            className={`${(index + 1) % 3 === 0 ? 'is-quarter' : ''} ${index === currentMonth ? 'is-current' : ''}`}
          />
        ))}
      </div>
    </section>
  )
}

function ClientDetails({ summary, id }: { summary: ClientPulseSummary; id: string }) {
  return (
    <div id={id} className="client-pulse-details">
      <section>
        <h3>Why this pulse</h3>
        <ul>
          {summary.reasons.length ? (
            summary.reasons.map((reason) => <li key={reason}>{reason}</li>)
          ) : (
            <li>No risk reasons recorded.</li>
          )}
        </ul>
      </section>
      <section>
        <h3>Recent activity</h3>
        <p>
          {summary.lastMeaningfulActivityAt
            ? `Last meaningful activity: ${new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(summary.lastMeaningfulActivityAt))}`
            : 'No meaningful activity is recorded.'}
        </p>
      </section>
    </div>
  )
}

function sortSummaries(a: ClientPulseSummary, b: ClientPulseSummary): number {
  const rank: Record<ClientPulseScoreStatus, number> = {
    risk: 0,
    watch: 1,
    missing: 2,
    good: 3,
    not_in_scope: 4,
  }
  return (
    rank[a.scores.overall.status] - rank[b.scores.overall.status] ||
    a.client.name.localeCompare(b.client.name)
  )
}

function serviceLabel(service: string): string {
  const labels: Record<string, string> = {
    google_ads: 'Google Ads',
    paid_search: 'Google Ads',
    seo: 'SEO',
    organic: 'SEO',
    ga4: 'GA4',
  }
  return (
    labels[service] ??
    service.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
  )
}

function monthLabel(month: string): string {
  const date = new Date(`${month}-01T00:00:00Z`)
  return Number.isNaN(date.getTime())
    ? month
    : new Intl.DateTimeFormat('en-AU', { month: 'short' }).format(date)
}

function pulseColorStyle(summary: ClientPulseSummary): CSSProperties {
  return { '--pulse-status': pulseColor(summary.scores.overall.score) } as CSSProperties
}
function pulseColor(score: number | null): string {
  if (score === null) return '#737373'
  if (score >= 90) return '#15803d'
  if (score >= 80) return '#65a30d'
  if (score >= 65) return '#ca8a04'
  if (score >= 50) return '#f59e0b'
  if (score >= 30) return '#ea580c'
  return '#dc2626'
}
function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)))
}
function currency(value: number | null): string {
  return value === null ? '—' : `$${Math.round(value).toLocaleString('en-AU')}`
}

export default ClientPulsePage
