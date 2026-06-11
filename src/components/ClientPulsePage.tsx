"use client";

import type { CSSProperties } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePreferences } from "@payloadcms/ui";
import type { ClientPulseScoreStatus, ClientPulseSummary, SignalItem } from "../lib/client-pulse";

const ORDER_PREFERENCE_KEY = "client-pulse-order";

export function ClientPulsePage({ initialData }: { initialData: ClientPulseSummary[] }) {
  const { getPreference, setPreference } = usePreferences();
  const [manualOrder, setManualOrder] = useState<string[] | null>(null);
  const dragIndex = useRef<number | null>(null);

  useEffect(() => {
    const loadOrder = async () => {
      try {
        const saved = (await getPreference(ORDER_PREFERENCE_KEY)) as { order?: string[] } | undefined;
        if (Array.isArray(saved?.order)) setManualOrder(saved.order);
      } catch {
        // Preference fetch failing must not break the page — default sort applies.
      }
    };
    void loadOrder();
  }, [getPreference]);

  const summaries = useMemo(() => applyManualOrder([...initialData].sort(sortSummaries), manualOrder), [initialData, manualOrder]);

  const persistOrder = (order: string[]): void => {
    setManualOrder(order);
    void setPreference(ORDER_PREFERENCE_KEY, { order }, true).catch(() => {});
  };

  const onDrop = (targetIndex: number): void => {
    const from = dragIndex.current;
    dragIndex.current = null;
    if (from === null || from === targetIndex) return;
    const reordered = [...summaries];
    const [moved] = reordered.splice(from, 1);
    if (!moved) return;
    reordered.splice(targetIndex, 0, moved);
    persistOrder(reordered.map((summary) => String(summary.client.id)));
  };

  return (
    <section className="client-pulse-page">
      <div className="client-pulse-grid" role="list">
        {summaries.map((summary, index) => (
          <article
            key={String(summary.client.id)}
            className={`client-pulse-card is-${summary.scores.overall.status}`}
            style={pulseColorStyle(summary)}
            role="listitem"
            tabIndex={0}
            draggable
            onDragStart={(event) => { dragIndex.current = index; event.dataTransfer.effectAllowed = "move"; }}
            onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; }}
            onDrop={(event) => { event.preventDefault(); onDrop(index); }}
            onDragEnd={() => { dragIndex.current = null; }}
            onMouseEnter={positionDetailPanel}
            onFocus={positionDetailPanel}
          >
            <div className="client-pulse-card__main">
              <div className="client-pulse-card__title"><h2>{summary.client.name}</h2><PulseSparkline history={summary.scoreHistory} /></div>
              <ScoreRing summary={summary} />
            </div>
            <div className="client-pulse-metrics" aria-label={`${summary.client.name} pulse stats`}>
              <MetricChip label="Target" value={formatTargetStatus(summary)} tone={targetTone(summary)} title="Whether this client is currently achieving their configured Client Pulse target." />
              <MetricChip label="Budget pace" value={formatBudgetPacing(summary)} tone={budgetTone(summary.budgetPacing.status)} title="Google Ads month-to-date spend against expected monthly budget pace." />
              <MetricChip label="Conversions" value={formatTrendValue(summary.adsTrend.mtdConversionsYoyPercent, summary.client.hasGoogleAds)} tone={trendTone(summary.adsTrend.mtdConversionsYoyPercent)} title="Google Ads month-to-date conversions compared with the same dates last year." />
            </div>
            <DetailPanel summary={summary} />
          </article>
        ))}
        {summaries.length === 0 ? <div className="client-pulse-empty">No clients found.</div> : null}
      </div>
    </section>
  );
}

/**
 * Applies the user's saved manual order: clients in the saved list keep that
 * order; anything new (not yet in the list) is appended in default status sort.
 */
function applyManualOrder(sorted: ClientPulseSummary[], order: string[] | null): ClientPulseSummary[] {
  if (!order || order.length === 0) return sorted;
  const rank = new Map(order.map((id, index) => [id, index]));
  return [...sorted].sort((a, b) => {
    const rankA = rank.get(String(a.client.id)) ?? Number.MAX_SAFE_INTEGER;
    const rankB = rank.get(String(b.client.id)) ?? Number.MAX_SAFE_INTEGER;
    return rankA - rankB;
  });
}

/**
 * Keeps the hover detail panel inside the viewport: opens it above the card
 * when there isn't enough room below, and caps its height to the available
 * space so long signal lists scroll instead of running off-screen.
 */
