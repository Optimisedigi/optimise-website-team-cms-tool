"use client";

/**
 * Live progress sections for the Goal Baseline page:
 *   - RunStatusBar     — status pill, elapsed/remaining, measurement-cycle bar
 *                        (ticks every second client-side).
 *   - CpaProgressChart — inline SVG line chart: trailing-7 CPA + daily CPA dots
 *                        vs the frozen baseline and target lines.
 *   - ChangesByHour    — every goal-run-snapshot row grouped into hourly
 *                        buckets (the goal-agent cron runs hourly).
 */
import { useEffect, useMemo, useState } from "react";

import {
  buildCpaChartSeries,
  formatDuration,
  groupByHour,
  runTimeline,
  type GoalRunProgress,
  type RunTimeline,
} from "@/lib/goal-agents/progress-shared";

const MUTED: React.CSSProperties = { color: "#6b7280", fontSize: 12 };
const TWO_DP = new Intl.NumberFormat("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const ONE_DP = new Intl.NumberFormat("en-AU", { maximumFractionDigits: 1 });

const STATUS_COLOURS: Record<string, { bg: string; fg: string }> = {
  awaiting_data: { bg: "#f3f4f6", fg: "#374151" },
  analysing: { bg: "#dbeafe", fg: "#1e40af" },
  pending_approval: { bg: "#fef3c7", fg: "#92400e" },
  executing: { bg: "#dbeafe", fg: "#1e40af" },
  measuring: { bg: "#e0e7ff", fg: "#3730a3" },
  complete: { bg: "#dcfce7", fg: "#166534" },
  failed: { bg: "#fee2e2", fg: "#991b1b" },
};

export function StatusPill({ status }: { status: string | null }): React.ReactElement {
  const key = status ?? "unknown";
  const colours = STATUS_COLOURS[key] ?? { bg: "#f3f4f6", fg: "#374151" };
  return (
    <span style={{ background: colours.bg, color: colours.fg, fontSize: 12, fontWeight: 600, padding: "2px 8px", borderRadius: 999, textTransform: "uppercase", letterSpacing: 0.3 }}>
      {key.replace(/_/g, " ")}
    </span>
  );
}

/** Re-renders once a second so elapsed/remaining tick live. */
function useNow(serverNow: string | undefined): Date {
  // Correct for client clock skew by anchoring to the server's "now".
  const offset = useMemo(() => (serverNow ? new Date(serverNow).getTime() - Date.now() : 0), [serverNow]);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, []);
  void tick;
  return new Date(Date.now() + offset);
}

