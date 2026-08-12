"use client";

import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";
import { usePreferences } from "@payloadcms/ui";
import type { ClientPulseScoreStatus, ClientPulseSummary } from "../lib/client-pulse";

const ORDER_PREFERENCE_KEY = "client-pulse-order";

export function ClientPulsePage({ initialData }: { initialData: ClientPulseSummary[] }) {
  const { getPreference, setPreference } = usePreferences();
  const [manualOrder, setManualOrder] = useState<string[] | null>(null);
  const [expandedClientId, setExpandedClientId] = useState<string | null>(null);
  useEffect(() => { void getPreference(ORDER_PREFERENCE_KEY).then((saved: unknown) => { const order = (saved as { order?: unknown })?.order; if (Array.isArray(order) && order.every((id) => typeof id === "string")) setManualOrder(order); }).catch(() => {}); }, [getPreference]);
  const summaries = useMemo(() => applyManualOrder([...initialData].sort(sortSummaries), manualOrder), [initialData, manualOrder]);
  const move = (index: number, direction: -1 | 1) => {
    const next = [...summaries]; const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target]!, next[index]!];
    const order = next.map((summary) => String(summary.client.id));
    setManualOrder(order); void setPreference(ORDER_PREFERENCE_KEY, { order }, true).catch(() => {});
  };
  const counts = summaries.reduce((result, summary) => ({ ...result, [summary.scores.overall.status]: (result[summary.scores.overall.status] ?? 0) + 1 }), {} as Record<string, number>);
  return <section className="client-pulse-page" aria-labelledby="client-pulse-heading">
    <header className="client-pulse-header"><div><p className="client-pulse-eyebrow">Client health</p><h1 id="client-pulse-heading">Client Pulse</h1><p>Prioritise accounts that need intervention.</p></div><div className="client-pulse-status-summary" aria-label="Client pulse status summary"><StatusCount label="At risk" count={counts.risk ?? 0} tone="risk" /><StatusCount label="Watch" count={counts.watch ?? 0} tone="watch" /><StatusCount label="On track" count={counts.good ?? 0} tone="good" /><span>Comparison: trailing 30 days</span></div></header>
    <div className="client-pulse-grid" role="list">{summaries.map((summary, index) => {
      const expanded = expandedClientId === String(summary.client.id);
      return <article key={summary.client.id} className={`client-pulse-card is-${summary.scores.overall.status}`} style={pulseColorStyle(summary)} role="listitem">
        <div className="client-pulse-card__top"><div className="client-pulse-card__identity"><div><h2>{summary.client.name}</h2><p>{summary.client.services.join(" · ") || "No service labels"}</p></div><PulseSparkline history={summary.scoreHistory} /></div><ScoreRing summary={summary} /></div>
        <div className="client-pulse-metrics" aria-label={`${summary.client.name} selected metrics`}>{summary.dashboardMetrics.map((metric) => <Metric key={metric.metric + metric.label} {...metric} />)}</div>
        <BudgetPacing pacing={summary.budgetPacing} />
        <div className="client-pulse-card__actions"><button type="button" className="client-pulse-details-toggle" aria-expanded={expanded} aria-controls={`client-pulse-details-${summary.client.id}`} onClick={() => setExpandedClientId(expanded ? null : String(summary.client.id))}>{expanded ? "Hide details" : "View details"}</button><a href={`/admin/collections/clients/${summary.client.id}`}>Open client</a><div className="client-pulse-order-actions" aria-label={`Reorder ${summary.client.name}`}><button type="button" onClick={() => move(index, -1)} disabled={index === 0}>Move up</button><button type="button" onClick={() => move(index, 1)} disabled={index === summaries.length - 1}>Move down</button></div></div>
        {expanded ? <ClientDetails summary={summary} id={`client-pulse-details-${summary.client.id}`} /> : null}
      </article>;
    })}{summaries.length === 0 ? <p className="client-pulse-empty">No active clients have Client Pulse enabled.</p> : null}</div>
  </section>;
}

