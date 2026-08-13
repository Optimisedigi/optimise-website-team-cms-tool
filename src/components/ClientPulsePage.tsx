"use client";

import type { CSSProperties } from "react";
import { useMemo, useState } from "react";
import type { ClientPulseScoreStatus, ClientPulseSummary } from "../lib/client-pulse";

export function ClientPulsePage({ initialData }: { initialData: ClientPulseSummary[] }) {
  const [expandedClientId, setExpandedClientId] = useState<string | null>(null);
  const summaries = useMemo(() => [...initialData].sort(sortSummaries), [initialData]);
  const counts = summaries.reduce(
    (result, summary) => ({
      ...result,
      [summary.scores.overall.status]: (result[summary.scores.overall.status] ?? 0) + 1,
    }),
    {} as Record<string, number>,
  );

  return (
    <section className="client-pulse-page" aria-labelledby="client-pulse-heading">
      <header className="client-pulse-header">
        <div>
          <p className="client-pulse-eyebrow">Client health</p>
          <h1 id="client-pulse-heading">Client Pulse</h1>
          <p>Prioritise accounts that need intervention.</p>
        </div>
        <div className="client-pulse-status-summary" aria-label="Client pulse status summary">
          <StatusCount label="At risk" count={counts.risk ?? 0} tone="risk" />
          <StatusCount label="Watch" count={counts.watch ?? 0} tone="watch" />
          <StatusCount label="On track" count={counts.good ?? 0} tone="good" />
          <span>Comparison: trailing 30 days</span>
        </div>
      </header>

      <div className="client-pulse-grid" role="list">
        {summaries.map((summary) => {
          const expanded = expandedClientId === String(summary.client.id);
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

              <div
                className="client-pulse-metrics"
                aria-label={`${summary.client.name} selected metrics`}
              >
                {summary.dashboardMetrics.map((metric) => (
                  <Metric key={metric.metric + metric.label} {...metric} />
                ))}
              </div>

              <SessionsChart
                sessions={summary.ga4Sessions}
                mom={summary.ga4SessionsMomPercent}
              />
              <BudgetPacing pacing={summary.budgetPacing} />

              <div className="client-pulse-card__footer">
                <p>{summary.reasons[0] ?? "No current client health concerns recorded."}</p>
                <button
                  type="button"
                  className="client-pulse-details-toggle"
                  aria-expanded={expanded}
                  aria-controls={`client-pulse-details-${summary.client.id}`}
                  onClick={() =>
                    setExpandedClientId(expanded ? null : String(summary.client.id))
                  }
                >
                  {expanded ? "Hide detail" : "Detail"}
                </button>
              </div>

              {expanded ? (
                <ClientDetails
                  summary={summary}
                  id={`client-pulse-details-${summary.client.id}`}
                />
              ) : null}
            </article>
          );
        })}
        {summaries.length === 0 ? (
          <p className="client-pulse-empty">No active clients have Client Pulse enabled.</p>
        ) : null}
      </div>
    </section>
  );
}

function StatusCount({ label, count, tone }: { label: string; count: number; tone: string }) {
  return (
    <span className={`client-pulse-status-count is-${tone}`}>
      <strong>{count}</strong>
      {label}
    </span>
  );
}

function ServiceLabels({ services }: { services: string[] }) {
  if (services.length === 0) return <span className="client-pulse-service-empty">No services set</span>;
  return (
    <div className="client-pulse-service-labels" aria-label="Client services">
      {services.map((service) => (
        <span key={service}>{serviceLabel(service)}</span>
      ))}
    </div>
  );
}

function Metric({
  label,
  displayValue,
  deltaPercent,
  source,
  invertedDelta,
}: ClientPulseSummary["dashboardMetrics"][number]) {
  const good = deltaPercent === null ? null : invertedDelta ? deltaPercent <= 0 : deltaPercent >= 0;
  return (
    <div className="client-pulse-metric" title={source}>
      <span>{label}</span>
      <div>
        <strong>{displayValue}</strong>
        <small className={good === null ? "" : good ? "is-good" : "is-risk"}>
          {deltaPercent === null
            ? "No comparison"
            : `${deltaPercent >= 0 ? "↑" : "↓"} ${Math.abs(deltaPercent)}%`}
        </small>
      </div>
    </div>
  );
}

function ScoreRing({ summary }: { summary: ClientPulseSummary }) {
  const value = summary.scores.overall.score ?? 0;
  return (
    <div
      className="client-pulse-score-ring"
      style={{
        background: `conic-gradient(var(--pulse-status) ${clamp(value)}%, #e8e9e7 0)`,
      }}
      aria-label={`Pulse score ${summary.scores.overall.score ?? "unavailable"}`}
    >
      <strong>{summary.scores.overall.score ?? "—"}</strong>
    </div>
  );
}