export function RunStatusBar(props: {
  status: string | null;
  createdAt: string;
  completedAt: string | null;
  nextCheckAt: string | null;
  measurementDays: number;
  enabledLevers: string[];
  serverNow?: string;
}): React.ReactElement {
  const now = useNow(props.serverNow);
  const t: RunTimeline = runTimeline({
    createdAt: props.createdAt,
    completedAt: props.completedAt,
    status: props.status,
    measurementDays: props.measurementDays,
    now,
  });
  const nextCheck = props.nextCheckAt ? new Date(props.nextCheckAt) : null;
  const nextCheckIn = nextCheck ? nextCheck.getTime() - now.getTime() : null;
  const barColour = t.isFinished ? (props.status === "failed" ? "#dc2626" : "#16a34a") : "#2563eb";

  return (
    <div>
      <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
        <StatusPill status={props.status} />
        <span style={{ fontSize: 13 }}>
          <strong>Elapsed</strong> {formatDuration(t.elapsedMs)}
        </span>
        <span style={{ fontSize: 13 }}>
          <strong>{t.isFinished ? "Cycle ended" : "Cycle ends in"}</strong>{" "}
          {t.isFinished ? new Date(t.cycleEndsAt).toLocaleDateString() : formatDuration(t.remainingMs)}
        </span>
        {!t.isFinished && (
          <span style={{ fontSize: 13 }}>
            <strong>Next agent check</strong>{" "}
            {nextCheck === null ? "—" : nextCheckIn !== null && nextCheckIn > 0 ? `in ${formatDuration(nextCheckIn)}` : "due now (hourly cron)"}
          </span>
        )}
        <span style={{ ...MUTED, marginLeft: "auto" }}>
          levers: {props.enabledLevers.length > 0 ? props.enabledLevers.join(", ") : "—"}
        </span>
      </div>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={t.percentComplete}
        aria-label={`${t.percentComplete}% of the ${t.measurementDays}-day measurement cycle elapsed`}
        style={{ height: 14, background: "#f3f4f6", borderRadius: 7, overflow: "hidden", position: "relative" }}
      >
        <div style={{ width: `${t.percentComplete}%`, height: "100%", background: barColour, transition: "width 1s linear" }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
        <span style={MUTED}>Started {new Date(t.startedAt).toLocaleString()}</span>
        <span style={MUTED}>{ONE_DP.format(t.percentComplete)}% of {t.measurementDays}-day measurement cycle</span>
        <span style={MUTED}>Ends {new Date(t.cycleEndsAt).toLocaleString()}</span>
      </div>
      {props.completedAt && (
        <p style={{ ...MUTED, margin: "6px 0 0" }}>
          Run marked {props.status} at {new Date(props.completedAt).toLocaleString()}. Progress points keep recording for 14 days after completion.
        </p>
      )}
    </div>
  );
}

const W = 760;
const H = 240;
const PAD = { top: 16, right: 24, bottom: 36, left: 56 };

function shortDate(ymd: string): string {
  const [, m, d] = ymd.split("-");
  return `${d}/${m}`;
}

export function CpaProgressChart(props: {
  progress: GoalRunProgress | null;
  baselineCpa: number | null;
  targetImprovementPercent: number | null;
}): React.ReactElement {
  const series = useMemo(() => buildCpaChartSeries(props), [props]);
  const dates = series.trailing.map((p) => p.date);
  const n = dates.length;

  if (n === 0) {
    return (
      <p style={MUTED}>
        No daily points yet. The first point is recorded by the 04:00 UTC snapshots cron the day after the run starts.
        {series.baselineCpa !== null && ` Baseline CPA $${TWO_DP.format(series.baselineCpa)}`}
        {series.targetCpa !== null && ` · target $${TWO_DP.format(series.targetCpa)}`}.
      </p>
    );
  }

  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const x = (i: number): number => PAD.left + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const y = (v: number): number => PAD.top + innerH - (v / series.yMax) * innerH;

  const path = series.trailing
    .map((p, i) => (p.cpa === null ? null : `${i === 0 || series.trailing[i - 1]?.cpa === null ? "M" : "L"}${x(i).toFixed(1)},${y(p.cpa).toFixed(1)}`))
    .filter((s): s is string => s !== null)
    .join(" ");

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * series.yMax);
  const labelEvery = Math.max(1, Math.ceil(n / 8));
  const changeColour = series.changePercent === null ? "#6b7280" : series.changePercent < 0 ? "#166534" : "#991b1b";

  return (
    <div>
      <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginBottom: 8, fontSize: 13 }}>
        <span><strong>Latest 7-day CPA</strong> {series.latestCpa === null ? "—" : `$${TWO_DP.format(series.latestCpa)}`}</span>
        <span><strong>Baseline</strong> {series.baselineCpa === null ? "—" : `$${TWO_DP.format(series.baselineCpa)}`}</span>
        <span><strong>Target</strong> {series.targetCpa === null ? "—" : `$${TWO_DP.format(series.targetCpa)}`}</span>
        <span style={{ color: changeColour, fontWeight: 600 }}>
          {series.changePercent === null ? "" : `${series.changePercent > 0 ? "+" : ""}${ONE_DP.format(series.changePercent)}% vs baseline`}
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="CPA since the run started versus baseline and target" style={{ maxWidth: W, display: "block" }}>
        {yTicks.map((v) => (
          <g key={v}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} stroke="#f3f4f6" />
            <text x={PAD.left - 6} y={y(v) + 4} fontSize={10} fill="#6b7280" textAnchor="end">${Math.round(v)}</text>
          </g>
        ))}
        {series.baselineCpa !== null && (
          <g>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(series.baselineCpa)} y2={y(series.baselineCpa)} stroke="#9ca3af" strokeDasharray="4 4" />
            <text x={W - PAD.right} y={y(series.baselineCpa) - 4} fontSize={10} fill="#6b7280" textAnchor="end">baseline</text>
          </g>
        )}
        {series.targetCpa !== null && (
          <g>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(series.targetCpa)} y2={y(series.targetCpa)} stroke="#16a34a" strokeDasharray="4 4" />
            <text x={W - PAD.right} y={y(series.targetCpa) - 4} fontSize={10} fill="#166534" textAnchor="end">target</text>
          </g>
        )}
        {path && <path d={path} fill="none" stroke="#2563eb" strokeWidth={2} />}
        {series.daily.map((p, i) =>
          p.cpa === null ? null : <circle key={p.date} cx={x(i)} cy={y(p.cpa)} r={2.5} fill="#93c5fd" />,
        )}
        {series.trailing.map((p, i) =>
          p.cpa === null ? null : (
            <circle key={p.date} cx={x(i)} cy={y(p.cpa)} r={3.5} fill="#2563eb">
              <title>{`${p.date}: 7-day CPA $${TWO_DP.format(p.cpa)}`}</title>
            </circle>
          ),
        )}
        {dates.map((d, i) =>
          i % labelEvery === 0 || i === n - 1 ? (
            <text key={d} x={x(i)} y={H - PAD.bottom + 16} fontSize={10} fill="#6b7280" textAnchor="middle">{shortDate(d)}</text>
          ) : null,
        )}
      </svg>
      <div style={{ ...MUTED, display: "flex", gap: 14, marginTop: 4 }}>
        <span><span style={{ display: "inline-block", width: 10, height: 10, background: "#2563eb", borderRadius: 5, marginRight: 4 }} />7-day trailing CPA</span>
        <span><span style={{ display: "inline-block", width: 8, height: 8, background: "#93c5fd", borderRadius: 4, marginRight: 4 }} />single-day CPA</span>
        <span>Days with zero conversions have no CPA and leave a gap.</span>
      </div>
    </div>
  );
}

