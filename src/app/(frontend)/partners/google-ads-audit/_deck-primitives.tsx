"use client";

/**
 * Shared deck primitives used by the simplified per-business decks.
 * Lives in the parent google-ads-audit/ folder (prefixed _ so Next.js
 * does not treat it as a route).
 */

import Image from "next/image";
import { useEffect, useState } from "react";

/* ─────────────────────────────────────────────────────────────────── */
/*  RocketButton + Slide + headers                                       */
/* ─────────────────────────────────────────────────────────────────── */

export function RocketButton({
  slides,
  currentId,
  className,
}: {
  slides: string[];
  currentId: string;
  className?: string;
}) {
  const currentIndex = slides.indexOf(currentId);
  const nextId = slides[currentIndex + 1];
  if (!nextId) return null;

  const scrollToNext = () => {
    document.getElementById(nextId)?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className={`flex justify-center py-2 ${className || ""}`}>
      <button
        onClick={scrollToNext}
        aria-label="Go to next section"
        className="flex flex-col items-center gap-0.5 group"
      >
        <Image
          src="/optimise-digital-rocket.png"
          alt="Next section"
          width={38}
          height={58}
          className="group-hover:scale-110 group-hover:-translate-y-1 transition-transform duration-200"
        />
        <svg
          className="w-4 h-4 animate-bounce opacity-40 text-slate-400"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          viewBox="0 0 24 24"
        >
          <path d="M12 5v14M5 12l7 7 7-7" />
        </svg>
      </button>
    </div>
  );
}

export function Slide({
  id,
  slides,
  children,
  dark = false,
  light = false,
  rocketClassName,
}: {
  id: string;
  slides: string[];
  children: React.ReactNode;
  dark?: boolean;
  light?: boolean;
  rocketClassName?: string;
}) {
  const bg = dark
    ? "bg-slate-900 dark:bg-slate-950"
    : light
      ? "bg-slate-50 dark:bg-slate-800"
      : "bg-white dark:bg-slate-900";
  const slideNumber = slides.indexOf(id) + 1;
  const numberColor = dark ? "text-slate-500" : "text-slate-400 dark:text-slate-500";
  return (
    <section id={id} className={`relative min-h-[680px] lg:min-h-[780px] flex flex-col ${bg}`}>
      <div className="flex-1 flex flex-col justify-center px-6 pt-20 pb-12 max-w-5xl mx-auto w-full">
        {children}
      </div>
      <div data-no-print="true">
        <RocketButton slides={slides} currentId={id} className={rocketClassName} />
      </div>
      <div
        data-no-print="true"
        className={`absolute bottom-3 right-4 text-xs font-mono tabular-nums ${numberColor} select-none pointer-events-none`}
        aria-hidden="true"
      >
        {slideNumber} / {slides.length}
      </div>
    </section>
  );
}

export function SlideHeading({ children, dark = false }: { children: React.ReactNode; dark?: boolean }) {
  return (
    <h2
      className={`text-xl md:text-2xl font-bold text-center mb-3 max-w-4xl mx-auto ${
        dark ? "text-white" : "text-slate-900 dark:text-white"
      }`}
    >
      {children}
    </h2>
  );
}

export function SlideSubtext({ children, dark = false }: { children: React.ReactNode; dark?: boolean }) {
  return (
    <p
      className={`text-center text-sm md:text-base pb-[20px] max-w-3xl mx-auto ${
        dark ? "text-slate-300" : "text-slate-500 dark:text-slate-400"
      }`}
    >
      {children}
    </p>
  );
}

/* ─────────────────────────────────────────────────────────────────── */
/*  LineChart                                                            */
/* ─────────────────────────────────────────────────────────────────── */

export interface Series {
  name: string;
  color: string;
  values: (number | null)[];
  labelIndices?: number[];
}

