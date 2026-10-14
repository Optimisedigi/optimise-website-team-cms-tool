"use client";

import { useState } from "react";

import type { AccountGlanceData } from "./payload";

/**
 * Evidence-driven "Account at a glance" chart: monthly spend bars with a
 * cost-per-lead (or conversions) line, drawn from the audit's own data.
 * Same visual language as the original hand-authored AccountGlanceChart, but
 * every axis, label and call-out is computed from the payload.
 */

const W = 960;
const X_LEFT = 100;
const X_RIGHT = 820;
const Y_TOP = 30;
const Y_BOTTOM = 300;

type View = "cpl" | "convs";

/** Axis maximum whose four gridline steps are round numbers. */
function niceMax(value: number): number {
  if (value <= 0) return 4;
  const rawStep = value / 4;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  for (const step of [1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 6, 7.5, 8, 10]) {
    if (step * magnitude >= rawStep) return step * magnitude * 4;
  }
  return 40 * magnitude;
}

function scaleY(value: number, max: number): number {
  return Y_BOTTOM - (Math.min(value, max) / max) * (Y_BOTTOM - Y_TOP);
}

function compactMoney(value: number, symbol: string): string {
  if (value <= 0) return `${symbol}0`;
  const trim = (n: number) => n.toFixed(1).replace(/\.0$/, "");
  if (value >= 1_000_000) return `${symbol}${trim(value / 1_000_000)}M`;
  if (value >= 1000) return `${symbol}${trim(value / 1000)}K`;
  return `${symbol}${Math.round(value)}`;
}

function fullMoney(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-AU", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
  } catch {
    return `$${Math.round(value).toLocaleString("en-AU")}`;
  }
}

function currencySymbol(currency: string): string {
  try {
    const part = new Intl.NumberFormat("en-AU", { style: "currency", currency, currencyDisplay: "narrowSymbol" })
      .formatToParts(0)
      .find((p) => p.type === "currency");
    return part?.value ?? "$";
  } catch {
    return "$";
  }
}

function formatCount(value: number, digits = 0): string {
  return value.toLocaleString("en-AU", { maximumFractionDigits: digits });
}

