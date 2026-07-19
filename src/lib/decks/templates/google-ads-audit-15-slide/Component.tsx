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
import { useEffect, useState } from "react";

import "./template.css";
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
      className={`relative min-h-screen flex flex-col justify-center px-6 pt-20 pb-12 max-w-5xl mx-auto w-full ${bg}`}
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
    <section id="cover" className="cover-v2 relative min-h-screen flex flex-col" style={{ scrollSnapAlign: "start" }}>
      <Starfield id="cover-starfield" />
      <div className="orbit-deco" style={{ width: 1100, height: 1100, right: -380, top: -300 }} />
      <div className="orbit-deco" style={{ width: 720, height: 720, right: -160, top: -80, borderColor: "rgba(77,148,255,0.1)" }} />
      <div className="relative z-10 px-8 md:px-12 pt-10 w-full">
        <div className="flex items-center gap-3">
          <span className="cover-dot" aria-hidden="true" />
          <img src="/optimise-digital-logo-white.webp" alt="Optimise Digital" className="w-auto h-[22.8px] md:h-[30.4px]" />
        </div>
      </div>
      <div className="relative z-10 flex-1 flex flex-col justify-center px-8 md:px-12 pb-12 w-full -mt-[20px]">
        <div className="flex flex-col items-start gap-5 text-left max-w-3xl">
          <div className="flex items-center gap-4 flex-wrap">
            <span className="cover-pill">Google Ads Account Audit</span>
            <span className="cover-meta">{p.auditPeriodLabel}</span>
          </div>
          <h1 className="cover-h1 text-4xl md:text-6xl">{p.clientName}</h1>
          <p className="text-base md:text-lg text-white/70 max-w-2xl leading-snug" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{p.coverTagline}</p>
        </div>
      </div>
      <a href="#tldr" className="absolute z-10 bottom-6 left-8 md:left-12 inline-flex items-center gap-2 px-4 py-2 rounded-full border border-blue-500/40 bg-blue-500/10 hover:bg-blue-500/20 transition-colors cursor-pointer" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
        <span className="text-[11px] font-medium tracking-widest uppercase" style={{ color: "var(--purple-soft)" }}>TL;DR</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--purple-soft)" }} aria-hidden="true"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
      </a>
      <div id="rocket-fixed" className="rocket-fixed"><img src="/optimise-digital-rocket.png" alt="" className="rocket-img" /><div className="rocket-flame" /></div>
      <div className="flame-trail" /><div className="flame-trail-hit" id="flame-trail-hit" />
      <div className="rocket-hint" id="rocket-hint"><span className="rocket-hint-text">Scroll up</span><span className="rocket-hint-arrow">←</span></div>
      <div className="absolute bottom-3 right-[36px] text-xs font-mono tabular-nums text-white/50 select-none" aria-hidden="true">1 / {SLIDES.length}</div>
    </section>
  );
}

/* ─── Slide 2: TL;DR ──────────────────────────────────────────────── */
/* Matches the established template's eyebrow + 2-column card-grid layout;
 * cards are generated from the evidence scorecard so content stays per-client. */
function TlDrSlide({ p }: { p: GoogleAdsAudit15SlidePayload }) {
  const cards = p.scoringMethodologyCards.slice().sort((a, b) => b.weight - a.weight).slice(0, 8);
  const scoreText = p.overallScore === 0 && p.overallScoreLabel === "Not assessed" ? "Not assessed" : `${p.overallScore}/100`;
  return (
    <SlideWrapper id="tldr" light>
      <div className="mb-4 max-w-5xl mx-auto w-full">
        <p className="text-blue-500 font-semibold text-sm uppercase tracking-widest mb-1">TL;DR</p>
        <h2 className="text-xl md:text-2xl font-bold text-slate-900 dark:text-white">The audit, in one slide</h2>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 max-w-5xl mx-auto w-full">
        <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950 p-3">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-blue-700 dark:text-blue-300 mb-0.5">Overall audit score</div>
          <p className="text-[12px] text-slate-700 dark:text-slate-200 leading-snug">{scoreText} · {p.overallScoreLabel}. Weighted across {p.scoringMethodologyCards.length} evidence-scored dimensions.</p>
        </div>
        {cards.map((card) => (
          <div key={card.n} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400 mb-0.5">{card.name} · {card.assessed === false ? "Not assessed" : `${card.score}/10`}</div>
            <p className="text-[12px] text-slate-700 dark:text-slate-200 leading-snug">{card.desc}</p>
          </div>
        ))}
        <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950 p-3 md:col-span-2">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-blue-700 dark:text-blue-300 mb-0.5">Recommendations</div>
          <p className="text-[12px] text-slate-700 dark:text-slate-200 leading-snug">{p.recommendations.length} prioritised {p.recommendations.length === 1 ? "action" : "actions"} identified from the captured evidence. Detail covered in the engagement.</p>
        </div>
      </div>
    </SlideWrapper>
  );
}

