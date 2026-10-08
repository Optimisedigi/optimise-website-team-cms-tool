"use client";

/**
 * Read-only "Goal Baseline" panel for a goal-agent run. Shows the frozen
 * pre-run performance (conversions / traffic / spend / CPA), where spend was
 * allocated across campaigns, the three frozen baseline points (last week,
 * one month and three months before the run) and live progress since the run
 * started. Data comes from /api/goal-agents/baseline; no mutation surface
 * beyond the one-time baseline freeze that endpoint performs on first read.
 */
import { useEffect, useState } from "react";

import type {
  BaselineCampaignShare,
  BaselineMetrics,
  BaselinePoint,
  GoalRunBaseline,
} from "@/lib/goal-agents/baseline-shared";
import { percentChange } from "@/lib/goal-agents/baseline-shared";
import type { GoalRunProgress, RunTimeline } from "@/lib/goal-agents/progress-shared";
import { ChangesByHour, CpaProgressChart, RunStatusBar, type ChangeRow } from "./GoalProgressSections";

interface RunSummary {
  id: number;
  goal: string | null;
  status: string | null;
  createdAt: string;
  clientId: number;
  clientName: string | null;
  customerId: string;
  targetImprovementPercent: number | null;
  completedAt: string | null;
  nextCheckAt: string | null;
  measurementDays: number;
  enabledLevers: string[];
}

interface BaselineResponse {
  goalRun?: RunSummary;
  timeline?: RunTimeline;
  serverNow?: string;
  progress?: GoalRunProgress | null;
  baseline?: GoalRunBaseline | null;
  baselineError?: string | null;
  current?: {
    sinceStart: BaselinePoint | null;
    last7: BaselinePoint | null;
    errors: string[];
  };
  error?: string;
}

interface RunListItem {
  id: number;
  goal: string | null;
  status: string | null;
  createdAt: string | null;
  clientId: number | null;
  clientName: string | null;
  hasBaseline: boolean;
}

interface Props {
  clientId?: string;
  goalRunId?: string;
}

const CARD: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: 8,
  padding: 16,
  marginBottom: 16,
};

const MUTED: React.CSSProperties = { color: "#6b7280", fontSize: 12 };

// Account-currency amounts with a plain "$" prefix, matching the other Google
// Ads admin pages (the account currency isn't stored on the client).
const INT = new Intl.NumberFormat("en-AU", { maximumFractionDigits: 0 });
const ONE_DP = new Intl.NumberFormat("en-AU", { maximumFractionDigits: 1 });
const TWO_DP = new Intl.NumberFormat("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function fmtMoney(value: number | null, dp2 = false): string {
  if (value === null) return "—";
  return `$${dp2 ? TWO_DP.format(value) : INT.format(value)}`;
}

function fmtDate(ymd: string): string {
  const [y, m, d] = ymd.split("-");
  return `${d}/${m}/${y?.slice(2)}`;
}

function fmtRange(p: { start: string; end: string }): string {
  return `${fmtDate(p.start)} – ${fmtDate(p.end)}`;
}

/** Positive = better. CPA is inverted because lower is better. */
function deltaColor(delta: number | null, lowerIsBetter: boolean): string {
  if (delta === null || delta === 0) return "#6b7280";
  const good = lowerIsBetter ? delta < 0 : delta > 0;
  return good ? "#166534" : "#991b1b";
}

function fmtDelta(delta: number | null): string {
  if (delta === null) return "—";
  const sign = delta > 0 ? "+" : "";
  return `${sign}${ONE_DP.format(delta)}%`;
}

interface MetricRow {
  key: keyof BaselineMetrics;
  label: string;
  format: (v: number | null) => string;
  lowerIsBetter: boolean;
}