function positionDetailPanel(event: React.MouseEvent<HTMLElement> | React.FocusEvent<HTMLElement>): void {
  const card = event.currentTarget;
  const panel = card.querySelector<HTMLElement>(".client-pulse-detail-panel");
  if (!panel) return;
  // Mobile renders the panel inline (position: static) — no popup to position,
  // and an inline max-height would clip the inline panel.
  if (getComputedStyle(panel).position === "static") {
    panel.style.maxHeight = "";
    card.classList.remove("client-pulse-card--flip");
    return;
  }
  const rect = card.getBoundingClientRect();
  const margin = 16;
  const spaceBelow = window.innerHeight - rect.bottom - margin;
  const spaceAbove = rect.top - margin;
  const flip = spaceBelow < 320 && spaceAbove > spaceBelow;
  card.classList.toggle("client-pulse-card--flip", flip);
  panel.style.maxHeight = `${Math.max(200, Math.floor(flip ? spaceAbove : spaceBelow))}px`;
}

function MetricChip({ label, value, title, tone = "neutral" }: { label: string; value: string; title?: string; tone?: "good" | "bad" | "neutral" }) {
  return <span className={`client-pulse-metric is-${tone}`} title={title}><strong>{value}</strong><small>{label}</small></span>;
}

function ScoreRing({ summary }: { summary: ClientPulseSummary }) {
  const scoreValue = summary.scores.overall.score ?? summary.target.progressPercent;
  const score = clampPercent(scoreValue ?? 0);
  const style = { background: `conic-gradient(var(--pulse-status) ${score}%, var(--pulse-track) 0)` } satisfies CSSProperties;
  return <div className="client-pulse-score-ring" style={style}><strong>{scoreValue === null ? "—" : score}</strong><span>Pulse</span></div>;
}