/* ─── Slide 3: Account at a Glance ──────────────────────────────── */
function AccountGlanceSlide() {
  return (
    <SlideWrapper id="account-glance">
      <h2 className="text-xl md:text-2xl font-bold text-center mb-3 max-w-4xl mx-auto text-slate-900 dark:text-white">
        Let&apos;s get context around the rising cost per lead
      </h2>
      <AccountGlanceChart />
    </SlideWrapper>
  );
}

/* ─── Slide 4: Audit Score ───────────────────────────────────────── */
function AuditScoreSlide({ p }: { p: GoogleAdsAudit15SlidePayload }) {
  const totalLabel = p.overallScore === 0 && p.overallScoreLabel === "Not assessed" ? "Not assessed" : String(p.overallScore);
  return (
    <SlideWrapper id="audit-score">
      <h2 className="text-xl md:text-2xl font-bold text-center mb-2 text-slate-900 dark:text-white">Google Ads account audit score</h2>
      <p className="text-center text-sm md:text-base pb-5 max-w-3xl mx-auto text-slate-500 dark:text-slate-400">Assessed across 13 areas. Well-managed accounts typically score 65–80.</p>
      <div className="flex flex-col md:flex-row items-center md:items-start gap-8 max-w-4xl mx-auto w-full">
        <div className="flex flex-col items-center gap-2 shrink-0">
          <div className="relative inline-flex items-center justify-center">
            <svg width="140" height="140" className="-rotate-90" aria-hidden="true">
              <circle cx="70" cy="70" r="54" fill="none" stroke="currentColor" strokeWidth="10" className="text-slate-200" />
              <circle cx="70" cy="70" r="54" fill="none" strokeWidth="10" strokeLinecap="round" strokeDasharray={2 * Math.PI * 54} strokeDashoffset={p.scoreRingDashoffset} className={p.scoreRingStrokeClass} />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-3xl font-bold text-slate-900 dark:text-white">{totalLabel}</span>
              {p.overallScoreLabel !== "Not assessed" && <span className="text-xs text-slate-500">/ 100</span>}
            </div>
          </div>
          <span className={`text-sm font-semibold ${p.overallScoreLabelClass}`}>{p.overallScoreLabel}</span>
        </div>
        <div className="flex-1 w-full space-y-2">
          {p.auditScoreBars.map((bar) => (
            <div key={bar.step} className="flex items-center gap-3">
              <span className="text-xs text-slate-500 w-5 text-right shrink-0">{bar.step}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-xs font-medium text-slate-700 dark:text-slate-200 truncate">{bar.label}</span>
                  <span className={`text-xs font-semibold ml-2 shrink-0 ${bar.scoreColor}`}>{bar.assessed === false ? "Not assessed" : `${bar.score}/10`}</span>
                </div>
                <div className="h-2 bg-slate-200 rounded-full overflow-hidden"><div className={`h-full rounded-full ${bar.barColor}`} style={{ width: bar.assessed === false ? "0%" : `${bar.score * 10}%` }} /></div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-5 max-w-4xl mx-auto w-full md:pl-[184px]">
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-xs text-slate-700"><span className="font-bold text-amber-700">Evidence note:</span> Scores use completed collectors only. Unavailable evidence remains Not assessed rather than receiving a placeholder score.</p>
        </div>
      </div>
      <details className="mt-3 max-w-4xl mx-auto w-full md:pl-[184px]">
        <summary className="text-xs text-blue-600 hover:text-blue-700 underline underline-offset-2 cursor-pointer">How is each category scored?</summary>
        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">{p.scoringMethodologyCards.map((card) => <div key={card.n} className="bg-slate-50 rounded-lg p-2.5 border border-slate-200 text-xs"><div className="flex justify-between gap-2"><strong>{card.n}. {card.name}</strong><span className={card.scoreClass}>{card.assessed === false ? "Not assessed" : `${card.score}/10`}</span></div><p className="text-slate-500 mt-1">{card.desc}</p></div>)}</div>
      </details>
    </SlideWrapper>
  );
}

/* ─── Slide 5: Category Breakdown ──────────────────────────────── */
function CategoryBreakdownSlide({ p }: { p: GoogleAdsAudit15SlidePayload }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <SlideWrapper id="category-breakdown">
      <h2 className="text-xl md:text-2xl font-bold text-center mb-1">
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
      <h2 className="text-xl md:text-2xl font-bold text-center mb-1">
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
      <h2 className="text-xl md:text-2xl font-bold text-center mb-1">
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
      <h2 className="text-xl md:text-2xl font-bold text-center mb-1">
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
      <h2 className="text-xl md:text-2xl font-bold text-center mb-1">
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
      <h2 className="text-xl md:text-2xl font-bold text-center mb-1">
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
      <h2 className="text-xl md:text-2xl font-bold text-center mb-1">
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
      <h2 className="text-xl md:text-2xl font-bold text-center mb-1">
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
      <h2 className="text-xl md:text-2xl font-bold text-center mb-1">
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
  const Tick = () => <svg className="mt-0.5 h-3 w-3 shrink-0 text-blue-500" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="m2 6 2.3 2.3L10 2.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>;
  return (
    <section id="working-together" className="relative flex min-h-[calc(100vh-100px)] flex-col bg-white" style={{ scrollSnapAlign: "start" }}>
      <div className="flex-1 flex flex-col justify-center px-6 pt-2 pb-8 max-w-3xl mx-auto w-full">
        <h2 className="text-xl md:text-2xl font-bold text-center mb-2 text-slate-900">Working together</h2>
        <p className="text-center text-sm md:text-base pb-5 max-w-2xl mx-auto text-slate-500">A focused engagement that turns this audit&apos;s evidence into measurable account improvements.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
            <h3 className="text-xs font-semibold text-slate-900 mb-2">Google Ads management</h3>
            <ul className="space-y-1 text-xs text-slate-600">
              <li className="flex items-start gap-2"><Tick />Strategy led by an experienced Google Ads team</li>
              <li className="flex items-start gap-2"><Tick />Evidence-led account monitoring and recommendations</li>
              <li className="flex items-start gap-2"><Tick />Clear dashboards tied to commercial goals</li>
              <li className="flex items-start gap-2"><Tick />Transparent reporting on changes and outcomes</li>
              <li className="flex items-start gap-2"><Tick />Priorities reviewed as new performance data arrives</li>
            </ul>
          </div>
          <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
            <h3 className="text-xs font-semibold text-slate-900 mb-2">What&apos;s included</h3>
            <ul className="space-y-1 text-xs text-slate-600">
              <li className="flex items-start gap-2"><Tick />Week 1: Validate tracking and deploy low-risk quick wins</li>
              <li className="flex items-start gap-2"><Tick />Weeks 2–6: Implement the highest-priority audit actions</li>
              <li className="flex items-start gap-2"><Tick />Month 2+: Scale proven improvements and test new opportunities</li>
              <li className="flex items-start gap-2"><Tick />Ongoing: Optimisation, monitoring and performance reporting</li>
            </ul>
          </div>
        </div>
        <div className="mt-4 overflow-hidden rounded-xl border border-slate-200">
          <table className="w-full text-sm">
            <thead><tr className="bg-slate-900"><th className="text-left text-white font-semibold px-4 py-2">Next step</th><th className="text-right text-white font-semibold px-4 py-2">Scope</th></tr></thead>
            <tbody>
              <tr className="bg-white"><td className="px-4 py-2 font-medium text-slate-900">Audit review</td><td className="px-4 py-2 text-right text-slate-700 font-semibold">Confirm priorities together</td></tr>
              <tr className="bg-slate-50"><td className="px-4 py-2 font-medium text-slate-900">Management plan</td><td className="px-4 py-2 text-right text-slate-700 font-semibold">Tailored to {p.clientName}</td></tr>
            </tbody>
          </table>
        </div>
      </div>
      <div className="absolute bottom-3 right-[36px] text-xs font-mono tabular-nums text-slate-400 select-none" aria-hidden="true">14 / {SLIDES.length}</div>
    </section>
  );
}

/* ─── Slide 15: Closing ────────────────────────────────────────── */
function ClosingSlide({ p }: { p: GoogleAdsAudit15SlidePayload }) {
  return (
    <section id="closing" className="closing-v2 relative flex min-h-[calc(100vh-100px)] flex-col" style={{ scrollSnapAlign: "start" }}>
      <Starfield id="closing-starfield" />
      <div className="orbit-deco" style={{ width: 1100, height: 1100, right: -440, bottom: -380 }} />
      <div className="orbit-deco" style={{ width: 760, height: 760, right: -260, bottom: -200, borderColor: "rgba(77,148,255,0.1)" }} />
      <div className="closing-station" aria-hidden="true"><img src="/slides/Space-station-optimise-digital.png" alt="" /></div>
      <div className="relative z-10 px-8 md:px-12 pt-10 w-full">
        <a href="https://optimisedigital.online?utm_source=audit&utm_medium=closing" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-3" aria-label="Visit Optimise Digital">
          <span className="cover-dot" aria-hidden="true" />
          <img src="/optimise-digital-logo-white.webp" alt="Optimise Digital" className="w-auto h-[22.8px] md:h-[30.4px]" />
        </a>
      </div>
      <div className="relative z-10 flex-1 flex flex-col justify-center px-8 md:px-12 pb-0 w-full gap-10">
        <h2 className="closing-h1 text-4xl md:text-6xl max-w-3xl">Ready to <em>discuss</em>?</h2>
        <div className="closing-who max-w-4xl">
          <div><div className="lbl">For</div><div className="val"><a href={p.clientWebsite} target="_blank" rel="noopener noreferrer">{p.clientName}</a></div></div>
          <div><div className="lbl">{p.contactName}</div><div className="val"><a href={`mailto:${p.contactEmail}`}>{p.contactEmail}</a></div><div className="val" style={{ marginTop: 4 }}><a href={`tel:${p.contactPhoneDisplay.replace(/\s/g, "")}`}>{p.contactPhoneDisplay}</a></div></div>
        </div>
      </div>
      <div className="absolute bottom-3 right-[36px] text-xs font-mono tabular-nums text-white/50 select-none" aria-hidden="true">15 / {SLIDES.length}</div>
    </section>
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
/**
 * `previewSlideId` renders the deck in the admin review iframe. Preview mode
 * disables the public deck's scroll machinery (column-reverse layout, the
 * DeckScrollEffects jump-to-bottom / scroll-hijack, and y-proximity snapping)
 * because inside the short 16:9 preview frame that machinery fights the user —
 * scrolling up snaps straight back down. Instead it renders top-to-bottom and
 * scrolls the selected slide into view once.
 */
export function Component({ payload: p, previewSlideId }: { payload: GoogleAdsAudit15SlidePayload; previewSlideId?: string }) {
  const preview = previewSlideId !== undefined;

  useEffect(() => {
    if (!preview || !previewSlideId) return;
    const el = document.getElementById(previewSlideId);
    if (!el) return;
    // Scroll the iframe's OWN window only. `element.scrollIntoView()` would also
    // scroll every ancestor scroll container (the parent admin page) to reveal
    // the iframe, which yanks the whole tab view down on mount/re-render.
    window.scrollTo({ top: el.offsetTop, behavior: "auto" });
  }, [preview, previewSlideId]);

  return (
    <main className={`google-ads-audit-deck relative ${preview ? "flex flex-col" : "flex flex-col-reverse"}`}>
      <style dangerouslySetInnerHTML={{ __html: preview
        ? `.google-ads-audit-deck > section { scroll-snap-align: none !important; }`
        : `.google-ads-audit-deck > section { scroll-snap-align: start; }` }} />

      <CoverSlide p={p} />
      <TlDrSlide p={p} />
      {p.showAccountGlance !== false && <AccountGlanceSlide />}
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

      {!preview && <DeckScrollEffects />}
    </main>
  );
}