const METRIC_ROWS: MetricRow[] = [
  { key: "conversions", label: "Conversions", format: (v) => (v === null ? "—" : ONE_DP.format(v)), lowerIsBetter: false },
  { key: "cpa", label: "CPA", format: (v) => fmtMoney(v, true), lowerIsBetter: true },
  { key: "spend", label: "Spend", format: (v) => fmtMoney(v), lowerIsBetter: true },
  { key: "clicks", label: "Clicks", format: (v) => (v === null ? "—" : INT.format(v)), lowerIsBetter: false },
  { key: "impressions", label: "Impressions", format: (v) => (v === null ? "—" : INT.format(v)), lowerIsBetter: false },
  { key: "ctr", label: "CTR", format: (v) => (v === null ? "—" : `${ONE_DP.format(v)}%`), lowerIsBetter: false },
  { key: "conversionRate", label: "Conv. rate", format: (v) => (v === null ? "—" : `${ONE_DP.format(v)}%`), lowerIsBetter: false },
];

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }): React.ReactElement {
  return (
    <div style={{ flex: "1 1 140px", background: "#f9fafb", border: "1px solid #f3f4f6", borderRadius: 8, padding: 12 }}>
      <div style={MUTED}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 600, marginTop: 4 }}>{value}</div>
      {sub && <div style={{ ...MUTED, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function SpendAllocation({ campaigns, total }: { campaigns: BaselineCampaignShare[]; total: number }): React.ReactElement {
  if (campaigns.length === 0) return <p style={MUTED}>No in-scope campaigns had activity in this window.</p>;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(180px, 2fr) 3fr 90px 70px 90px", gap: "6px 12px", alignItems: "center", fontSize: 13 }}>
      <div style={MUTED}>Campaign</div>
      <div style={MUTED}>Share of spend</div>
      <div style={{ ...MUTED, textAlign: "right" }}>Spend</div>
      <div style={{ ...MUTED, textAlign: "right" }}>Conv.</div>
      <div style={{ ...MUTED, textAlign: "right" }}>CPA</div>
      {campaigns.map((c) => (
        <CampaignRow key={c.campaignId} c={c} />
      ))}
      <div style={{ fontWeight: 600 }}>Total</div>
      <div />
      <div style={{ textAlign: "right", fontWeight: 600 }}>{fmtMoney(total)}</div>
      <div />
      <div />
    </div>
  );
}

function CampaignRow({ c }: { c: BaselineCampaignShare }): React.ReactElement {
  return (
    <>
      <div title={c.campaignId} style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {c.name}
        {c.status !== "ENABLED" && <span style={{ ...MUTED, marginLeft: 6 }}>({c.status.toLowerCase()})</span>}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ flex: 1, height: 12, background: "#f3f4f6", borderRadius: 6, overflow: "hidden" }}>
          <div
            role="img"
            aria-label={`${c.spendSharePercent}% of spend`}
            style={{ width: `${Math.min(100, c.spendSharePercent)}%`, height: "100%", background: "#2563eb" }}
          />
        </div>
        <span style={{ width: 44, textAlign: "right", fontSize: 12 }}>{ONE_DP.format(c.spendSharePercent)}%</span>
      </div>
      <div style={{ textAlign: "right" }}>{fmtMoney(c.spend)}</div>
      <div style={{ textAlign: "right" }}>{ONE_DP.format(c.conversions)}</div>
      <div style={{ textAlign: "right" }}>{fmtMoney(c.cpa, true)}</div>
    </>
  );
}