function StatusCount({ label, count, tone }: { label: string; count: number; tone: string }) { return <span className={`client-pulse-status-count is-${tone}`}><strong>{count}</strong>{label}</span>; }
function Metric({ label, displayValue, deltaPercent, source, invertedDelta }: ClientPulseSummary["dashboardMetrics"][number]) { const good = deltaPercent === null ? null : invertedDelta ? deltaPercent <= 0 : deltaPercent >= 0; return <div className="client-pulse-metric"><span>{label}</span><strong>{displayValue}</strong><small className={good === null ? "" : good ? "is-good" : "is-risk"}>{deltaPercent === null ? "No comparison data" : `${deltaPercent >= 0 ? "+" : ""}${deltaPercent}% vs previous 30 days`}</small><span className="client-pulse-source">{source}</span></div>; }
function ScoreRing({ summary }: { summary: ClientPulseSummary }) { const value = summary.scores.overall.score ?? 0; return <div className="client-pulse-score-ring" style={{ background: `conic-gradient(var(--pulse-status) ${clamp(value)}%, #e8e9e7 0)` } satisfies CSSProperties}><strong>{summary.scores.overall.score ?? "—"}</strong><span>Pulse</span></div>; }
function PulseSparkline({ history }: { history: ClientPulseSummary["scoreHistory"] }) { if (history.length < 2) return <span className="client-pulse-sparkline-empty">No pulse history</span>; const points = history.map((point, index) => `${(index / (history.length - 1)) * 100},${28 - (clamp(point.score) / 100) * 28}`).join(" "); return <svg className="client-pulse-sparkline" viewBox="0 0 100 28" role="img" aria-label={`Pulse history from ${history[0]?.score} to ${history.at(-1)?.score}`}><polyline points={points} fill="none" stroke="currentColor" strokeWidth="2" /></svg>; }
function BudgetPacing({ pacing }: { pacing: ClientPulseSummary["budgetPacing"] }) { if (pacing.monthlyBudget === null) return <p className="client-pulse-no-budget">No monthly Ads budget configured.</p>; const actual = Math.min(100, pacing.actualBudgetPercent ?? 0); const expected = Math.min(100, pacing.expectedBudgetPercent ?? 0); return <section className="client-pulse-budget" aria-label="Budget pacing"><div><strong>Budget pace</strong><span>{currency(pacing.mtdSpend)} of {currency(pacing.monthlyBudget)}</span></div><div className="client-pulse-budget__track"><span style={{ width: `${actual}%` }} /><i style={{ left: `${expected}%` }} aria-label={`${expected}% expected spend marker`} /></div><small>{pacing.deltaPercentPoints === null ? "No pacing comparison" : `${Math.abs(pacing.deltaPercentPoints)} points ${pacing.deltaPercentPoints >= 0 ? "ahead of" : "below"} expected pace`}</small></section>; }
function ClientDetails({ summary, id }: { summary: ClientPulseSummary; id: string }) { return <div id={id} className="client-pulse-details"><section><h3>Why this pulse</h3><ul>{summary.reasons.length ? summary.reasons.map((reason) => <li key={reason}>{reason}</li>) : <li>No risk reasons recorded.</li>}</ul></section><SessionsChart sessions={summary.ga4Sessions} mom={summary.ga4SessionsMomPercent} /><section><h3>Recent activity</h3><p>{summary.lastMeaningfulActivityAt ? `Last meaningful activity: ${new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", year: "numeric" }).format(new Date(summary.lastMeaningfulActivityAt))}` : "No meaningful activity is recorded."}</p></section></div>; }
function SessionsChart({ sessions, mom }: { sessions: ClientPulseSummary["ga4Sessions"]; mom: number | null }) { const max = Math.max(1, ...sessions.map((point) => point.sessions ?? 0)); return <section className="client-pulse-sessions"><h3>GA4 sessions</h3><p>{sessions.length ? `${sessions.at(-1)?.month}: ${sessions.at(-1)?.sessions?.toLocaleString("en-AU") ?? "No data"}${mom === null ? "" : `, ${mom >= 0 ? "+" : ""}${mom}% month on month`}` : "No monthly GA4 snapshots yet."}</p>{sessions.length ? <div className="client-pulse-sessions__chart" role="img" aria-label={`Twelve-month GA4 sessions chart. ${sessions.map((point) => `${point.month}: ${point.sessions ?? "no data"}`).join(", ")}`}>{sessions.map((point) => <span key={point.month} title={`${point.month}: ${point.sessions ?? "No data"}`} style={{ height: `${((point.sessions ?? 0) / max) * 100}%` }} />)}</div> : null}</section>; }
function applyManualOrder(summaries: ClientPulseSummary[], order: string[] | null): ClientPulseSummary[] { if (!order?.length) return summaries; const rank = new Map(order.map((id, index) => [id, index])); return summaries.sort((a, b) => (rank.get(String(a.client.id)) ?? Number.MAX_SAFE_INTEGER) - (rank.get(String(b.client.id)) ?? Number.MAX_SAFE_INTEGER)); }
function sortSummaries(a: ClientPulseSummary, b: ClientPulseSummary): number { const rank: Record<ClientPulseScoreStatus, number> = { risk: 0, watch: 1, missing: 2, good: 3, not_in_scope: 4 }; return rank[a.scores.overall.status] - rank[b.scores.overall.status] || a.client.name.localeCompare(b.client.name); }
function pulseColorStyle(summary: ClientPulseSummary): CSSProperties { return { "--pulse-status": pulseColor(summary.scores.overall.score) } as CSSProperties; }
function pulseColor(score: number | null): string { if (score === null) return "#737373"; if (score >= 90) return "#15803d"; if (score >= 80) return "#65a30d"; if (score >= 65) return "#ca8a04"; if (score >= 50) return "#f59e0b"; if (score >= 30) return "#ea580c"; return "#dc2626"; }
function clamp(value: number): number { return Math.max(0, Math.min(100, Math.round(value))); }
function currency(value: number | null): string { return value === null ? "—" : `$${Math.round(value).toLocaleString("en-AU")}`; }
export default ClientPulsePage;
