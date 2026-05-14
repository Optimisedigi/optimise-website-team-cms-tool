"use client";

/**
 * Live-rendered 15-slide Google Ads audit deck.
 *
 * Renders the full audit deck from `GoogleAdsAudit15SlidePayload`.
 * Follows the same visual language as the Away Digital Teams audit
 * (website-growth-tools/output/away-digital-audit-may-2026.html): dark cover
 * and closing slides with starfield + orbit rings; white content slides with
 * Tailwind utilities and inline SVG charts.
 *
 * Reuses the same `template.css`, `AccountGlanceChart`, `DeckScrollEffects`,
 * and `Starfield` modules already present in this directory.
 */
import { useState } from "react";

import Starfield from "./Starfield";
import DeckScrollEffects from "./DeckScrollEffects";
import AccountGlanceChart from "./AccountGlanceChart";
import type {
  GoogleAdsAudit15SlidePayload,
  AdGroupCategory,
  AdGroupRow,
  SearchTermRow,
  NegativePatternRow,
  LandingPageRow,
  RecommendationItem,
  AuditScoreBar,
  NbTrendMonth,
  NbTrendGridLine,
  NbTrendLegendEntry,
  ScoringMethodologyCard,
  FrameworkStep,
} from "./payload";

/* ─── Slide IDs (15 total) ─────────────────────────────────────────── */
const SLIDES = [
  "cover",
  "tldr",
  "account-glance",
  "audit-score",
  "category-breakdown",
  "non-brand-trend",
  "ad-groups",
  "search-terms",
  "landing-pages",
  "ai-overviews",
  "recommendations",
  "opportunity",
  "how-we-work",
  "working-together",
  "closing",
] as const;
type SlideId = (typeof SLIDES)[number];

/* ─── Helpers ──────────────────────────────────────────────────────── */

function scoreRingPath(offset: number): string {
  const r = 54;
  const circ = 2 * Math.PI * r;
  return `M 50 4 A ${r} ${r} 0 1 1 49.99 4`;
}

/** Bold-span compiler: `**text**` → <strong> */
function compileBold(s: string): React.ReactNode {
  const parts = s.split(/\*\*([^*]+?)\*\*/g);
  return (
    <>
      {parts.map((seg, i) =>
        i % 2 === 1 ? (
          <strong key={i}>{seg}</strong>
        ) : (
          <span key={i}>{seg}</span>
        ),
      )}
    </>
  );
}

/* ─── Slide wrapper ────────────────────────────────────────────────── */

function SlideWrapper({
  id,
  children,
  dark = false,
  light = false,
}: {
  id: SlideId;
  children: React.ReactNode;
  dark?: boolean;
  light?: boolean;
}) {
  const bg = dark
    ? "bg-[#07091a] text-white"
    : light
      ? "bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white"
      : "bg-white dark:bg-slate-900 text-slate-900 dark:text-white";
  const num = SLIDES.indexOf(id) + 1;
  const numColor = dark ? "text-slate-600" : "text-slate-400 dark:text-slate-600";
  return (
    <section
      id={id}
      className={`min-h-[680px] lg:min-h-[780px] flex flex-col justify-center px-6 pt-20 pb-12 max-w-5xl mx-auto w-full ${bg}`}
      style={{ scrollSnapAlign: "start" }}
    >
      {children}
      <div
        className={`absolute bottom-4 right-5 text-xs font-mono tabular-nums ${numColor} select-none`}
        aria-hidden="true"
      >
        {num} / {SLIDES.length}
      </div>
    </section>
  );
}

/* ─── Slide 1: Cover ──────────────────────────────────────────────── */
function CoverSlide({ p }: { p: GoogleAdsAudit15SlidePayload }) {
  return (
    <SlideWrapper id="cover" dark>
      <Starfield id="cover-starfield" />
      {/* Orbit rings */}
      <div className="cover-v2 orbit-deco" style={{ width: 280, height: 280, top: "10%", left: "5%" }} />
      <div className="cover-v2 orbit-deco" style={{ width: 440, height: 440, top: "2%", left: "-2%" }} />

      <div className="relative z-10 text-center">
        <div className="cover-pill mb-8 inline-block">
          Google Ads Account Audit
        </div>
        <h1
          className="cover-h1 text-5xl md:text-7xl mb-6"
          style={{ fontSize: "clamp(2.5rem, 6vw, 4.5rem)" }}
        >
          {p.clientName}
        </h1>
        <p className="text-white/60 text-lg md:text-xl max-w-2xl mx-auto mb-4">
          {p.auditPeriodLabel}
        </p>
        <p className="text-white/50 text-sm max-w-xl mx-auto">{p.coverTagline}</p>
        <div className="cover-meta mt-12 text-sm">{p.auditPeriodLabel} · Google Ads</div>
      </div>

      {/* Rocket UI */}
      <div id="rocket-fixed" className="rocket-fixed">
        <img src="/optimise-digital-rocket.png" alt="" className="rocket-img" />
        <div className="rocket-flame" />
      </div>
      <div className="flame-trail" />
      <div className="flame-trail-hit" id="flame-trail-hit" />
      <div className="rocket-hint" id="rocket-hint">
        <span className="rocket-hint-text">Scroll up</span>
        <span className="rocket-hint-arrow">←</span>
      </div>
    </SlideWrapper>
  );
}