function BaselineTable({ points, current }: { points: BaselinePoint[]; current: BaselineResponse["current"] }): React.ReactElement {
  // Oldest → newest, then the live columns.
  const ordered = [...points].sort((a, b) => b.offsetDays - a.offsetDays);
  const week = points.find((p) => p.key === "week") ?? null;
  const live: Array<{ label: string; point: BaselinePoint | null }> = [
    { label: "Since run started", point: current?.sinceStart ?? null },
    { label: "Latest 7 days", point: current?.last7 ?? null },
  ];
  const th: React.CSSProperties = { textAlign: "right", padding: "6px 8px", borderBottom: "1px solid #e5e7eb", fontWeight: 600, fontSize: 12, whiteSpace: "nowrap" };
  const td: React.CSSProperties = { textAlign: "right", padding: "6px 8px", borderBottom: "1px solid #f3f4f6", fontSize: 13, whiteSpace: "nowrap" };
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr>
            <th style={{ ...th, textAlign: "left" }}>Metric</th>
            {ordered.map((p) => (
              <th key={p.key} style={th}>
                {p.label.replace(" before run", "")}
                <div style={{ ...MUTED, fontWeight: 400 }}>{fmtRange(p)}</div>
              </th>
            ))}
            {live.map((l) => (
              <th key={l.label} style={{ ...th, background: "#eff6ff" }}>
                {l.label}
                <div style={{ ...MUTED, fontWeight: 400 }}>{l.point ? fmtRange(l.point) : "unavailable"}</div>
              </th>
            ))}
            <th style={{ ...th, background: "#eff6ff" }}>
              Latest 7d vs last week
              <div style={{ ...MUTED, fontWeight: 400 }}>progress</div>
            </th>
          </tr>
        </thead>
        <tbody>
          {METRIC_ROWS.map((row) => {
            const baseValue = week ? week.metrics[row.key] : null;
            const liveValue = current?.last7 ? current.last7.metrics[row.key] : null;
            const delta = percentChange(baseValue, liveValue);
            return (
              <tr key={row.key}>
                <td style={{ ...td, textAlign: "left", fontWeight: 500 }}>{row.label}</td>
                {ordered.map((p) => (
                  <td key={p.key} style={td}>{row.format(p.metrics[row.key])}</td>
                ))}
                {live.map((l) => (
                  <td key={l.label} style={{ ...td, background: "#f8fbff" }}>
                    {l.point ? row.format(l.point.metrics[row.key]) : "—"}
                  </td>
                ))}
                <td style={{ ...td, background: "#f8fbff", color: deltaColor(delta, row.lowerIsBetter), fontWeight: 600 }}>
                  {fmtDelta(delta)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function RunPicker(): React.ReactElement {
  const [runs, setRuns] = useState<RunListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/goal-agents/baseline", { signal: controller.signal, credentials: "include" })
      .then(async (res) => {
        const json = (await res.json()) as { runs?: RunListItem[]; error?: string };
        if (!res.ok || json.error) throw new Error(json.error ?? `HTTP ${res.status}`);
        setRuns(json.runs ?? []);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : String(err));
      });
    return () => controller.abort();
  }, []);
  if (error) return <p style={{ color: "#991b1b" }}>{error}</p>;
  if (!runs) return <p style={MUTED}>Loading goal runs…</p>;
  if (runs.length === 0) return <p style={MUTED}>No goal runs exist yet.</p>;
  return (
    <div style={CARD}>
      <h2 style={{ fontSize: 16, margin: "0 0 10px" }}>Pick a goal run</h2>
      <p style={{ ...MUTED, margin: "0 0 10px" }}>Click a run to open its baseline. The first open captures and freezes it.</p>
      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {runs.map((r) => (
          <li key={r.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
            <a
              href={`/admin/google-ads/goal-baseline?goalRunId=${r.id}`}
              style={{
                display: "flex",
                gap: 10,
                alignItems: "center",
                flexWrap: "wrap",
                padding: "10px 8px",
                textDecoration: "none",
                color: "inherit",
                borderRadius: 6,
                cursor: "pointer",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "#f3f4f6"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            >
              <span style={{ fontWeight: 600 }}>{r.clientName ?? `Client #${r.clientId ?? "?"}`}</span>
              <span style={MUTED}>{r.goal}</span>
              <span style={MUTED}>{r.status}</span>
              {r.createdAt && <span style={MUTED}>started {new Date(r.createdAt).toLocaleDateString()}</span>}
              <span style={{ ...MUTED, marginLeft: "auto" }}>{r.hasBaseline ? "baseline frozen" : "baseline not yet captured"}</span>
              <span style={{ color: "#2563eb", fontWeight: 600, whiteSpace: "nowrap" }}>
                {r.hasBaseline ? "View baseline →" : "Capture baseline →"}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function GoalBaselinePanel({ clientId, goalRunId }: Props): React.ReactElement {
  const [data, setData] = useState<BaselineResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(clientId || goalRunId));

  useEffect(() => {
    if (!clientId && !goalRunId) return;
    const controller = new AbortController();
    const qs = new URLSearchParams();
    if (goalRunId) qs.set("goalRunId", goalRunId);
    else if (clientId) qs.set("clientId", clientId);
    setLoading(true);
    fetch(`/api/goal-agents/baseline?${qs.toString()}`, { signal: controller.signal, credentials: "include" })
      .then(async (res) => {
        const json = (await res.json()) as BaselineResponse;
        if (!res.ok || json.error) throw new Error(json.error ?? `HTTP ${res.status}`);
        setData(json);
        setError(null);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [clientId, goalRunId]);

  const runId = data?.goalRun?.id ?? null;
  const [changes, setChanges] = useState<ChangeRow[]>([]);
  const [changesLoading, setChangesLoading] = useState(false);
  const [changesError, setChangesError] = useState<string | null>(null);
  useEffect(() => {
    if (runId === null) return;
    const controller = new AbortController();
    setChangesLoading(true);
    fetch(`/api/goal-agents/changes?goalRunId=${runId}`, { signal: controller.signal, credentials: "include" })
      .then(async (res) => {
        const json = (await res.json()) as { approved?: ChangeRow[]; disapproved?: ChangeRow[]; error?: string };
        if (!res.ok || json.error) throw new Error(json.error ?? `HTTP ${res.status}`);
        setChanges([...(json.approved ?? []), ...(json.disapproved ?? [])]);
        setChangesError(null);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setChangesError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!controller.signal.aborted) setChangesLoading(false);
      });
    return () => controller.abort();
  }, [runId]);

  if (!clientId && !goalRunId) return <RunPicker />;
  if (loading) return <p style={MUTED}>Loading baseline — the first open pulls three windows from Google Ads and freezes them…</p>;
  if (error) return <p style={{ color: "#991b1b" }}>{error}</p>;
  if (!data?.goalRun) return <p style={MUTED}>No data.</p>;

  const { goalRun, baseline, baselineError, current, progress, serverNow } = data;
  const week = baseline?.points.find((p) => p.key === "week") ?? null;
  const scope = baseline?.scope.includedCampaignIds ?? null;
  const noChangesYet = !changesLoading && !changesError && changes.filter((c) => c.action !== "create_account_efficiency_goal_run").length === 0;

  return (
    <div>
      <div style={{ ...CARD, display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 600 }}>{goalRun.clientName ?? `Client #${goalRun.clientId}`}</div>
          <div style={MUTED}>
            {goalRun.goal} · run #{goalRun.id} · {goalRun.status} · started {new Date(goalRun.createdAt).toLocaleDateString()}
            {goalRun.targetImprovementPercent !== null && ` · target CPA improvement ${goalRun.targetImprovementPercent}%`}
          </div>
          <div style={MUTED}>
            Scope: {scope ? `${scope.length} campaign${scope.length === 1 ? "" : "s"} in includedCampaignIds` : "whole account (no includedCampaignIds)"}
            {baseline && ` · baseline frozen ${new Date(baseline.frozenAt).toLocaleString()}`}
          </div>
        </div>
        <a href={`/admin/goal-changes?goalRunId=${goalRun.id}`} style={{ marginLeft: "auto", fontSize: 13 }}>
          View applied changes →
        </a>
      </div>

      <div style={CARD}>
        <h2 style={{ fontSize: 16, margin: "0 0 10px" }}>Run status</h2>
        <RunStatusBar
          status={goalRun.status}
          createdAt={goalRun.createdAt}
          completedAt={goalRun.completedAt}
          nextCheckAt={goalRun.nextCheckAt}
          measurementDays={goalRun.measurementDays}
          enabledLevers={goalRun.enabledLevers}
          serverNow={serverNow}
        />
        {goalRun.status === "complete" && noChangesYet && (
          <p style={{ margin: "10px 0 0", fontSize: 13, color: "#92400e", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 6, padding: "8px 10px" }}>
            This run completed without making any changes, so there is nothing for the chart to measure. Start a new run (e.g. with more levers enabled) to track progress.
          </p>
        )}
      </div>

      <div style={CARD}>
        <h2 style={{ fontSize: 16, margin: "0 0 2px" }}>CPA since the run started</h2>
        <p style={{ ...MUTED, margin: "0 0 12px" }}>One point per day, recorded by the 04:00 UTC snapshots cron. Line is the trailing 7-day CPA; dashed lines are the frozen baseline and the target.</p>
        <CpaProgressChart
          progress={progress ?? null}
          baselineCpa={week?.metrics.cpa ?? null}
          targetImprovementPercent={goalRun.targetImprovementPercent}
        />
      </div>

      {baselineError && (
        <div style={{ ...CARD, borderColor: "#fecaca", background: "#fef2f2", color: "#991b1b" }}>
          Baseline could not be captured, so nothing was frozen. Reload to retry. {baselineError}
        </div>
      )}
      {current && current.errors.length > 0 && (
        <div style={{ ...CARD, borderColor: "#fde68a", background: "#fffbeb", color: "#92400e" }}>
          Live progress partially unavailable: {current.errors.join("; ")}
        </div>
      )}

      {week && (
        <div style={CARD}>
          <h2 style={{ fontSize: 16, margin: "0 0 2px" }}>Performance before the run</h2>
          <p style={{ ...MUTED, margin: "0 0 12px" }}>7 days immediately before the run started ({fmtRange(week)}), {week.campaignCount} in-scope campaign{week.campaignCount === 1 ? "" : "s"}.</p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <StatCard label="Conversions" value={ONE_DP.format(week.metrics.conversions)} sub={`${ONE_DP.format(week.metrics.conversionRate)}% conv. rate`} />
            <StatCard label="CPA" value={fmtMoney(week.metrics.cpa, true)} />
            <StatCard label="Spend" value={fmtMoney(week.metrics.spend)} sub={`${fmtMoney(week.metrics.spend / 7)}/day`} />
            <StatCard label="Clicks" value={INT.format(week.metrics.clicks)} sub={`${ONE_DP.format(week.metrics.ctr)}% CTR`} />
            <StatCard label="Impressions" value={INT.format(week.metrics.impressions)} />
          </div>
        </div>
      )}

      {week && (
        <div style={CARD}>
          <h2 style={{ fontSize: 16, margin: "0 0 2px" }}>Where spend was allocated</h2>
          <p style={{ ...MUTED, margin: "0 0 12px" }}>Share of in-scope spend per campaign in the 7 days before the run.</p>
          <SpendAllocation campaigns={week.campaigns} total={week.metrics.spend} />
        </div>
      )}

      {baseline && (
        <div style={CARD}>
          <h2 style={{ fontSize: 16, margin: "0 0 2px" }}>Baseline points vs progress</h2>
          <p style={{ ...MUTED, margin: "0 0 12px" }}>
            Three frozen 7-day windows before the run (like-for-like), then live windows fetched now. Progress compares the latest 7 days against the week before the run.
          </p>
          <BaselineTable points={baseline.points} current={current} />
        </div>
      )}

      <div style={CARD}>
        <h2 style={{ fontSize: 16, margin: "0 0 2px" }}>Changes by hour</h2>
        <p style={{ ...MUTED, margin: "0 0 12px" }}>Every action the agent recorded for this run, grouped by the hourly cron tick. Newest first.</p>
        <ChangesByHour rows={changes} loading={changesLoading} error={changesError} />
      </div>
    </div>
  );
}