function PulseSparkline({ history }: { history: ClientPulseSummary["scoreHistory"] }) {
  if (history.length < 2) {
    return <span className="client-pulse-sparkline-empty">Pulse history starts after two snapshots</span>;
  }
  const points = history
    .map(
      (point, index) =>
        `${(index / (history.length - 1)) * 100},${34 - (clamp(point.score) / 100) * 32}`,
    )
    .join(" ");
  const change = history.at(-1)!.score - history[0]!.score;
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
      <span className={change >= 0 ? "is-good" : "is-risk"}>
        {change >= 0 ? "+" : ""}{change} pts <small>30d</small>
      </span>
    </div>
  );
}

function SessionsChart({
  sessions,
  mom,
}: {
  sessions: ClientPulseSummary["ga4Sessions"];
  mom: number | null;
}) {
  const max = Math.max(1, ...sessions.map((point) => point.sessions ?? 0));
  const latest = sessions.at(-1);
  return (
    <section className="client-pulse-sessions" aria-labelledby={`ga4-${latest?.month ?? "missing"}`}>
      <div className="client-pulse-sessions__header">
        <div>
          <h3 id={`ga4-${latest?.month ?? "missing"}`}>GA4 sessions</h3>
          <strong>{latest?.sessions?.toLocaleString("en-AU") ?? "No data"}</strong>
        </div>
        <span className={mom === null ? "" : mom >= 0 ? "is-good" : "is-risk"}>
          {mom === null ? "No MoM comparison" : `${mom >= 0 ? "↑" : "↓"} ${Math.abs(mom)}% MoM`}
        </span>
      </div>
      {sessions.length ? (
        <div
          className="client-pulse-sessions__chart"
          role="img"
          aria-label={`Twelve-month GA4 sessions chart. ${sessions.map((point) => `${point.month}: ${point.sessions ?? "no data"}`).join(", ")}`}
        >
          {sessions.map((point, index) => (
            <div key={point.month}>
              <span
                className={index === sessions.length - 1 ? "is-latest" : ""}
                title={`${point.month}: ${point.sessions ?? "No data"}`}
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
  );
}

function BudgetPacing({ pacing }: { pacing: ClientPulseSummary["budgetPacing"] }) {
  if (pacing.monthlyBudget === null) {
    return <p className="client-pulse-no-budget">No monthly Google Ads budget configured.</p>;
  }
  const actual = Math.min(100, pacing.actualBudgetPercent ?? 0);
  const expected = Math.min(100, pacing.expectedBudgetPercent ?? 0);
  const onPace = pacing.deltaPercentPoints !== null && Math.abs(pacing.deltaPercentPoints) <= 10;
  return (
    <section className="client-pulse-budget" aria-label="Budget pacing">
      <div>
        <strong>Budget pace <em>{onPace ? "On pace" : pacing.deltaPercentPoints && pacing.deltaPercentPoints > 0 ? "Ahead" : "Behind"}</em></strong>
        <span>{currency(pacing.mtdSpend)} of {currency(pacing.monthlyBudget)}</span>
      </div>
      <div className="client-pulse-budget__track">
        <span style={{ width: `${actual}%` }} />
        <i style={{ left: `${expected}%` }} aria-label={`${expected}% expected spend marker`} />
      </div>
    </section>
  );
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
            ? `Last meaningful activity: ${new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", year: "numeric" }).format(new Date(summary.lastMeaningfulActivityAt))}`
            : "No meaningful activity is recorded."}
        </p>
      </section>
    </div>
  );
}

function sortSummaries(a: ClientPulseSummary, b: ClientPulseSummary): number {
  const rank: Record<ClientPulseScoreStatus, number> = {
    risk: 0,
    watch: 1,
    missing: 2,
    good: 3,
    not_in_scope: 4,
  };
  return rank[a.scores.overall.status] - rank[b.scores.overall.status] || a.client.name.localeCompare(b.client.name);
}

function serviceLabel(service: string): string {
  const labels: Record<string, string> = {
    google_ads: "Google Ads",
    paid_search: "Google Ads",
    seo: "SEO",
    organic: "SEO",
    ga4: "GA4",
  };
  return labels[service] ?? service.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function monthLabel(month: string): string {
  const date = new Date(`${month}-01T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? month : new Intl.DateTimeFormat("en-AU", { month: "short" }).format(date);
}

function pulseColorStyle(summary: ClientPulseSummary): CSSProperties {
  return { "--pulse-status": pulseColor(summary.scores.overall.score) } as CSSProperties;
}
function pulseColor(score: number | null): string {
  if (score === null) return "#737373";
  if (score >= 90) return "#15803d";
  if (score >= 80) return "#65a30d";
  if (score >= 65) return "#ca8a04";
  if (score >= 50) return "#f59e0b";
  if (score >= 30) return "#ea580c";
  return "#dc2626";
}
function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}
function currency(value: number | null): string {
  return value === null ? "—" : `$${Math.round(value).toLocaleString("en-AU")}`;
}

export default ClientPulsePage;