/* ─── Slide 2: TL;DR ──────────────────────────────────────────────── */
function TlDrSlide({ p }: { p: GoogleAdsAudit15SlidePayload }) {
  const bars = p.auditScoreBars.slice().sort((a, b) => b.score - a.score);
  const top3 = bars.slice(0, 3);
  const bottom3 = bars.slice(-3);

  return (
    <SlideWrapper id="tldr" light>
      <h2 className="text-2xl md:text-3xl font-bold text-center mb-2">
        TL;DR — at a glance
      </h2>
      <p className="text-center text-slate-500 dark:text-slate-400 mb-8">
        {p.clientName} · {p.auditPeriodLabel}
      </p>

      {/* Overall score ring */}
      <div className="flex justify-center mb-8">
        <div className="relative inline-flex items-center justify-center">
          <svg viewBox="0 0 100 100" className="w-32 h-32 -rotate-90">
            <circle cx="50" cy="50" r="54" fill="none" stroke="rgb(71,85,105)" strokeWidth="8" />
            <circle
              cx="50"
              cy="50"
              r="54"
              fill="none"
              className={p.scoreRingStrokeClass}
              strokeWidth="8"
              strokeDasharray={`${2 * Math.PI * 54}`}
              strokeDashoffset={p.scoreRingDashoffset}
              strokeLinecap="round"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className="text-4xl font-bold text-slate-900 dark:text-white">
              {p.overallScore}
            </div>
            <div className={`text-xs font-semibold ${p.overallScoreLabelClass}`}>
              {p.overallScoreLabel}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto">
        {/* Strengths */}
        <div className="rounded-lg border border-emerald-200 dark:border-emerald-800 bg-white dark:bg-slate-800 overflow-hidden">
          <div className="px-4 py-2 bg-emerald-50 dark:bg-emerald-950 border-b border-emerald-200 dark:border-emerald-800">
            <div className="text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
              Strengths
            </div>
          </div>
          <ul className="p-4 space-y-2">
            {top3.map((b) => (
              <li key={b.step} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${b.barColor}`} />
                <span>{b.label}</span>
                <span className={`ml-auto text-xs font-bold ${b.scoreColor}`}>{b.score}/10</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Areas to improve */}
        <div className="rounded-lg border border-rose-200 dark:border-rose-800 bg-white dark:bg-slate-800 overflow-hidden">
          <div className="px-4 py-2 bg-rose-50 dark:bg-rose-950 border-b border-rose-200 dark:border-rose-800">
            <div className="text-xs font-bold uppercase tracking-wider text-rose-700 dark:text-rose-300">
              Areas to improve
            </div>
          </div>
          <ul className="p-4 space-y-2">
            {bottom3.map((b) => (
              <li key={b.step} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${b.barColor}`} />
                <span>{b.label}</span>
                <span className={`ml-auto text-xs font-bold ${b.scoreColor}`}>{b.score}/10</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Recommendations count */}
      <div className="mt-6 text-center">
        <span className="inline-flex items-center gap-2 rounded-full bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 px-4 py-2 text-sm text-blue-700 dark:text-blue-300">
          <span className="font-bold">{p.recommendations.length}</span>
          recommendations identified
        </span>
      </div>
    </SlideWrapper>
  );
}

/* ─── Slide 3: Account at a Glance ──────────────────────────────── */
function AccountGlanceSlide() {
  return (
    <SlideWrapper id="account-glance">
      <h2 className="text-2xl md:text-3xl font-bold text-center mb-2">
        Account at a glance
      </h2>
      <p className="text-center text-slate-500 dark:text-slate-400 mb-6">
        16 months of Google Ads performance · Away Digital Teams
      </p>
      <AccountGlanceChart />
    </SlideWrapper>
  );
}

/* ─── Slide 4: Audit Score ───────────────────────────────────────── */
function AuditScoreSlide({ p }: { p: GoogleAdsAudit15SlidePayload }) {
  return (
    <SlideWrapper id="audit-score" light>
      <h2 className="text-2xl md:text-3xl font-bold text-center mb-1">
        Audit score by category
      </h2>
      <p className="text-center text-slate-500 dark:text-slate-400 mb-6 text-sm">
        13 scoring dimensions · weighted average = {p.overallScore}/100
      </p>

      <div className="max-w-3xl mx-auto w-full space-y-2">
        {p.auditScoreBars.map((bar) => (
          <div key={bar.step} className="flex items-center gap-3">
            <span className="w-5 text-right text-xs font-mono text-slate-400 select-none">
              {bar.step}
            </span>
            <span className="w-44 text-sm text-slate-700 dark:text-slate-200 truncate">
              {bar.label}
            </span>
            <div className="flex-1 bg-slate-100 dark:bg-slate-700 rounded-full h-3 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${bar.barColor}`}
                style={{ width: `${(bar.score / 10) * 100}%` }}
              />
            </div>
            <span className={`w-10 text-right text-xs font-bold ${bar.scoreColor}`}>
              {bar.score}
            </span>
          </div>
        ))}
      </div>

      {/* Methodology collapsible */}
      <details className="mt-6 max-w-3xl mx-auto rounded-lg border border-slate-200 dark:border-slate-700">
        <summary className="px-4 py-2 cursor-pointer text-sm font-medium text-slate-600 dark:text-slate-300 select-none">
          Scoring methodology ({p.scoringMethodologyCards.length} dimensions)
        </summary>
        <div className="border-t border-slate-200 dark:border-slate-700 p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
          {p.scoringMethodologyCards.map((card) => (
            <div key={card.n} className="text-xs">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-semibold text-slate-800 dark:text-slate-100">
                  {card.n}. {card.name}
                </span>
                <span className={`font-bold ml-auto ${card.scoreClass}`}>{card.score}/10</span>
              </div>
              <p className="text-slate-500 dark:text-slate-400 leading-snug">{card.desc}</p>
              <p className="text-slate-400 dark:text-slate-500 mt-0.5">Weight: {card.weight}</p>
            </div>
          ))}
        </div>
      </details>
    </SlideWrapper>
  );
}

/* ─── Slide 5: Category Breakdown ──────────────────────────────── */
function CategoryBreakdownSlide({ p }: { p: GoogleAdsAudit15SlidePayload }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <SlideWrapper id="category-breakdown">
      <h2 className="text-2xl md:text-3xl font-bold text-center mb-1">
        Spend by category
      </h2>
      <p className="text-center text-slate-500 dark:text-slate-400 mb-6 text-sm">
        Click a category to expand ad group details
      </p>

      <div className="space-y-2 max-w-4xl mx-auto w-full">
        {p.adGroupCategories.map((cat) => {
          const isOpen = expanded === cat.name;
          return (
            <div key={cat.name} className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
              <button
                type="button"
                onClick={() => setExpanded(isOpen ? null : cat.name)}
                className="w-full flex items-center gap-3 px-4 py-3 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors text-left"
              >
                <span className={`text-lg transition-transform ${isOpen ? "rotate-90" : ""}`}>▶</span>
                <span className="font-semibold text-sm text-slate-800 dark:text-slate-100">{cat.name}</span>
                <span className="ml-auto text-xs text-slate-500 dark:text-slate-400">
                  {cat.rows.length} ad groups · {cat.spendTotal}
                </span>
                <span className="text-xs text-slate-400 dark:text-slate-500">{cat.cpl}</span>
              </button>

              {isOpen && (
                <div className="border-t border-slate-200 dark:border-slate-700">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-slate-100 dark:bg-slate-900 text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                        <th className="px-3 py-1.5 text-left font-semibold">Ad group</th>
                        <th className="px-3 py-1.5 text-right font-semibold">Spend</th>
                        <th className="px-3 py-1.5 text-right font-semibold">CPL</th>
                        <th className="px-3 py-1.5 text-right font-semibold">Impr. Share</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {cat.rows.map((row) => (
                        <tr
                          key={row.name}
                          className={
                            row.variant === "rose"
                              ? "bg-rose-50/50 dark:bg-rose-950/20"
                              : row.variant === "muted"
                                ? "bg-slate-50/50 dark:bg-slate-800/50 opacity-70"
                                : ""
                          }
                        >
                          <td className="px-3 py-1.5 text-slate-700 dark:text-slate-200">{row.name}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums text-slate-900 dark:text-white font-medium">
                            {row.spend}
                          </td>
                          <td className={`px-3 py-1.5 text-right tabular-nums font-semibold ${
                            row.cplColor === "emerald"
                              ? "text-emerald-600 dark:text-emerald-400"
                              : row.cplColor === "slate"
                                ? "text-slate-600 dark:text-slate-300"
                                : "text-slate-900 dark:text-white"
                          }`}>
                            {row.cpl}
                          </td>
                          <td className={`px-3 py-1.5 text-right tabular-nums ${
                            row.isColor === "amber"
                              ? "text-amber-600 dark:text-amber-400"
                              : row.isColor === "muted"
                                ? "text-slate-400"
                                : "text-slate-600 dark:text-slate-300"
                          }`}>
                            {row.is}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {cat.opportunity && (
                    <div className="px-3 py-2 bg-amber-50 dark:bg-amber-950/30 border-t border-amber-100 dark:border-amber-900/50 text-xs text-amber-800 dark:text-amber-200">
                      {compileBold(cat.opportunity)}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </SlideWrapper>
  );
}

/* ─── Slide 6: Non-Brand Spend Trend ───────────────────────────── */
function NonBrandTrendSlide({ p }: { p: GoogleAdsAudit15SlidePayload }) {
  const svgW = 720;
  const svgH = 240;
  const padL = 50;
  const padR = 10;
  const padT = 10;
  const padB = 30;
  const innerH = svgH - padT - padB;
  const barW = 24;

  return (
    <SlideWrapper id="non-brand-trend" light>
      <h2 className="text-2xl md:text-3xl font-bold text-center mb-1">
        Non-brand spend trend
      </h2>
      <p className="text-center text-slate-500 dark:text-slate-400 mb-4 text-sm">
        Monthly stacked spend by category · Jan 2025 – Apr 2026
      </p>

      <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 p-4">
        <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full h-auto" xmlns="http://www.w3.org/2000/svg">
          {/* Grid lines */}
          {p.nbTrendGridLines.map((gl) => (
            <g key={gl.y}>
              <line
                x1={padL}
                x2={svgW - padR}
                y1={gl.y}
                y2={gl.y}
                stroke="rgb(226,232,240)"
                strokeDasharray="2,3"
                strokeWidth="0.75"
              />
              <text
                x={padL - 4}
                y={gl.y + 3}
                textAnchor="end"
                fontSize="8"
                fill="rgb(100,116,139)"
                fontWeight="600"
              >
                {gl.label}
              </text>
            </g>
          ))}

          {/* Y axis */}
          <line x1={padL} x2={padL} y1={padT} y2={svgH - padB} stroke="rgb(71,85,105)" strokeWidth="1" />

          {/* Stacked bars */}
          {p.nbTrendMonths.map((m, idx) => {
            const segColors = p.nbTrendSegmentColors;
            return (
              <g key={idx}>
                {m.segments.map((seg, si) => (
                  <rect
                    key={si}
                    x={m.x}
                    y={seg.y}
                    width={barW}
                    height={seg.height}
                    fill={segColors[si]}
                    opacity="0.85"
                  />
                ))}
                {/* Month label */}
                <text
                  x={m.centerX}
                  y={svgH - 8}
                  textAnchor="middle"
                  fontSize="8"
                  fill="rgb(71,85,105)"
                  fontWeight="500"
                >
                  {m.label}
                </text>
                {/* Total above bar */}
                <text
                  x={m.centerX}
                  y={m.totalY}
                  textAnchor="middle"
                  fontSize="7"
                  fill="rgb(30,41,59)"
                  fontWeight="700"
                >
                  {m.total}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Legend */}
        <div className="flex flex-wrap gap-4 mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
          {p.nbTrendLegend.map((entry) => (
            <div key={entry.name} className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
              <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: entry.color }} />
              <span>{entry.name}</span>
              <span className="text-slate-400">·</span>
              <span className="text-slate-500">{entry.cpl}</span>
            </div>
          ))}
        </div>
      </div>
    </SlideWrapper>
  );
}

/* ─── Slide 7: Ad Group Deep Dive ──────────────────────────────── */
function AdGroupsSlide({ p }: { p: GoogleAdsAudit15SlidePayload }) {
  // Show the two worst-performing categories
  const focus = p.adGroupCategories.slice(1, 3); // Developer/IT, Finance

  return (
    <SlideWrapper id="ad-groups">
      <h2 className="text-2xl md:text-3xl font-bold text-center mb-1">
        Ad group deep dive
      </h2>
      <p className="text-center text-slate-500 dark:text-slate-400 mb-6 text-sm">
        Cost per lead by ad group · click a row for full breakdown
      </p>

      <div className="space-y-6 max-w-4xl mx-auto w-full">
        {focus.map((cat) => (
          <div key={cat.name} className="rounded-lg border border-rose-200 dark:border-rose-800 overflow-hidden">
            <div className="px-4 py-2 bg-rose-50 dark:bg-rose-950 border-b border-rose-200 dark:border-rose-800">
              <div className="flex items-center justify-between">
                <div className="text-sm font-bold text-rose-800 dark:text-rose-200">{cat.name}</div>
                <div className="flex gap-4 text-xs text-rose-600 dark:text-rose-400">
                  <span>Total: <strong>{cat.spendTotal}</strong></span>
                  <span>CPL: <strong>{cat.cpl}</strong></span>
                </div>
              </div>
            </div>
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  <th className="px-3 py-1.5 text-left">Ad group</th>
                  <th className="px-3 py-1.5 text-right">Spend</th>
                  <th className="px-3 py-1.5 text-right">CPL</th>
                  <th className="px-3 py-1.5 text-right">Impr. Share</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {cat.rows.map((row) => (
                  <tr
                    key={row.name}
                    className={row.variant === "rose" ? "bg-rose-50/50 dark:bg-rose-950/10" : ""}
                  >
                    <td className="px-3 py-1.5 text-slate-700 dark:text-slate-200">{row.name}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums font-medium text-slate-900 dark:text-white">
                      {row.spend}
                    </td>
                    <td className={`px-3 py-1.5 text-right tabular-nums font-bold ${
                      row.cplColor === "emerald"
                        ? "text-emerald-600 dark:text-emerald-400"
                        : row.cplColor === "slate"
                          ? "text-slate-500"
                          : "text-rose-600 dark:text-rose-400"
                    }`}>
                      {row.cpl}
                    </td>
                    <td className={`px-3 py-1.5 text-right tabular-nums ${
                      row.isColor === "amber" ? "text-amber-600 dark:text-amber-400" : "text-slate-500"
                    }`}>
                      {row.is}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {cat.opportunity && (
              <div className="px-4 py-2 bg-amber-50 dark:bg-amber-950/30 text-xs text-amber-800 dark:text-amber-200 border-t border-amber-100 dark:border-amber-900/50">
                {compileBold(cat.opportunity)}
              </div>
            )}
          </div>
        ))}
      </div>
    </SlideWrapper>
  );
}

/* ─── Slide 8: Search Terms ────────────────────────────────────── */
function SearchTermsSlide({ p }: { p: GoogleAdsAudit15SlidePayload }) {
  return (
    <SlideWrapper id="search-terms" light>
      <h2 className="text-2xl md:text-3xl font-bold text-center mb-1">
        Search terms — top spend
      </h2>
      <p className="text-center text-slate-500 dark:text-slate-400 mb-4 text-sm">
        Highest-spend non-brand search terms · budget-limited terms highlighted
      </p>

      <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              <th className="px-3 py-2 text-left">Search term</th>
              <th className="px-3 py-2 text-right">Spend</th>
              <th className="px-3 py-2 text-right">Conv.</th>
              <th className="px-3 py-2 text-right">CPL</th>
              <th className="px-3 py-2 text-right">Budget limited</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {p.searchTermTopRows.map((row, i) => {
              const isLimited = row.budgetLimited.startsWith("Yes");
              const highlight = row.budgetLimitedHighlight !== false && isLimited;
              return (
                <tr
                  key={i}
                  className={
                    highlight
                      ? "bg-amber-50/60 dark:bg-amber-950/20"
                      : "bg-white dark:bg-slate-900"
                  }
                >
                  <td className="px-3 py-1.5 text-slate-700 dark:text-slate-200 font-medium">{row.term}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums font-semibold text-slate-900 dark:text-white">
                    {row.spend}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-slate-600 dark:text-slate-300">{row.conv}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums font-semibold text-slate-900 dark:text-white">{row.cpl}</td>
                  <td className={`px-3 py-1.5 text-right tabular-nums ${
                    highlight ? "text-amber-700 dark:text-amber-400 font-semibold" : "text-slate-400"
                  }`}>
                    {row.budgetLimited}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </SlideWrapper>
  );
}

/* ─── Slide 9: Landing Pages ──────────────────────────────────── */
function LandingPagesSlide({ p }: { p: GoogleAdsAudit15SlidePayload }) {
  const cplColor: Record<string, string> = {
    rose: "text-rose-600 dark:text-rose-400",
    amber: "text-amber-600 dark:text-amber-400",
    emerald: "text-emerald-600 dark:text-emerald-400",
  };

  return (
    <SlideWrapper id="landing-pages">
      <h2 className="text-2xl md:text-3xl font-bold text-center mb-1">
        Landing page performance
      </h2>
      <p className="text-center text-slate-500 dark:text-slate-400 mb-4 text-sm">
        Sorted by spend · cost per lead by destination page
      </p>

      <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              <th className="px-3 py-2 text-left">Path</th>
              <th className="px-3 py-2 text-right">Spend</th>
              <th className="px-3 py-2 text-right">Clicks</th>
              <th className="px-3 py-2 text-right">Conv.</th>
              <th className="px-3 py-2 text-right">CPL</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {p.landingPageRows.map((row, i) => (
              <tr key={i} className={row.cplTone === "rose" ? "bg-rose-50/50 dark:bg-rose-950/10" : ""}>
                <td className="px-3 py-1.5">
                  <div className="text-slate-700 dark:text-slate-200 font-medium">{row.path}</div>
                  <div className="text-slate-400 text-[10px] truncate max-w-xs">{row.href}</div>
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums font-semibold text-slate-900 dark:text-white">
                  {row.spend}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums text-slate-600 dark:text-slate-300">{row.clicks}</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-slate-600 dark:text-slate-300">{row.conv}</td>
                <td className={`px-3 py-1.5 text-right tabular-nums font-bold ${cplColor[row.cplTone]}`}>
                  {row.cpl}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-xs text-slate-500 dark:text-slate-400 text-center max-w-2xl mx-auto">
        <strong className="text-rose-600 dark:text-rose-400">Red:</strong> CPL above account average — consider refining keywords or destination.{" "}
        <strong className="text-emerald-600 dark:text-emerald-400">Green:</strong> Strong conversion efficiency.
      </p>
    </SlideWrapper>
  );
}

/* ─── Slide 10: Negative Patterns ──────────────────────────────── */
function NegativePatternsSlide({ p }: { p: GoogleAdsAudit15SlidePayload }) {
  const totalWasted = p.negativePatternRows.reduce(
    (sum, r) => sum + parseFloat(r.wasted.replace(/[^0-9.]/g, "")),
    0,
  );

  return (
    <SlideWrapper id="ai-overviews" light>
      <h2 className="text-2xl md:text-3xl font-bold text-center mb-1">
        Wasted spend patterns
      </h2>
      <p className="text-center text-slate-500 dark:text-slate-400 mb-4 text-sm">
        Identified negative keyword opportunities · total wasted spend shown
      </p>

      {/* Summary banner */}
      <div className="max-w-3xl mx-auto mb-4">
        <div className="rounded-lg bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 px-5 py-3 text-center">
          <div className="text-xs uppercase tracking-wider text-rose-600 dark:text-rose-400 mb-1">
            Estimated preventable waste
          </div>
          <div className="text-3xl font-bold text-rose-700 dark:text-rose-200">
            ~${Math.round(totalWasted).toLocaleString()}
          </div>
        </div>
      </div>

      <div className="space-y-3 max-w-4xl mx-auto w-full">
        {p.negativePatternRows.map((row, i) => (
          <div
            key={i}
            className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4"
          >
            <div className="flex items-start gap-4">
              <div className="flex-1">
                <div className="font-semibold text-sm text-slate-800 dark:text-slate-100">
                  {row.label}
                  <span className="font-normal text-slate-500 dark:text-slate-400 ml-1">{row.detail}</span>
                </div>
                <div className="text-xs text-slate-600 dark:text-slate-300 mt-1 leading-snug">
                  {row.examples}
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <div className="text-sm font-bold text-rose-600 dark:text-rose-400">{row.wasted}</div>
                <div className="text-xs text-slate-400 dark:text-slate-500">{row.terms} terms</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </SlideWrapper>
  );
}

/* ─── Slide 11: Recommendations ────────────────────────────────── */
function RecommendationsSlide({ p }: { p: GoogleAdsAudit15SlidePayload }) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? p.recommendations : p.recommendations.slice(0, 6);

  return (
    <SlideWrapper id="recommendations">
      <h2 className="text-2xl md:text-3xl font-bold text-center mb-1">
        Recommendations
      </h2>
      <p className="text-center text-slate-500 dark:text-slate-400 mb-6 text-sm">
        {p.recommendations.length} actions to improve account performance
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-4xl mx-auto w-full">
        {visible.map((rec) => (
          <div
            key={rec.n}
            className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20 p-4"
          >
            <div className="flex items-start gap-3">
              <span className="w-7 h-7 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
                {rec.n}
              </span>
              <div>
                <div className="font-semibold text-sm text-slate-800 dark:text-slate-100 mb-1">
                  {rec.title}
                </div>
                <div className="text-xs text-slate-600 dark:text-slate-300 leading-snug">
                  {rec.desc}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {p.recommendations.length > 6 && (
        <div className="text-center mt-4">
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
          >
            {showAll ? "Show fewer" : `Show all ${p.recommendations.length} recommendations`}
          </button>
        </div>
      )}
    </SlideWrapper>
  );
}

/* ─── Slide 12: Opportunity ────────────────────────────────────── */
function OpportunitySlide({ p }: { p: GoogleAdsAudit15SlidePayload }) {
  // Summarise the top opportunities
  const opportunities = p.adGroupCategories
    .map((c) => ({
      name: c.name,
      opportunity: c.opportunity.replace(/^\*\*Opportunity:\*\*\s*/, ""),
      spend: c.spendTotal,
      cpl: c.cpl,
    }));

  return (
    <SlideWrapper id="opportunity" light>
      <h2 className="text-2xl md:text-3xl font-bold text-center mb-1">
        Where the biggest wins are
      </h2>
      <p className="text-center text-slate-500 dark:text-slate-400 mb-6 text-sm">
        Category-by-category opportunity summary
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-4xl mx-auto w-full">
        {opportunities.map((opp) => (
          <div
            key={opp.name}
            className="rounded-lg border border-amber-200 dark:border-amber-800 bg-white dark:bg-slate-900 overflow-hidden"
          >
            <div className="px-4 py-2 bg-amber-50 dark:bg-amber-950/40 border-b border-amber-100 dark:border-amber-900 flex items-center justify-between">
              <span className="font-semibold text-sm text-amber-800 dark:text-amber-200">{opp.name}</span>
              <div className="flex gap-3 text-xs text-amber-600 dark:text-amber-400">
                <span>{opp.spend}</span>
                <span>{opp.cpl}</span>
              </div>
            </div>
            <p className="px-4 py-3 text-xs text-slate-700 dark:text-slate-200 leading-snug">
              {compileBold(opp.opportunity)}
            </p>
          </div>
        ))}
      </div>
    </SlideWrapper>
  );
}

/* ─── Slide 13: How We Work ────────────────────────────────────── */
function HowWeWorkSlide({ p }: { p: GoogleAdsAudit15SlidePayload }) {
  return (
    <SlideWrapper id="how-we-work">
      <h2 className="text-2xl md:text-3xl font-bold text-center mb-1">
        How we work
      </h2>
      <p className="text-center text-slate-500 dark:text-slate-400 mb-6 text-sm">
        5-step Optimise Digital framework
      </p>

      <div className="flex flex-col gap-3 max-w-3xl mx-auto w-full">
        {p.frameworkSteps.map((step) => (
          <div
            key={step.n}
            className="step-card rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-5 py-4 flex gap-4"
          >
            <div className="w-8 h-8 rounded-full bg-blue-600 text-white text-sm font-bold flex items-center justify-center flex-shrink-0">
              {step.n}
            </div>
            <div>
              <div className="font-semibold text-slate-800 dark:text-slate-100 mb-1">{step.title}</div>
              <div className="text-xs text-slate-600 dark:text-slate-300 leading-snug">{step.desc}</div>
            </div>
          </div>
        ))}
      </div>
    </SlideWrapper>
  );
}

/* ─── Slide 14: Working Together ────────────────────────────────── */
function WorkingTogetherSlide({ p }: { p: GoogleAdsAudit15SlidePayload }) {
  return (
    <SlideWrapper id="working-together">
      <h2 className="text-2xl md:text-3xl font-bold text-center mb-8">
        Ready to improve your Google Ads performance?
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-4xl mx-auto w-full mb-8">
        {/* Timeline */}
        <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20 p-5 text-center">
          <div className="text-4xl mb-2">📅</div>
          <div className="font-semibold text-sm text-slate-800 dark:text-slate-100 mb-1">
            Discovery call
          </div>
          <div className="text-xs text-slate-600 dark:text-slate-300">
            30-minute session to align on goals, constraints, and priorities
          </div>
        </div>

        {/* Audit */}
        <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20 p-5 text-center">
          <div className="text-4xl mb-2">🔍</div>
          <div className="font-semibold text-sm text-slate-800 dark:text-slate-100 mb-1">
            Full account audit
          </div>
          <div className="text-xs text-slate-600 dark:text-slate-300">
            Structured review of every campaign, ad group, keyword, and negative
          </div>
        </div>

        {/* Implementation */}
        <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20 p-5 text-center">
          <div className="text-4xl mb-2">🚀</div>
          <div className="font-semibold text-sm text-slate-800 dark:text-slate-100 mb-1">
            Rollout &amp; optimise
          </div>
          <div className="text-xs text-slate-600 dark:text-slate-300">
            Phased implementation with weekly reviews and performance tracking
          </div>
        </div>
      </div>

      <div className="text-center">
        <a
          href={`mailto:${p.contactEmail}?subject=Google Ads enquiry — ${p.clientName}`}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold px-6 py-3 transition-colors"
        >
          Get in touch →
        </a>
        <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
          {p.contactName} · {p.contactPhoneDisplay}
        </p>
      </div>
    </SlideWrapper>
  );
}

/* ─── Slide 15: Closing ────────────────────────────────────────── */
function ClosingSlide({ p }: { p: GoogleAdsAudit15SlidePayload }) {
  return (
    <SlideWrapper id="closing" dark>
      <Starfield id="closing-starfield" />
      <div className="closing-v2 orbit-deco" style={{ width: 260, height: 260, bottom: "10%", right: "4%", top: "auto" }} />
      <div className="closing-v2 orbit-deco" style={{ width: 380, height: 380, bottom: "5%", right: "-5%", top: "auto" }} />

      <div className="relative z-10 text-center">
        <h2 className="closing-h1 text-4xl md:text-5xl mb-2">
          Thank you
        </h2>
        <p className="text-white/60 mb-10">for your time — let's get to work</p>

        {/* Contact card */}
        <div className="closing-who">
          <div>
            <div className="lbl">Contact</div>
            <div className="val">{p.contactName}</div>
          </div>
          <div>
            <div className="lbl">Email</div>
            <div className="val">
              <a href={`mailto:${p.contactEmail}`}>{p.contactEmail}</a>
            </div>
          </div>
          <div>
            <div className="lbl">Phone</div>
            <div className="val">{p.contactPhoneDisplay}</div>
          </div>
          <div>
            <div className="lbl">Website</div>
            <div className="val">
              <a href={p.clientWebsite} target="_blank" rel="noopener noreferrer">
                {p.clientWebsite.replace(/^https?:\/\//, "")}
              </a>
            </div>
          </div>
        </div>

        {/* OptiMate box */}
        <div className="optimate-box rounded-xl border border-slate-700 px-6 py-4 mt-8 max-w-sm mx-auto text-left">
          <div className="flex items-center gap-3">
            <div className="optimate-icon">
              <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect width="32" height="32" rx="8" fill="rgb(30,58,138)" />
                <path d="M10 16h12M16 10v12" stroke="rgb(96,165,250)" strokeWidth="2.5" strokeLinecap="round" />
                <circle cx="16" cy="16" r="5" stroke="rgb(96,165,250)" strokeWidth="2" />
              </svg>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-blue-300 mb-0.5">
                Powered by
              </div>
              <div className="text-sm font-bold text-white">OptiMate AI</div>
              <div className="text-xs text-slate-400">Autonomous Google Ads agent</div>
            </div>
          </div>
        </div>
      </div>

      {/* Rocket */}
      <div id="rocket-fixed-closing" className="rocket-fixed">
        <img src="/optimise-digital-rocket.png" alt="" className="rocket-img" />
        <div className="rocket-flame" />
      </div>
      <div className="flame-trail" />
      <div className="flame-trail-hit" id="flame-trail-hit-closing" />
    </SlideWrapper>
  );
}

/* ─── Space transition strip ─────────────────────────────────────── */
function SpaceTransition() {
  return (
    <div
      id="space-transition"
      className="v2-space-transition"
      style={{ scrollSnapAlign: "none" }}
    />
  );
}

/* ─── Main export ───────────────────────────────────────────────── */
export function Component({ payload: p }: { payload: GoogleAdsAudit15SlidePayload }) {
  return (
    <div className="relative">
      <style dangerouslySetInnerHTML={{ __html: `section { scroll-snap-align: start; }` }} />

      <CoverSlide p={p} />
      <TlDrSlide p={p} />
      <AccountGlanceSlide />
      <AuditScoreSlide p={p} />
      <CategoryBreakdownSlide p={p} />
      <NonBrandTrendSlide p={p} />
      <AdGroupsSlide p={p} />
      <SearchTermsSlide p={p} />
      <LandingPagesSlide p={p} />
      <NegativePatternsSlide p={p} />
      <RecommendationsSlide p={p} />
      <OpportunitySlide p={p} />
      <HowWeWorkSlide p={p} />
      <WorkingTogetherSlide p={p} />
      <SpaceTransition />
      <ClosingSlide p={p} />

      <DeckScrollEffects />
    </div>
  );
}