export interface ChangeRow {
  id: number;
  step: number | null;
  action: string;
  status: string;
  riskTier: string | null;
  campaignIds: string[];
  reason: string;
  createdAt: string | null;
}

export function ChangesByHour({ rows, loading, error }: { rows: ChangeRow[]; loading: boolean; error: string | null }): React.ReactElement {
  const buckets = useMemo(() => groupByHour(rows), [rows]);
  if (loading) return <p style={MUTED}>Loading changes…</p>;
  if (error) return <p style={{ color: "#991b1b" }}>{error}</p>;
  if (buckets.length === 0) return <p style={MUTED}>The agent has not recorded any actions for this run yet.</p>;
  return (
    <div>
      {buckets.map((b) => {
        const start = new Date(b.hour);
        const end = new Date(start.getTime() + 3_600_000);
        return (
          <div key={b.hour} style={{ display: "grid", gridTemplateColumns: "150px 1fr", gap: 12, padding: "8px 0", borderBottom: "1px solid #f3f4f6" }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 13 }}>
                {start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}–{end.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </div>
              <div style={MUTED}>{start.toLocaleDateString()}</div>
              <div style={MUTED}>{b.items.length} action{b.items.length === 1 ? "" : "s"}</div>
            </div>
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 6 }}>
              {b.items.map((r) => (
                <li key={r.id} style={{ fontSize: 13, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "baseline" }}>
                  <span style={MUTED}>{r.createdAt ? new Date(r.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}</span>
                  <span style={{ fontWeight: 600 }}>{r.action}</span>
                  <StatusPill status={r.status} />
                  {r.riskTier && <span style={MUTED}>{r.riskTier}</span>}
                  {r.campaignIds.length > 0 && <span style={MUTED}>{r.campaignIds.length} campaign{r.campaignIds.length === 1 ? "" : "s"}</span>}
                  <span style={{ flexBasis: "100%", color: "#374151" }}>{r.reason}</span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