function PulseSparkline({ history }: { history: ClientPulseSummary["scoreHistory"] }) {
  if (history.length < 2) return <span className="client-pulse-sparkline-empty">No trend yet</span>;
  const width = 112;
  const height = 26;
  const scores = history.map((point) => clampPercent(point.score));
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const range = Math.max(1, max - min);
  const points = scores.map((score, index) => {
    const x = history.length === 1 ? 0 : (index / (history.length - 1)) * width;
    const y = height - ((score - min) / range) * height;
    return `${roundSvg(x)},${roundSvg(y)}`;
  }).join(" ");
  const first = scores[0] ?? 0;
  const last = scores[scores.length - 1] ?? first;
  const direction = last > first ? "up" : last < first ? "down" : "flat";
  return <svg className={`client-pulse-sparkline is-${direction}`} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Pulse trend: ${first} to ${last} over ${history.length} snapshots`}><title>{`Pulse trend: ${first} → ${last} over ${history.length} snapshots`}</title><polyline points={points} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function pulseColorStyle(summary: ClientPulseSummary): CSSProperties {
  const scoreValue = summary.scores.overall.score ?? summary.target.progressPercent;
  return { "--pulse-status": pulseColor(scoreValue) } as CSSProperties;
}

function pulseColor(score: number | null): string {
  if (score === null) return "#737373";
  const value = clampPercent(score);
  if (value >= 90) return "#15803d";
  if (value >= 80) return "#65a30d";
  if (value >= 65) return "#ca8a04";
  if (value >= 50) return "#f59e0b";
  if (value >= 30) return "#ea580c";
  return "#dc2626";
}

function ScorePill({ status, label }: { status: ClientPulseScoreStatus; label: string }) {
  return <span className={`client-pulse-pill is-${status}`}>{label}</span>;
}

function DetailPanel({ summary }: { summary: ClientPulseSummary }) {
  return <aside className="client-pulse-detail-panel"><header className="client-pulse-detail-panel__header"><h2>{summary.client.name}</h2><a className="client-pulse-detail-panel__open" href={`/admin/collections/clients/${summary.client.id}`}>Open client →</a></header><p>{summary.reasons.join(" · ") || "No risk reasons recorded."}</p><div className="client-pulse-detail-panel__scores"><ScorePill status={summary.scores.overall.status} label={summary.scores.overall.label} /><MetricChip label="Target" value={formatPercent(summary.target.progressPercent)} title="Progress against this client's configured primary target." /><MetricChip label="Last" value={summary.lastMeaningfulActivityAt ? formatDate(summary.lastMeaningfulActivityAt) : "Unknown"} title="Most recent meaningful client activity date." /></div><AdsTrendSection trend={summary.adsTrend} budgetPacing={summary.budgetPacing} hasGoogleAds={summary.client.hasGoogleAds} /><OrganicTrendSection trend={summary.organicTrend} /><ClickAnomalySection items={summary.clickAnomalies} /><AutomationPills items={summary.signals.automations} /><SignalSection title="Team actions" items={summary.signals.manualWork} /><SignalSection title="Scheduled tasks" items={summary.signals.scheduledTasks} /><SignalSection title="Recent activity" items={summary.signals.recentActivity} /></aside>;
}

function OrganicTrendSection({ trend }: { trend: ClientPulseSummary["organicTrend"] }) {
  if (!trend.month || trend.clicks === null) return null;
  const monthLabel = new Intl.DateTimeFormat("en-AU", { month: "short", year: "numeric" }).format(new Date(`${trend.month}-01T00:00:00Z`));
  return (
    <section>
      <h3>Organic search · {monthLabel}</h3>
      <div className="client-pulse-analytics-grid">
        <MetricChip label="Clicks" value={trend.clicks.toLocaleString("en-AU")} title="GSC clicks for the latest full calendar month." />
        <TrendChip label="MoM" value={trend.momPercent} title="Change vs the previous calendar month." />
        <TrendChip label="YoY" value={trend.yoyPercent} title="Change vs the same month last year." />
      </div>
    </section>
  );
}

function TrendChip({ label, value, title, invert = false }: { label: string; value: number | null; title?: string; invert?: boolean }) {
  const display = value === null ? "—" : `${value >= 0 ? "+" : ""}${value}%`;
  const positive = invert ? (value ?? 0) <= 0 : (value ?? 0) >= 0;
  const tone = value === null ? "" : positive ? " is-up" : " is-down";
  return <span className={`client-pulse-metric client-pulse-trend${tone}`} title={title}><strong>{display}</strong><small>{label}</small></span>;
}

function AdsTrendSection({ trend, budgetPacing, hasGoogleAds }: { trend: ClientPulseSummary["adsTrend"]; budgetPacing: ClientPulseSummary["budgetPacing"]; hasGoogleAds: boolean }) {
  const headingMonth = trend.mtdMonth ?? trend.month;
  if (!hasGoogleAds) {
    return <section><h3>Google Ads</h3><p className="client-pulse-muted">No Google Ads customer ID is saved for this client yet.</p></section>;
  }
  if (!headingMonth) {
    return <section><h3>Google Ads</h3><p className="client-pulse-muted">Google Ads is connected for this client, but no campaign data has been pulled into the CMS yet. Run the Google Ads data sync to backfill MTD and monthly data.</p><BudgetPacingSection pacing={budgetPacing} /></section>;
  }
  const monthLabel = new Intl.DateTimeFormat("en-AU", { month: "short", year: "numeric" }).format(new Date(`${headingMonth}-01T00:00:00Z`));
  return (
    <section>
      <h3>Google Ads · {monthLabel}</h3>
      {trend.mtdMonth ? <div className="client-pulse-analytics-grid">
        <MetricChip label="MTD traffic" value={trend.mtdClicks === null ? "—" : trend.mtdClicks.toLocaleString("en-AU")} title="Google Ads clicks month-to-date." />
        <TrendChip label="vs LY" value={trend.mtdClicksYoyPercent} title="MTD clicks compared with the same dates last year." />
        <MetricChip label="Conversions" value={trend.mtdConversions === null ? "—" : String(Math.round(trend.mtdConversions))} title="Google Ads conversions month-to-date." />
        <TrendChip label="vs LY" value={trend.mtdConversionsYoyPercent} title="MTD conversions compared with the same dates last year." />
      </div> : <p className="client-pulse-muted">No MTD Google Ads comparison snapshot yet.</p>}
      <BudgetPacingSection pacing={budgetPacing} />
      {trend.month ? <div className="client-pulse-analytics-grid client-pulse-analytics-grid--secondary">
        <MetricChip label="Last full month" value={trend.clicks === null ? "—" : trend.clicks.toLocaleString("en-AU")} title="Google Ads clicks for the latest full calendar month." />
        <TrendChip label="MoM" value={trend.clicksMomPercent} title="Clicks change vs the previous calendar month." />
        <MetricChip label="CPA" value={trend.cpa === null ? "—" : `$${trend.cpa.toLocaleString("en-AU")}`} title="Cost per acquisition (spend ÷ conversions) for the latest full calendar month." />
      </div> : null}
    </section>
  );
}

function BudgetPacingSection({ pacing }: { pacing: ClientPulseSummary["budgetPacing"] }) {
  return <div className="client-pulse-budget-pacing"><div className="client-pulse-budget-pacing__header"><ScorePill status={pacing.status} label={pacing.label} /><span>{pacing.monthProgressPercent === null ? "Month progress unknown" : `${pacing.monthProgressPercent}% of month elapsed`}</span></div><div className="client-pulse-analytics-grid client-pulse-analytics-grid--secondary"><MetricChip label="Budget" value={formatCurrency(pacing.monthlyBudget)} /><MetricChip label="MTD spend" value={formatCurrency(pacing.mtdSpend)} /><MetricChip label="Expected" value={formatCurrency(pacing.expectedSpendToDate)} /><MetricChip label="Diff" value={formatSignedCurrency(pacing.difference)} /></div>{pacing.deltaPercentPoints !== null ? <p className="client-pulse-muted">Spend is {Math.abs(pacing.deltaPercentPoints)} percentage points {pacing.deltaPercentPoints >= 0 ? "ahead of" : "below"} expected budget pace ({pacing.actualBudgetPercent}% used vs {pacing.expectedBudgetPercent}% expected).</p> : null}</div>;
}

function ClickAnomalySection({ items }: { items: ClientPulseSummary["clickAnomalies"] }) {
  if (items.length === 0) return null;
  return <section><h3>Click anomaly</h3><ul>{items.map((item) => <li key={item.id}><ScorePill status={item.status} label={item.label} /><span>{item.detail}</span></li>)}</ul></section>;
}

function AutomationPills({ items }: { items: SignalItem[] }) {
  if (items.length === 0) return null;
  return <section><h3>Automations</h3><div className="client-pulse-automation-pills">{items.map((item) => <span key={item.id} className={`client-pulse-pill is-${item.status}`} title={item.detail}>{item.label}</span>)}</div></section>;
}

function SignalSection({ title, items }: { title: string; items: SignalItem[] }) {
  return <section><h3>{title}</h3>{items.length > 0 ? <ul>{items.map((item) => <li key={item.id}><ScorePill status={item.status} label={item.label} /><span>{item.detail ?? ""}</span>{item.at ? <time>{formatDate(item.at)}</time> : null}</li>)}</ul> : <p className="client-pulse-muted">No signals found.</p>}</section>;
}

function sortSummaries(a: ClientPulseSummary, b: ClientPulseSummary): number {
  const rank: Record<ClientPulseScoreStatus, number> = { risk: 0, watch: 1, missing: 2, good: 3, not_in_scope: 4 };
  return rank[a.scores.overall.status] - rank[b.scores.overall.status] || a.client.name.localeCompare(b.client.name);
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function roundSvg(value: number): number {
  return Math.round(value * 10) / 10;
}

function formatPercent(value: number | null): string {
  return value === null ? "—" : `${clampPercent(value)}%`;
}

function formatTargetStatus(summary: ClientPulseSummary): string {
  if (summary.target.status === "not_configured" || summary.target.status === "missing_data") return "—";
  if (summary.target.status === "on_track") return "On track";
  if (summary.target.status === "watch") return "Watch";
  return "Behind";
}

function targetTone(summary: ClientPulseSummary): "good" | "bad" | "neutral" {
  if (summary.target.status === "on_track") return "good";
  if (summary.target.status === "at_risk") return "bad";
  return "neutral";
}

function formatBudgetPacing(summary: ClientPulseSummary): string {
  if (!summary.client.hasGoogleAds) return "No Ads";
  return summary.budgetPacing.label;
}

function budgetTone(status: ClientPulseScoreStatus): "good" | "bad" | "neutral" {
  if (status === "good") return "good";
  if (status === "risk") return "bad";
  return "neutral";
}

function formatCurrency(value: number | null): string {
  return value === null ? "—" : `$${Math.round(value).toLocaleString("en-AU")}`;
}

function formatSignedCurrency(value: number | null): string {
  if (value === null) return "—";
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}$${Math.abs(Math.round(value)).toLocaleString("en-AU")}`;
}

function formatTrendValue(value: number | null, hasGoogleAds: boolean): string {
  if (value === null) return hasGoogleAds ? "No data" : "No Ads";
  return `${value >= 0 ? "↑" : "↓"} ${Math.abs(value)}%`;
}

function trendTone(value: number | null): "good" | "bad" | "neutral" {
  if (value === null || value === 0) return "neutral";
  return value > 0 ? "good" : "bad";
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short" }).format(new Date(value));
}

export default ClientPulsePage;