export default function MonthlyPerformanceChart({ data }: { data: AccountGlanceData }) {
  const hasConversions = data.totals.conversions > 0;
  const [view, setView] = useState<View>("cpl");
  const currency = data.currencyCode || "AUD";
  const symbol = currencySymbol(currency);
  const months = data.months;
  const n = months.length;

  const slot = (X_RIGHT - X_LEFT) / Math.max(n, 1);
  const barW = Math.min(36, slot * 0.62);
  const xs = months.map((_, i) => X_LEFT + slot * (i + 0.5));

  const spendMax = niceMax(Math.max(...months.map((m) => m.spend), 1));
  // Part months are left off the line, so they don't set the CPL scale either.
  const cplValues = months.filter((m) => m.cpl != null && !m.partial).map((m) => m.cpl as number);
  const cplMax = niceMax(Math.max(...cplValues, 1));
  const convMax = niceMax(Math.max(...months.map((m) => m.conversions), 1));
  const rightMax = view === "cpl" ? cplMax : convMax;
  const ticks = [0, 0.25, 0.5, 0.75, 1];

  const linePoints = months
    .map((m, i) => {
      const value = view === "cpl" ? m.cpl : m.conversions;
      if (value == null || m.partial) return null;
      return { x: xs[i], y: scaleY(value, rightMax), value, m };
    })
    .filter((p): p is { x: number; y: number; value: number; m: (typeof months)[number] } => p !== null);

  const lineColour = view === "cpl" ? "rgb(139,92,246)" : "rgb(234,88,12)";
  const lineLabelColour = view === "cpl" ? "rgb(109,40,217)" : "rgb(194,65,12)";
  const labelEvery = n > 12 ? 2 : 1;

  return (
    <>
      <div className="max-w-4xl mx-auto w-full">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
          <StatCard label="Total spend" value={fullMoney(data.totals.spend, currency)} sub={`${n} month${n === 1 ? "" : "s"}`} />
          <StatCard label="Total clicks" value={formatCount(data.totals.clicks)} sub="all channels" />
          <StatCard label="Conversions" value={formatCount(data.totals.conversions, 1)} sub="primary actions" />
          <StatCard label="Cost per lead" value={data.totals.cpl == null ? "–" : fullMoney(data.totals.cpl, currency)} sub={data.periodLabel} />
        </div>
      </div>

      <div className="px-4 pb-2">
        <div className="bg-white rounded-lg p-3 border border-slate-200">
          <div className="flex items-center justify-between mb-1 gap-2 flex-wrap">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Monthly performance</span>
            {hasConversions && (
              <button
                type="button"
                onClick={() => setView(view === "cpl" ? "convs" : "cpl")}
                className="text-xs font-medium px-3 py-1.5 rounded border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 transition-colors"
              >
                {view === "cpl" ? "Switch to Conversions" : "Switch to Cost per lead"}
              </button>
            )}
          </div>

          <svg viewBox={`0 0 ${W} 365`} className="w-full h-auto" xmlns="http://www.w3.org/2000/svg" role="img" aria-label={`Monthly spend${hasConversions ? " and cost per lead" : ""}, ${data.periodLabel}`}>
            {ticks.map((t) => {
              const y = Y_BOTTOM - t * (Y_BOTTOM - Y_TOP);
              return (
                <g key={t}>
                  <line x1={X_LEFT} x2={X_RIGHT} y1={y} y2={y} stroke="rgb(226,232,240)" strokeDasharray="2,3" strokeWidth="0.75" />
                  <text x={X_LEFT - 8} y={y + 3} fontSize="9" fill="rgb(37,99,235)" textAnchor="end" fontWeight="700">{compactMoney(spendMax * t, symbol)}</text>
                  {hasConversions && (
                    <text x={X_RIGHT + 8} y={y + 3} fontSize="9" fill={lineLabelColour} textAnchor="start" fontWeight="700">
                      {view === "cpl" ? compactMoney(cplMax * t, symbol) : formatCount(convMax * t, 1)}
                    </text>
                  )}
                </g>
              );
            })}

            {months.map((m, i) =>
              m.partial ? (
                <g key={`partial-${m.month}`}>
                  <rect x={xs[i] - slot / 2} y={Y_TOP} width={slot} height={Y_BOTTOM - Y_TOP} fill="rgb(241,245,249)" opacity="0.7" />
                  <text x={xs[i]} y={Y_TOP + 12} textAnchor="middle" fontSize="8" fill="rgb(100,116,139)" fontWeight="600">part month</text>
                </g>
              ) : null,
            )}

            <line x1={X_LEFT} x2={X_LEFT} y1={Y_TOP} y2={Y_BOTTOM} stroke="rgb(71,85,105)" strokeWidth="1.25" />
            {hasConversions && <line x1={X_RIGHT} x2={X_RIGHT} y1={Y_TOP} y2={Y_BOTTOM} stroke="rgb(71,85,105)" strokeWidth="1.25" />}
            <line x1={X_LEFT} x2={X_RIGHT} y1={Y_BOTTOM} y2={Y_BOTTOM} stroke="rgb(71,85,105)" strokeWidth="1.25" />

            {months.map((m, i) => {
              const h = (m.spend / spendMax) * (Y_BOTTOM - Y_TOP);
              return (
                <g key={`bar-${m.month}`}>
                  <rect x={xs[i] - barW / 2} y={Y_BOTTOM - h} width={barW} height={Math.max(h, 0)} fill="rgb(37,99,235)" opacity={m.partial ? 0.35 : 0.75} rx="1">
                    <title>{`${m.label}: ${fullMoney(m.spend, currency)} spend · ${formatCount(m.clicks)} clicks · ${formatCount(m.conversions, 1)} conversions`}</title>
                  </rect>
                  {m.spend > 0 && (
                    <text x={xs[i]} y={Y_BOTTOM - h - 4} textAnchor="middle" fontSize="8" fill="rgb(30,58,138)" fontWeight="700">{compactMoney(m.spend, symbol)}</text>
                  )}
                </g>
              );
            })}

            {hasConversions && linePoints.length > 1 && (
              <polyline points={linePoints.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")} fill="none" stroke={lineColour} strokeWidth="2" strokeDasharray="4,2" strokeLinejoin="round" />
            )}
            {hasConversions &&
              linePoints.map((p) => {
                // Keep the line label clear of this month's spend label.
                const spendLabelY = Y_BOTTOM - (p.m.spend / spendMax) * (Y_BOTTOM - Y_TOP) - 4;
                let labelY = p.y - 7;
                if (Math.abs(labelY - spendLabelY) < 10) labelY = Math.min(labelY, spendLabelY) - 10;
                if (labelY < Y_TOP - 4) labelY = p.y + 14;
                return (
                  <g key={`pt-${p.m.month}`}>
                    <circle cx={p.x} cy={p.y} r="2.75" fill={lineColour}>
                      <title>{view === "cpl" ? `${p.m.label}: ${fullMoney(p.value, currency)} cost per lead` : `${p.m.label}: ${formatCount(p.value, 1)} conversions`}</title>
                    </circle>
                    <text x={p.x} y={labelY} textAnchor="middle" fontSize="8" fill={lineLabelColour} fontWeight="700">
                      {view === "cpl" ? compactMoney(p.value, symbol) : formatCount(p.value, 1)}
                    </text>
                  </g>
                );
              })}

            {months.map((m, i) =>
              i % labelEvery === 0 || i === n - 1 ? (
                <text key={`lbl-${m.month}`} x={xs[i]} y="320" textAnchor="middle" fontSize="9" fill="rgb(71,85,105)" fontWeight="500" transform={`rotate(-45 ${xs[i].toFixed(1)} 320)`}>
                  {m.label}
                </text>
              ) : null,
            )}

            <text x="28" y="165" fontSize="10" fontWeight="700" textAnchor="middle" transform="rotate(-90 28 165)" fill="rgb(37,99,235)">{`Spend (${currency})`}</text>
            {hasConversions && (
              <text x="930" y="165" fontSize="10" fontWeight="700" textAnchor="middle" transform="rotate(90 930 165)" fill={lineColour}>
                {view === "cpl" ? `Cost per lead (${currency})` : "Conversions"}
              </text>
            )}
            <text x="460" y="354" textAnchor="middle" fontSize="10" fill="rgb(51,65,85)" fontWeight="700">Month</text>

            <g>
              <rect x={X_LEFT} y="8" width="12" height="8" fill="rgb(37,99,235)" opacity="0.75" rx="1" />
              <text x={X_LEFT + 18} y="15" fontSize="9.5" fill="rgb(51,65,85)" fontWeight="600">Spend (bars)</text>
              {hasConversions && (
                <>
                  <line x1={X_LEFT + 100} x2={X_LEFT + 114} y1="12" y2="12" stroke={lineColour} strokeWidth="2" strokeDasharray="4,2" />
                  <circle cx={X_LEFT + 107} cy="12" r="2.75" fill={lineColour} />
                  <text x={X_LEFT + 120} y="15" fontSize="9.5" fill="rgb(51,65,85)" fontWeight="600">{view === "cpl" ? "Cost per lead" : "Conversions"}</text>
                </>
              )}
            </g>
          </svg>

          {data.notes.length > 0 && (
            <div className="mt-2 rounded border border-slate-200 bg-slate-50 px-3 py-2 space-y-1">
              {data.notes.map((note) => (
                <p key={note} className="text-xs text-slate-500 italic">{note}</p>
              ))}
            </div>
          )}

          {data.callouts.length > 0 && (
            <details className="mt-2 rounded border border-rose-200 bg-rose-50/60 group">
              <summary className="flex items-center justify-between px-3 py-2 cursor-pointer list-none select-none">
                <span className="text-xs font-semibold uppercase tracking-wider text-rose-700">Months that stood out</span>
                <span className="text-[10px] font-medium text-rose-700 group-open:hidden">Show details ▾</span>
                <span className="text-[10px] font-medium text-rose-700 hidden group-open:inline">Hide ▴</span>
              </summary>
              <div className="px-3 pb-3 space-y-2">
                {data.callouts.map((c) => (
                  <div key={c.label} className="rounded border border-rose-200 bg-white p-2">
                    <div className="text-[11px] font-semibold text-rose-700">
                      {c.label} · <span className="text-rose-800">{c.cpl == null ? "0 conversions" : `${fullMoney(c.cpl, currency)} cost per lead`}</span>{" "}
                      <span className="font-normal text-slate-500">({fullMoney(c.spend, currency)} / {formatCount(c.conversions, 1)} conv)</span>
                    </div>
                    <div className="text-[10px] text-slate-700 leading-snug mt-1">{c.reason}</div>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      </div>
    </>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-center">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-0">{label}</div>
      <div className="text-xl font-bold text-slate-900">{value}</div>
      <div className="text-[10px] text-slate-500">{sub}</div>
    </div>
  );
}