export function LineChart({
  labels,
  series,
  height = 280,
  formatY,
  annotations = [],
}: {
  labels: string[];
  series: Series[];
  height?: number;
  formatY?: (v: number) => string;
  annotations?: { atIndex: number; label: string; color?: string }[];
}) {
  const width = 720;
  const padL = 56;
  const padR = 16;
  const padT = 16;
  const padB = 48;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;
  const allValues = series.flatMap((s) => s.values).filter((v): v is number => typeof v === "number");
  const maxY = Math.max(...allValues, 1);
  const niceMax = Math.ceil(maxY / 5) * 5 + (maxY % 5 === 0 ? 5 : 0);
  const yTicks = 5;
  const tickStep = niceMax / yTicks;
  const xStep = innerW / Math.max(1, labels.length - 1);
  const xAt = (i: number) => padL + i * xStep;
  const yAt = (v: number) => padT + innerH - (v / niceMax) * innerH;
  const fmt = formatY ?? ((v) => v.toLocaleString());

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-700 shadow-sm">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto">
        {Array.from({ length: yTicks + 1 }).map((_, i) => {
          const v = niceMax - tickStep * i;
          const y = padT + (innerH * i) / yTicks;
          return (
            <g key={i}>
              <line x1={padL} x2={width - padR} y1={y} y2={y} stroke="rgb(226,232,240)" strokeDasharray="2,3" strokeWidth={1} />
              <text x={padL - 8} y={y + 4} textAnchor="end" fontSize="10" fill="rgb(100,116,139)">
                {fmt(v)}
              </text>
            </g>
          );
        })}
        {labels.map((lbl, i) => (
          <text
            key={i}
            x={xAt(i)}
            y={height - padB + 16}
            textAnchor="middle"
            fontSize="9"
            fill="rgb(100,116,139)"
            transform={`rotate(-45 ${xAt(i)} ${height - padB + 16})`}
          >
            {lbl}
          </text>
        ))}
        {annotations.map((a, ai) => {
          const x = xAt(a.atIndex);
          const color = a.color ?? "rgb(220,38,38)";
          return (
            <g key={ai}>
              <line x1={x} x2={x} y1={padT} y2={padT + innerH} stroke={color} strokeDasharray="3,3" strokeWidth={1.5} />
              <text x={x} y={padT + 12} fontSize="10" fontWeight="bold" fill={color} textAnchor="middle">
                {a.label}
              </text>
            </g>
          );
        })}
        {series.map((s) => {
          const points: { x: number; y: number; v: number; idx: number }[] = [];
          s.values.forEach((v, i) => {
            if (v === null) return;
            points.push({ x: xAt(i), y: yAt(v), v, idx: i });
          });
          if (points.length === 0) return null;
          const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
          const labelSet = new Set(s.labelIndices ?? []);
          return (
            <g key={s.name}>
              <path d={path} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              {points.map((p) => (
                <circle key={p.idx} cx={p.x} cy={p.y} r={labelSet.has(p.idx) ? 4 : 3} fill={s.color}>
                  <title>{`${s.name} ${labels[p.idx]}: ${fmt(p.v)}`}</title>
                </circle>
              ))}
            </g>
          );
        })}
      </svg>
      {series.length > 1 && (
        <div className="flex flex-wrap justify-center gap-4 mt-2">
          {series.map((s) => (
            <div key={s.name} className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
              <span className="w-3 h-0.5 inline-block" style={{ backgroundColor: s.color }} />
              {s.name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────── */
/*  Cover with shared timeline                                            */
/* ─────────────────────────────────────────────────────────────────── */

export function CoverSlide({
  slides,
  clientName,
}: {
  slides: string[];
  clientName: string;
}) {
  return (
    <Slide id="cover" slides={slides} dark>
      <div className="text-center">
        <Image
          src="/optimise-digital-logo-white.webp"
          alt="Optimise Digital"
          width={420}
          height={70}
          className="mx-auto mb-10 w-auto h-6 md:h-8"
          priority
        />
        <h1 className="text-4xl md:text-5xl font-bold text-blue-400 leading-tight">
          Google Ads, first month review<br />and the path forward
        </h1>
        <p className="mt-[140px] text-4xl md:text-5xl font-bold text-white leading-tight">
          {clientName}
        </p>

        <div className="mt-14 max-w-4xl mx-auto">
          <div className="relative">
            <div className="absolute left-0 right-0 top-3 h-0.5 bg-slate-700" />
            <div className="absolute left-0 top-3 h-0.5 bg-red-500" style={{ width: "57%" }} />
            <div className="absolute top-3 h-0.5 bg-blue-500" style={{ left: "57%", right: 0 }} />

            <div className="relative grid grid-cols-7 gap-2">
              {[
                { date: "Jul 2025", label: "Strong baseline", sub: "Both sites performing at expected levels", color: "red" },
                { date: "Aug 2025", label: "The traffic cliff", sub: "Site event drops both sites overnight", color: "red" },
                { date: "Sep to Nov 2025", label: "Partial bounce", sub: "Some traffic returns, well below baseline", color: "red" },
                { date: "Dec 2025 to Mar 2026", label: "Very low ad spend", sub: "Performance lacking, lead tracking not set up", color: "red" },
                { date: "13 Mar 2026", label: "Account takeover", sub: "Optimise Digital starts managing both accounts", color: "blue" },
                { date: "10 Apr 2026", label: "New campaigns live", sub: "Restructured campaigns live on both accounts", color: "blue" },
                { date: "6 May 2026", label: "Today", sub: "26 days into the new structure", color: "blue" },
              ].map((m) => (
                <div key={m.date} className="flex flex-col items-center text-center">
                  <div
                    className={`w-5 h-5 rounded-full border-4 border-slate-900 z-10 ${
                      m.color === "red" ? "bg-red-500" : "bg-blue-500"
                    }`}
                  />
                  <div
                    className={`mt-2 text-[11px] font-semibold ${
                      m.color === "red" ? "text-red-300" : "text-blue-300"
                    }`}
                  >
                    {m.date}
                  </div>
                  <div className="mt-1 text-xs font-semibold text-white leading-tight">{m.label}</div>
                  <div className="mt-1 text-[11px] text-slate-400 leading-snug">{m.sub}</div>
                </div>
              ))}
            </div>

            <div className="mt-8 flex justify-between text-[11px] font-semibold uppercase tracking-wider">
              <span className="text-red-300">Before Optimise Digital (8 months)</span>
              <span className="text-blue-300">With Optimise Digital (under 8 weeks)</span>
            </div>
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={() => window.print()}
        data-no-print="true"
        className="absolute bottom-9 right-4 inline-flex items-center gap-1.5 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-3 py-1.5 transition-colors z-10"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
        Download PDF
      </button>
    </Slide>
  );
}

/* ─────────────────────────────────────────────────────────────────── */
/*  Page-level progress bar + print styles                               */
/* ─────────────────────────────────────────────────────────────────── */

export function ProgressBar() {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const onScroll = () => {
      const docH = document.documentElement.scrollHeight - window.innerHeight;
      setProgress(docH > 0 ? Math.min(100, (window.scrollY / docH) * 100) : 0);
    };
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <div className="fixed top-0 left-0 right-0 h-1 bg-slate-200 dark:bg-slate-800 z-50" data-no-print="true">
      <div className="h-full bg-blue-600 transition-all" style={{ width: `${progress}%` }} />
    </div>
  );
}

export function PrintStyles() {
  return (
    <style
      dangerouslySetInnerHTML={{
        __html: `
          @media print {
            @page { size: A4 landscape; margin: 0; }
            html, body {
              margin: 0 !important;
              padding: 0 !important;
              background: transparent !important;
            }
            * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
            main { display: block !important; }
            /* Each slide fills exactly one A4 landscape page (297mm wide,
               210mm tall) and the section's own background paints all the
               way to the page edge. Using mm units instead of vh because
               vh is the browser viewport, not the print page. */
            section[id] {
              width: 297mm !important;
              height: 210mm !important;
              min-height: 210mm !important;
              max-height: 210mm !important;
              margin: 0 !important;
              padding: 0 !important;
              box-sizing: border-box;
              page-break-after: always;
              break-after: page;
              page-break-inside: avoid;
              break-inside: avoid;
              overflow: hidden;
              display: flex !important;
              flex-direction: column !important;
            }
            section[id] > div:first-child {
              flex: 1 1 auto !important;
              padding-top: 28px !important;
              padding-bottom: 28px !important;
            }
            section[id]:last-of-type { page-break-after: auto; break-after: auto; }
            [data-no-print="true"] { display: none !important; }
          }
        `,
      }}
    />
  );
}

/* ─────────────────────────────────────────────────────────────────── */
/*  Reusable slide content blocks                                        */
/* ─────────────────────────────────────────────────────────────────── */

export function ShippedSlide({
  id,
  slides,
  client,
  did,
  produced,
}: {
  id: string;
  slides: string[];
  client: string;
  did: string[];
  produced: React.ReactNode[];
}) {
  return (
    <Slide id={id} slides={slides} light>
      <SlideHeading>{client}, what we shipped, what it produced</SlideHeading>
      <SlideSubtext>Live data from 10 April 2026 to today, pulled directly from Google Ads.</SlideSubtext>

      <div className="max-w-5xl mx-auto w-full">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-lg border border-blue-200 dark:border-blue-900 bg-white dark:bg-slate-900 overflow-hidden">
            <div className="px-4 py-2 bg-blue-50 dark:bg-blue-950/40 border-b border-blue-200 dark:border-blue-900">
              <div className="text-xs font-semibold uppercase tracking-wider text-blue-700 dark:text-blue-300">What we did</div>
            </div>
            <ul className="p-4 space-y-2 text-sm text-slate-700 dark:text-slate-200">
              {did.map((d, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-blue-500 font-bold">·</span>
                  <span>{d}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-lg border border-emerald-200 dark:border-emerald-900 bg-white dark:bg-slate-900 overflow-hidden">
            <div className="px-4 py-2 bg-emerald-50 dark:bg-emerald-950/40 border-b border-emerald-200 dark:border-emerald-900">
              <div className="text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">What it produced</div>
            </div>
            <ul className="p-4 space-y-2 text-sm text-slate-700 dark:text-slate-200">
              {produced.map((p, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-emerald-500 font-bold">·</span>
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-4 rounded-lg border border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-700 p-3 text-center">
          <p className="text-sm text-slate-800 dark:text-slate-100">
            <strong className="text-emerald-800 dark:text-emerald-200">
              The account is now healthy and set up to best practice.
            </strong>{" "}
            Before the takeover, the campaign structure, ad copy, negative keywords and lead tracking were not set up correctly. They are now.
          </p>
        </div>
      </div>
    </Slide>
  );
}

export function LeadsSlide({
  id,
  slides,
  client,
  forms,
  phones,
  total,
  copy,
}: {
  id: string;
  slides: string[];
  client: string;
  forms: number;
  phones: number;
  total: number;
  copy: string;
}) {
  return (
    <Slide id={id} slides={slides}>
      <SlideHeading>{client}, leads since the new campaigns went live</SlideHeading>
      <SlideSubtext>Every form submission and phone click from 10 April to today, pulled live from Google Ads.</SlideSubtext>
      <div className="max-w-3xl mx-auto w-full">
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 text-center">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
              Form submissions
            </div>
            <div className="text-5xl font-bold text-slate-900 dark:text-white">{forms}</div>
          </div>
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 text-center">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
              Phone clicks
            </div>
            <div className="text-5xl font-bold text-slate-900 dark:text-white">{phones}</div>
          </div>
          <div className="rounded-lg border border-blue-600 bg-blue-600 p-6 text-center text-white">
            <div className="text-xs font-semibold uppercase tracking-wider text-blue-100 mb-2">Total leads</div>
            <div className="text-5xl font-bold">{total}</div>
          </div>
        </div>
        <p className="mt-6 text-sm md:text-base text-slate-700 dark:text-slate-200 text-center max-w-2xl mx-auto">
          {copy}
        </p>
      </div>
    </Slide>
  );
}

export interface SearchTermRow {
  term: string;
  clicks: number;
  spend: number;
  leads: number;
}

export function SearchTermsSlide({
  id,
  slides,
  client,
  subtitle,
  stats,
  rows,
}: {
  id: string;
  slides: string[];
  client: string;
  subtitle: string;
  stats: { v: string; l: string }[];
  rows: SearchTermRow[];
}) {
  return (
    <Slide id={id} slides={slides} light>
      <SlideHeading>How customers search for {client}</SlideHeading>
      <SlideSubtext>{subtitle}</SlideSubtext>
      <div className="max-w-4xl mx-auto w-full">
        <div className="grid grid-cols-5 gap-2 mb-4">
          {stats.map((s) => (
            <div
              key={s.l}
              className="rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-2 py-2 text-center"
            >
              <div className="text-base font-bold text-slate-900 dark:text-white">{s.v}</div>
              <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">{s.l}</div>
            </div>
          ))}
        </div>

        <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden">
          <div className="px-3 py-2 bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Top searches customers actually typed (April 2026)
            </div>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50/50 dark:bg-slate-800/50 text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <th className="px-3 py-1.5 text-left font-semibold">Search term</th>
                <th className="px-3 py-1.5 text-right font-semibold">Clicks</th>
                <th className="px-3 py-1.5 text-right font-semibold">Spend</th>
                <th className="px-3 py-1.5 text-right font-semibold">Leads</th>
                <th className="px-3 py-1.5 text-right font-semibold">CPA</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {rows.map((r) => {
                const cpa = r.leads > 0 ? `$${Math.round(r.spend / r.leads)}` : "-";
                const cpaClass = r.leads > 0 ? "text-slate-900 dark:text-white font-semibold" : "text-slate-400";
                const leadsClass = r.leads > 0 ? "text-emerald-700 dark:text-emerald-400 font-semibold" : "text-slate-400";
                return (
                  <tr key={r.term}>
                    <td className="px-3 py-1.5 text-slate-700 dark:text-slate-200">{r.term}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-slate-600 dark:text-slate-300">{r.clicks}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-slate-900 dark:text-white font-semibold">${r.spend}</td>
                    <td className={`px-3 py-1.5 text-right tabular-nums ${leadsClass}`}>{r.leads > 0 ? r.leads : "-"}</td>
                    <td className={`px-3 py-1.5 text-right tabular-nums ${cpaClass}`}>{cpa}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </Slide>
  );
}

export function NextSlide({
  id,
  slides,
  client,
  items,
}: {
  id: string;
  slides: string[];
  client: string;
  items: [string, string, string][];
}) {
  return (
    <Slide id={id} slides={slides}>
      <SlideHeading>What is next for {client}</SlideHeading>
      <SlideSubtext>Six workstreams running in parallel.</SlideSubtext>
      <div className="max-w-4xl mx-auto w-full">
        <div className="space-y-2.5">
          {items.map(([h, w, why]) => (
            <div key={h} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="text-sm font-semibold text-slate-900 dark:text-white">{h}</div>
                <div className="text-sm text-slate-700 dark:text-slate-200">{w}</div>
                <div className="text-sm text-slate-600 dark:text-slate-300">
                  <span className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-0.5">
                    Why it matters
                  </span>
                  {why}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Slide>
  );
}
