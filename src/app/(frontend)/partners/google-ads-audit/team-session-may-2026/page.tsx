"use client";

import "./globals.css";
import Image from "next/image";
import { useEffect, useState } from "react";

/* ─────────────────────────────────────────────────────────────────── */
/*  Slide primitives, mirroring the [slug]/page.tsx audit template       */
/* ─────────────────────────────────────────────────────────────────── */

const SLIDES = [
  "title",
  "agenda",
  "ps101-auction",
  "month1-shipped",
  "mtp-traffic-chart",
  "mtp-channel-chart",
  "mtp-paid-state-chart",
  "berendsen-traffic-chart",
  "berendsen-channel-chart",
  "berendsen-paid-state-chart",
  "mtp-conversion-mix",
  "berendsen-conversion-mix",
  "berendsen-cash-validation",
  "berendsen-cash-table",
  "optimisations-overview",
  "keyword-relevancy",
  "berendsen-lp-callout",
  "berendsen-lp-mismatch",
  "berendsen-seals",
  "berendsen-brand-defence",
  "berendsen-budget",
  "tracking-dashboard",
  "month1-tracking-caveat",
  "mtp-next",
  "month1-90day-target",
  "qa",
];

function RocketButton({ currentId, className }: { currentId: string; className?: string }) {
  const currentIndex = SLIDES.indexOf(currentId);
  const nextId = SLIDES[currentIndex + 1];
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

function Slide({
  id,
  children,
  dark = false,
  light = false,
  rocketClassName,
}: {
  id: string;
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
  const slideNumber = SLIDES.indexOf(id) + 1;
  const numberColor = dark ? "text-slate-500" : "text-slate-400 dark:text-slate-500";
  return (
    <section id={id} className={`relative min-h-[680px] lg:min-h-[780px] flex flex-col ${bg}`}>
      <div className="flex-1 flex flex-col justify-center px-6 pt-20 pb-12 max-w-5xl mx-auto w-full">
        {children}
      </div>
      <div data-no-print="true">
        <RocketButton currentId={id} className={rocketClassName} />
      </div>
      <div
        data-no-print="true"
        className={`absolute bottom-3 right-4 text-xs font-mono tabular-nums ${numberColor} select-none pointer-events-none`}
        aria-hidden="true"
      >
        {slideNumber} / {SLIDES.length}
      </div>
    </section>
  );
}

function SlideHeading({ children, dark = false }: { children: React.ReactNode; dark?: boolean }) {
  return (
    <h2
      className={`text-2xl md:text-3xl font-bold text-center mb-4 max-w-3xl mx-auto ${
        dark ? "text-white" : "text-slate-900 dark:text-white"
      }`}
    >
      {children}
    </h2>
  );
}

function SlideSubtext({ children, dark = false }: { children: React.ReactNode; dark?: boolean }) {
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

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-slate-50 dark:bg-slate-800 rounded-2xl p-6 border border-slate-200 dark:border-slate-700">
      <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">{label}</div>
      <div className="text-3xl font-bold text-slate-900 dark:text-white">{value}</div>
      {sub && <div className="text-xs text-slate-500 dark:text-slate-400 mt-2">{sub}</div>}
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm">
      <h3 className="text-base font-bold text-slate-900 dark:text-white mb-3">{title}</h3>
      <div className="text-sm text-slate-600 dark:text-slate-300 space-y-2">{children}</div>
    </div>
  );
}

function Pill({ children, tone = "blue" }: { children: React.ReactNode; tone?: "blue" | "amber" | "green" | "red" }) {
  const tones = {
    blue: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
    amber: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
    green: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
    red: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  };
  return <span className={`text-xs font-semibold px-2 py-1 rounded ${tones[tone]}`}>{children}</span>;
}

interface Series {
  name: string;
  color: string;
  values: (number | null)[];
  labelIndices?: number[];
}

function LineChart({
  labels,
  series,
  height = 280,
  yAxisLabel,
  formatY,
  annotations = [],
}: {
  labels: string[];
  series: Series[];
  height?: number;
  yAxisLabel?: string;
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
        {/* Grid + Y axis labels */}
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
        {/* X-axis labels (every month) */}
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
        {/* Annotations (vertical line + label) */}
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
        {/* Series lines + points */}
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
              {points
                .filter((p) => labelSet.has(p.idx))
                .map((p) => (
                  <g key={`lbl-${p.idx}`}>
                    <rect
                      x={p.x - 18}
                      y={p.y - 20}
                      width={36}
                      height={14}
                      rx={3}
                      fill="white"
                      stroke={s.color}
                      strokeWidth={1}
                    />
                    <text
                      x={p.x}
                      y={p.y - 10}
                      textAnchor="middle"
                      fontSize="10"
                      fontWeight="bold"
                      fill={s.color}
                    >
                      {fmt(p.v)}
                    </text>
                  </g>
                ))}
            </g>
          );
        })}
        {yAxisLabel && (
          <text
            x={12}
            y={padT + innerH / 2}
            fontSize="10"
            fill="rgb(100,116,139)"
            transform={`rotate(-90 12 ${padT + innerH / 2})`}
            textAnchor="middle"
          >
            {yAxisLabel}
          </text>
        )}
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

function DualAxisLineChart({
  labels,
  leftSeries,
  rightSeries,
  height = 300,
  leftLabel,
  rightLabel,
  formatLeftY,
  formatRightY,
  annotations = [],
}: {
  labels: string[];
  leftSeries: Series;
  rightSeries: Series;
  height?: number;
  leftLabel?: string;
  rightLabel?: string;
  formatLeftY?: (v: number) => string;
  formatRightY?: (v: number) => string;
  annotations?: { atIndex: number; label: string; color?: string }[];
}) {
  const width = 720;
  const padL = 60;
  const padR = 60;
  const padT = 16;
  const padB = 48;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;
  const leftMax = Math.max(...leftSeries.values.filter((v): v is number => typeof v === "number"), 1);
  const rightMax = Math.max(...rightSeries.values.filter((v): v is number => typeof v === "number"), 1);
  const niceLeft = Math.ceil(leftMax / 5) * 5 + (leftMax % 5 === 0 ? 5 : 0);
  const niceRight = Math.ceil(rightMax / 5) * 5 + (rightMax % 5 === 0 ? 5 : 0);
  const yTicks = 5;
  const xStep = innerW / Math.max(1, labels.length - 1);
  const xAt = (i: number) => padL + i * xStep;
  const yLeftAt = (v: number) => padT + innerH - (v / niceLeft) * innerH;
  const yRightAt = (v: number) => padT + innerH - (v / niceRight) * innerH;
  const fmtL = formatLeftY ?? ((v) => v.toLocaleString());
  const fmtR = formatRightY ?? ((v) => v.toLocaleString());

  const buildPath = (series: Series, yFn: (v: number) => number) => {
    const points: { x: number; y: number; v: number; idx: number }[] = [];
    series.values.forEach((v, i) => {
      if (v === null) return;
      points.push({ x: xAt(i), y: yFn(v), v, idx: i });
    });
    return points;
  };
  const leftPoints = buildPath(leftSeries, yLeftAt);
  const rightPoints = buildPath(rightSeries, yRightAt);
  const leftPath = leftPoints.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  const rightPath = rightPoints.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-700 shadow-sm">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto">
        {/* Grid lines + dual y-axis labels */}
        {Array.from({ length: yTicks + 1 }).map((_, i) => {
          const y = padT + (innerH * i) / yTicks;
          const lv = niceLeft - (niceLeft / yTicks) * i;
          const rv = niceRight - (niceRight / yTicks) * i;
          return (
            <g key={i}>
              <line x1={padL} x2={width - padR} y1={y} y2={y} stroke="rgb(226,232,240)" strokeDasharray="2,3" strokeWidth={1} />
              <text x={padL - 8} y={y + 4} textAnchor="end" fontSize="10" fill={leftSeries.color}>
                {fmtL(lv)}
              </text>
              <text x={width - padR + 8} y={y + 4} textAnchor="start" fontSize="10" fill={rightSeries.color}>
                {fmtR(rv)}
              </text>
            </g>
          );
        })}
        {/* X-axis labels */}
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
        {/* Annotations */}
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
        {/* Left series */}
        <g>
          <path d={leftPath} fill="none" stroke={leftSeries.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {leftPoints.map((p) => (
            <circle key={p.idx} cx={p.x} cy={p.y} r={3} fill={leftSeries.color}>
              <title>{`${leftSeries.name} ${labels[p.idx]}: ${fmtL(p.v)}`}</title>
            </circle>
          ))}
        </g>
        {/* Right series */}
        <g>
          <path d={rightPath} fill="none" stroke={rightSeries.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {rightPoints.map((p) => (
            <circle key={p.idx} cx={p.x} cy={p.y} r={3} fill={rightSeries.color}>
              <title>{`${rightSeries.name} ${labels[p.idx]}: ${fmtR(p.v)}`}</title>
            </circle>
          ))}
        </g>
        {/* Axis labels */}
        {leftLabel && (
          <text x={14} y={padT + innerH / 2} fontSize="10" fill={leftSeries.color} transform={`rotate(-90 14 ${padT + innerH / 2})`} textAnchor="middle">
            {leftLabel}
          </text>
        )}
        {rightLabel && (
          <text x={width - 14} y={padT + innerH / 2} fontSize="10" fill={rightSeries.color} transform={`rotate(-90 ${width - 14} ${padT + innerH / 2})`} textAnchor="middle">
            {rightLabel}
          </text>
        )}
      </svg>
      <div className="flex flex-wrap justify-center gap-4 mt-2">
        <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
          <span className="w-3 h-0.5 inline-block" style={{ backgroundColor: leftSeries.color }} />
          {leftSeries.name} <span className="text-slate-400">(left axis)</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
          <span className="w-3 h-0.5 inline-block" style={{ backgroundColor: rightSeries.color }} />
          {rightSeries.name} <span className="text-slate-400">(right axis)</span>
        </div>
      </div>
    </div>
  );
}

function HorizontalBarChart({
  rows,
  height = 320,
}: {
  rows: { label: string; value: number; color?: string }[];
  height?: number;
}) {
  const max = Math.max(...rows.map((r) => Math.abs(r.value)), 1);
  const rowH = height / rows.length;
  const labelW = 140;
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-700 shadow-sm overflow-x-auto">
      <svg viewBox={`0 0 720 ${height + 12}`} className="w-full h-auto">
        {rows.map((r, i) => {
          const isNeg = r.value < 0;
          const barW = (Math.abs(r.value) / max) * (720 - labelW - 80);
          const y = i * rowH + 6;
          const x = isNeg ? labelW + (720 - labelW - 80 - barW) : labelW;
          const fill = r.color ?? (isNeg ? "rgb(220,38,38)" : "rgb(37,99,235)");
          return (
            <g key={i}>
              <text x={labelW - 8} y={y + rowH / 2 + 4} textAnchor="end" fontSize="11" fill="rgb(51,65,85)">
                {r.label}
              </text>
              <rect x={x} y={y + rowH / 2 - 9} width={barW} height={18} fill={fill} rx={3} />
              <text
                x={isNeg ? x - 4 : x + barW + 4}
                y={y + rowH / 2 + 4}
                fontSize="11"
                fill="rgb(51,65,85)"
                textAnchor={isNeg ? "end" : "start"}
              >
                {r.value >= 0 ? "+" : ""}
                {Math.abs(r.value) >= 1000 ? `${(r.value / 1000).toFixed(1)}k` : r.value.toLocaleString()}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function DataTable({ headers, rows }: { headers: string[]; rows: (string | React.ReactNode)[][] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
      <table className="w-full text-sm">
        <thead className="bg-blue-600 text-white">
          <tr>
            {headers.map((h) => (
              <th key={h} className="px-4 py-2 text-left font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className={i % 2 === 0 ? "bg-slate-50 dark:bg-slate-800" : "bg-white dark:bg-slate-900"}>
              {row.map((cell, j) => (
                <td key={j} className="px-4 py-2 text-slate-700 dark:text-slate-200">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────── */
/*  Page                                                                  */
/* ─────────────────────────────────────────────────────────────────── */

export default function TeamSessionMay2026() {
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
    <div>
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @media print {
              @page { size: A4 landscape; margin: 0; }
              html, body { background: white !important; }
              * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
              section[id] {
                min-height: 0 !important;
                height: 100vh !important;
                page-break-after: always;
                break-after: page;
                box-sizing: border-box;
                /* Shrink each slide to ~85% in print so long slides fit on one
                   landscape page. zoom (not transform: scale) recalculates
                   layout so widths still work and there's no horizontal scroll. */
                zoom: 0.85;
              }
              section[id]:last-of-type { page-break-after: auto; break-after: auto; }
              [data-no-print="true"] { display: none !important; }
            }
          `,
        }}
      />
      <div className="fixed top-0 left-0 right-0 h-1 bg-slate-200 dark:bg-slate-800 z-50" data-no-print="true">
        <div className="h-full bg-blue-600 transition-all" style={{ width: `${progress}%` }} />
      </div>

      {/* ── Slide 1: Title ─────────────────────────────────────────── */}
      <Slide id="title" dark>
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
          <p className="mt-[140px] text-base md:text-lg font-semibold text-slate-200">Berendsen Fluid Power · Malcolm Thompson Pumps</p>

          {/* Visual timeline */}
          <div className="mt-14 max-w-3xl mx-auto">
            <div className="relative">
              <div className="absolute left-0 right-0 top-3 h-0.5 bg-slate-700" />
              <div className="absolute left-0 top-3 h-0.5 bg-blue-500" style={{ width: "100%" }} />
              <div className="relative grid grid-cols-5 gap-2">
                {[
                  { date: "13 Mar 2026", label: "Account takeover", sub: "First day working with the client" },
                  { date: "16 Mar 2026", label: "Campaign structure proposed", sub: "First round of campaign proposals sent" },
                  { date: "25 Mar 2026", label: "Conversion tracking live", sub: "Phone calls, forms, GTM + GA4 verified" },
                  { date: "10 Apr 2026", label: "New campaign structure live", sub: "Brand / Generic split, RSAs, phrase-match layer" },
                  { date: "6 May 2026", label: "Today, 26 days in", sub: "First month review" },
                ].map((m) => (
                  <div key={m.date} className="flex flex-col items-center text-center">
                    <div className="w-5 h-5 rounded-full bg-blue-500 border-4 border-slate-900 z-10" />
                    <div className="mt-2 text-[11px] font-semibold text-blue-300">{m.date}</div>
                    <div className="mt-1 text-xs font-semibold text-white leading-tight">{m.label}</div>
                    <div className="mt-1 text-[11px] text-slate-400 leading-snug">{m.sub}</div>
                  </div>
                ))}
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

      {/* ── Slide 2: Agenda ────────────────────────────────────────── */}
      <Slide id="agenda" light>
        <SlideHeading>Agenda</SlideHeading>
        <SlideSubtext>Six sections, 90 minutes total. Q&A throughout, formal Q&A at the end.</SlideSubtext>
        <div className="grid md:grid-cols-2 gap-4 max-w-3xl mx-auto w-full">
          <Card title="1. Paid Search 101 · 5 min">
            <p>How Google Ads actually works. Account hierarchy, the auction, one worked example.</p>
          </Card>
          <Card title="2. What has been shipped by Optimise Digital · 10 min">
            <p>The work delivered in month one across both accounts: campaign restructure, conversion tracking, RSAs, negative lists, phrase-match coverage.</p>
          </Card>
          <Card title="3. Historical data for context · 15 min">
            <p>GA4 sessions by month and channel, both clients, Jan 2025 to Apr 2026. Anchored on the August 2025 site event so the rest of the session sits in the right context.</p>
          </Card>
          <Card title="4. MTP deep dive · 15 min">
            <p>What we changed, conversion mix, the path back to baseline.</p>
          </Card>
          <Card title="5. Berendsen deep dive · 15 min">
            <p>Paid sessions by state, conversion mix, the tracking callout, the validation work still needed with the business.</p>
          </Card>
          <Card title="6. Optimisations + how we track progress · 25 min">
            <p>Landing-page fixes, hydraulic-seals + &lsquo;near me&rsquo; routing, brand-defence gap, budget reallocation. Plus the dashboard walkthrough and what we still need from each business to validate.</p>
          </Card>
        </div>
        <p className="mt-6 text-center text-sm text-slate-500 dark:text-slate-400">Wrap + Q&A at the end · 5 min</p>
      </Slide>

      {/* ── SECTION 1: First month results ────────────────────────── */}

      {/* ── SECTION 1: Paid Search 101 ────────────────────────────── */}

      <Slide id="ps101-auction">
        <SlideHeading>Paid Search 101: the auction and the hierarchy</SlideHeading>
        <SlideSubtext>How the auction works (top), where everything lives (bottom), one example ad spelled out end-to-end.</SlideSubtext>

        {/* Auction strip */}
        <div className="bg-slate-50 dark:bg-slate-800 rounded-2xl p-4 border border-slate-200 dark:border-slate-700 mb-5">
          <div className="grid md:grid-cols-5 gap-3 items-start">
            {[
              ["Search", "Someone types a query into Google"],
              ["Eligibility", "Google finds every keyword whose ad could serve"],
              ["Auction", "Each is ranked: bid × Quality Score = Ad Rank"],
              ["Position", "Top Ad Rank wins position 1, next wins 2"],
              ["Cost", "Winner pays just enough to beat the next-highest Ad Rank"],
            ].map(([title, body], i) => (
              <div key={title} className="text-center">
                <div className="w-7 h-7 mx-auto rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center mb-1">
                  {i + 1}
                </div>
                <div className="font-semibold text-slate-900 dark:text-white text-xs">{title}</div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">{body}</div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11px] text-slate-500 dark:text-slate-400 text-center italic">
            <span className="font-semibold">Quality Score</span> (1–10) reflects keyword ↔ ad ↔ landing page relevance. Higher QS lets you outrank competitors with a lower bid.
          </p>
        </div>

        {/* Hierarchy with worked example */}
        <div className="grid md:grid-cols-2 gap-4 items-start">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-300 mb-2">The account hierarchy</div>
            <div className="space-y-1.5">
              {[
                ["Account", "One per business. All settings, billing, data."],
                ["Campaign", "Budget + targeting + bid strategy."],
                ["Ad Group", "Tightly themed bucket: keywords + ads."],
                ["Keyword", "What you bid on, with a match type."],
                ["Ad", "What gets served. Today: RSAs."],
                ["Landing Page", "Where the click lands. Drives Quality Score."],
              ].map(([level, body], i) => (
                <div key={level} className="flex items-stretch" style={{ marginLeft: `${i * 18}px` }}>
                  <div className="w-1 bg-blue-500 rounded-l" />
                  <div className="bg-white dark:bg-slate-900 rounded-r-lg px-3 py-2 border border-l-0 border-slate-200 dark:border-slate-700 flex-1 shadow-sm">
                    <div className="text-xs font-bold text-blue-700 dark:text-blue-300">{level}</div>
                    <div className="text-[11px] text-slate-600 dark:text-slate-300 leading-snug">{body}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4 border border-blue-200 dark:border-blue-800">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-300 mb-2">Worked example, Berendsen</div>
            <div className="text-xs text-slate-700 dark:text-slate-200 space-y-1.5">
              <div><span className="font-semibold text-blue-700 dark:text-blue-300">Account:</span> Berendsen Fluid Power</div>
              <div><span className="font-semibold text-blue-700 dark:text-blue-300">Campaign:</span> Generic_Products_Hydraulic-Components</div>
              <div className="ml-3 mt-1.5 border-l-2 border-blue-300 dark:border-blue-700 pl-3 space-y-1.5">
                <div>
                  <div className="font-semibold text-blue-700 dark:text-blue-300">Ad Group: Hydraulic-Cylinders</div>
                  <ul className="ml-3 mt-0.5 text-[11px] text-slate-600 dark:text-slate-300 space-y-0.5">
                    <li>&ldquo;hydraulic cylinder repair&rdquo; PHRASE</li>
                    <li>&ldquo;hydraulic cylinder rebuild&rdquo; PHRASE</li>
                    <li>[hydraulic cylinder repair sydney] EXACT</li>
                  </ul>
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  <span className="font-semibold text-blue-700 dark:text-blue-300">Ad Group: Hydraulic-Hoses</span>
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  <span className="font-semibold text-blue-700 dark:text-blue-300">Ad Group: Hydraulic-Pumps</span>
                </div>
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-blue-200 dark:border-blue-800">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-300 mb-1">The ad served + landing page</div>
              <div className="bg-white dark:bg-slate-900 rounded-lg p-3 border border-slate-200 dark:border-slate-700">
                <div className="text-[11px] text-emerald-700 dark:text-emerald-400 mb-0.5">Ad · berendsen.com.au/hydraulic-cylinders</div>
                <div className="text-sm font-semibold text-blue-700 dark:text-blue-300 leading-tight">Hydraulic Cylinder Repair AU · 12 Branches Nationwide</div>
                <div className="text-xs text-slate-600 dark:text-slate-300 mt-1 leading-snug">Same-day quotes on cylinder repairs and rebuilds. OEM-grade seals, full test certification. Talk to a fluid power engineer today.</div>
              </div>
            </div>
          </div>
        </div>
      </Slide>

      {/* ── SECTION 2: What we shipped ───────────────────────────── */}

      <Slide id="month1-shipped" light>
        <SlideHeading>What we shipped in month one</SlideHeading>
        <SlideSubtext>Both clients went live with restructured campaigns on 10 April. Here is what 25 days produced.</SlideSubtext>

        <div className="grid md:grid-cols-3 gap-3">
          <Card title="Website full analysis">
            <p>Audited every top landing page, the search intent feeding it, and how each page serves users. The blueprint for the campaign structure that followed.</p>
          </Card>
          <Card title="Campaign restructure">
            <p>Migrated to a clean Brand / Generic split, organised by intent. Old paused ETAs left behind, new RSAs the primary serving format.</p>
          </Card>
          <Card title="Conversion tracking rebuilt">
            <p>Phone calls and form submissions now tracked correctly. Tracking on the previous accounts wasn&apos;t set up correctly, so this is the new baseline.</p>
          </Card>
          <Card title="New ad copy created and added">
            <p>Fresh Responsive Search Ads per ad group across both accounts, aligned to landing page intent. Replaces legacy ETA copy.</p>
          </Card>
          <Card title="Negative keyword lists, set up">
            <p>Account-level negative lists built and applied to refine searches. Filters out irrelevant queries so spend lands on commercial intent only.</p>
          </Card>
          <Card title="Phrase-match coverage layer">
            <p>28 phrase keywords on Berendsen, 15 on MTP, on top of the new exact-only structure. Closes the exact-match cold-start gap.</p>
          </Card>
        </div>
      </Slide>

      {/* ── SECTION 3: Both accounts, the data ──────────────────────── */}

      <Slide id="mtp-traffic-chart" light>
        <SlideHeading>MTP total Australian sessions, Jan 2025 to Apr 2026</SlideHeading>
        <SlideSubtext>The cliff in August 2025 is the dominant feature. Recovery has begun but is still ~70% below baseline.</SlideSubtext>
        <LineChart
          labels={["Jan 25","Feb 25","Mar 25","Apr 25","May 25","Jun 25","Jul 25","Aug 25","Sep 25","Oct 25","Nov 25","Dec 25","Jan 26","Feb 26","Mar 26","Apr 26"]}
          series={[
            { name: "Total AU sessions", color: "rgb(37,99,235)", values: [3930,3810,4012,3276,3875,3442,2192,8,1411,2064,1850,1040,892,458,608,1216] },
          ]}
          annotations={[{ atIndex: 7, label: "Aug 25 site event" }]}
          formatY={(v) => v.toLocaleString()}
        />
        <p className="mt-6 text-sm text-slate-600 dark:text-slate-300 text-center max-w-3xl mx-auto">
          Pre-August baseline averaged 3,500 to 4,000 sessions per month. April 2026 sits at 1,216, a doubling of March (608) but still well below where the site was in early 2025.
        </p>
      </Slide>

      <Slide id="mtp-channel-chart">
        <SlideHeading>MTP channel breakdown over time</SlideHeading>
        <SlideSubtext>Where the recovery is and isn&apos;t happening. Direct is healthy. Organic is the long-term gap.</SlideSubtext>
        <LineChart
          labels={["Jan 25","Feb 25","Mar 25","Apr 25","May 25","Jun 25","Jul 25","Aug 25","Sep 25","Oct 25","Nov 25","Dec 25","Jan 26","Feb 26","Mar 26","Apr 26"]}
          series={[
            { name: "Paid Search", color: "rgb(37,99,235)", values: [2752,2348,2816,2488,3107,2527,1550,2,773,930,778,160,124,6,87,451] },
            { name: "Organic", color: "rgb(16,185,129)", values: [1895,1961,1911,1569,1721,1192,776,1,589,1021,951,687,732,280,367,612] },
            { name: "Direct", color: "rgb(245,158,11)", values: [1276,1034,1484,767,637,1022,491,5,408,796,1927,1416,551,579,561,1355] },
            { name: "Referral", color: "rgb(168,85,247)", values: [47,111,80,45,32,111,81,0,84,159,73,156,31,28,26,63] },
          ]}
          annotations={[{ atIndex: 7, label: "Aug 25 site event" }]}
        />
        <div className="mt-6 grid md:grid-cols-3 gap-4 text-sm text-slate-600 dark:text-slate-300">
          <div><span className="font-semibold text-slate-900 dark:text-white">Paid:</span> recovering but well below the ~2,500 to 3,100 baseline. Phrase-match additions should compound.</div>
          <div><span className="font-semibold text-slate-900 dark:text-white">Organic:</span> 60 to 70% shortfall vs baseline, the SEO recovery story.</div>
          <div><span className="font-semibold text-slate-900 dark:text-white">Direct:</span> back to baseline. Brand awareness and returning customers are healthy.</div>
        </div>
      </Slide>

      <Slide id="mtp-paid-state-chart" light>
        <SlideHeading>MTP Google paid (CPC) sessions by state, monthly</SlideHeading>
        <SlideSubtext>Pre-Aug 2025 there was very little paid traffic. The new structure ramps from Sept 2025; April 2026 is the strongest month since Nov 2025.</SlideSubtext>
        <LineChart
          labels={["Jan 25","Feb 25","Mar 25","Apr 25","May 25","Jun 25","Jul 25","Aug 25","Sep 25","Oct 25","Nov 25","Dec 25","Jan 26","Feb 26","Mar 26","Apr 26"]}
          series={[
            { name: "NSW", color: "rgb(37,99,235)", values: [0,0,0,0,9,22,28,0,365,471,399,69,51,4,43,254] },
            { name: "WA", color: "rgb(245,158,11)", values: [0,0,0,0,11,11,27,0,319,338,267,53,50,1,38,110] },
            { name: "QLD", color: "rgb(16,185,129)", values: [0,0,0,0,14,17,2,0,19,25,25,3,4,0,1,53] },
            { name: "VIC", color: "rgb(168,85,247)", values: [0,0,0,0,1,4,2,0,13,45,20,4,4,0,0,43] },
          ]}
        />
        <p className="mt-6 text-sm text-slate-600 dark:text-slate-300 text-center max-w-3xl mx-auto">
          April 2026 delivered 473 paid sessions across Australia (NSW 254, WA 110, QLD 53, VIC 43). 5.8x March. The 15 phrase-match keywords we added should compound this in May.
        </p>
      </Slide>

      <Slide id="berendsen-traffic-chart" light>
        <SlideHeading>Berendsen total Australian sessions, Jan 2025 to Apr 2026</SlideHeading>
        <SlideSubtext>Same August 2025 cliff as MTP. NSW dropped 72% in one month and is still ~24% below year-ago levels.</SlideSubtext>
        <LineChart
          labels={["Jan 25","Feb 25","Mar 25","Apr 25","May 25","Jun 25","Jul 25","Aug 25","Sep 25","Oct 25","Nov 25","Dec 25","Jan 26","Feb 26","Mar 26","Apr 26"]}
          series={[
            { name: "Total AU sessions", color: "rgb(37,99,235)", values: [4320,4631,4509,4846,4759,4638,5166,1364,2621,3896,2636,3984,5078,5236,4883,4095] },
            { name: "NSW only", color: "rgb(245,158,11)", values: [1683,1734,1753,1864,1705,1637,1842,518,899,1345,1003,1332,1273,1281,1339,1418] },
          ]}
          annotations={[{ atIndex: 7, label: "Aug 25 site event" }]}
        />
        <p className="mt-6 text-sm text-slate-600 dark:text-slate-300 text-center max-w-3xl mx-auto">
          NSW pre-August averaged ~1,700 sessions per month. Today it sits at 1,418. The recovery is real (climbing back from August) but not complete. Keep this curve in mind when we look at the cash-sales chart in a few slides time.
        </p>
      </Slide>

      <Slide id="berendsen-channel-chart">
        <SlideHeading>Berendsen NSW sessions by channel, monthly</SlideHeading>
        <SlideSubtext>Organic search dominates. It&apos;s the channel that hasn&apos;t fully recovered post-August.</SlideSubtext>
        <LineChart
          labels={["Jan 25","Feb 25","Mar 25","Apr 25","May 25","Jun 25","Jul 25","Aug 25","Sep 25","Oct 25","Nov 25","Dec 25","Jan 26","Feb 26","Mar 26","Apr 26"]}
          series={[
            { name: "Organic Search", color: "rgb(16,185,129)", values: [1051,1159,1110,979,1044,1016,1099,302,485,820,589,708,713,759,861,779], labelIndices: [3, 15] },
            { name: "Paid Search", color: "rgb(37,99,235)", values: [255,260,244,244,229,199,228,82,146,225,69,175,151,206,187,279], labelIndices: [3, 15] },
            { name: "Direct", color: "rgb(245,158,11)", values: [99,92,108,118,114,107,113,30,127,179,154,153,208,236,185,185] },
            { name: "Display", color: "rgb(168,85,247)", values: [201,130,194,440,245,227,309,56,92,38,0,84,6,1,2,31] },
          ]}
          annotations={[{ atIndex: 7, label: "Aug 25 site event" }]}
        />
        <p className="mt-6 text-sm text-slate-600 dark:text-slate-300 text-center max-w-3xl mx-auto">
          Organic search collapsed from ~1,100/month pre-August to 302 in Aug, recovered partially to 779 by April. That&apos;s a sustained 25 to 30% organic shortfall. Paid search and Direct are healthy. Display is essentially off.
        </p>
      </Slide>

      <Slide id="berendsen-paid-state-chart" light>
        <SlideHeading>Berendsen Google paid (CPC) sessions by state, monthly</SlideHeading>
        <SlideSubtext>NSW + QLD have been the consistent paid drivers. Note the WA spike Dec 2025 to Mar 2026 (specific WA campaign now ended).</SlideSubtext>
        <LineChart
          labels={["Jan 25","Feb 25","Mar 25","Apr 25","May 25","Jun 25","Jul 25","Aug 25","Sep 25","Oct 25","Nov 25","Dec 25","Jan 26","Feb 26","Mar 26","Apr 26"]}
          series={[
            { name: "NSW", color: "rgb(37,99,235)", values: [457,390,439,685,472,426,537,138,237,263,165,375,248,208,189,310] },
            { name: "WA", color: "rgb(245,158,11)", values: [178,173,133,202,115,111,135,16,62,46,61,462,1494,1438,987,128] },
            { name: "QLD", color: "rgb(16,185,129)", values: [249,224,287,374,233,308,350,77,181,174,87,318,213,175,160,225] },
            { name: "VIC", color: "rgb(168,85,247)", values: [215,181,179,278,251,316,350,83,130,106,69,222,165,133,132,203] },
          ]}
        />
      </Slide>

      {/* ── SECTION 4: Conversion mix, both accounts ─────────────── */}

      <Slide id="mtp-conversion-mix" light>
        <SlideHeading>MTP conversion mix by campaign (last 25 days)</SlideHeading>
        <SlideSubtext>Pulled live from Google Ads, segmented by conversion action. Shows where leads actually come from.</SlideSubtext>
        <DataTable
          headers={["Campaign", "Conversion action", "Category", "Conv (25d)"]}
          rows={[
            ["Brand", "Form Submission", <Pill key="b1" tone="green">Lead form</Pill>, "8"],
            ["Brand", "Phone Click", <Pill key="b2" tone="blue">Phone lead</Pill>, "7"],
            ["Generic - Services - Pump Repair & Maintenance", "Form Submission", <Pill key="m1" tone="green">Lead form</Pill>, "2"],
            ["Generic - Services - Pump Repair & Maintenance - Location", "Phone Click", <Pill key="m2" tone="blue">Phone lead</Pill>, "2"],
            ["Generic - Pump Types", "Phone Click", <Pill key="p1" tone="blue">Phone lead</Pill>, "1"],
            ["Generic - Pump Types", "Form Submission", <Pill key="p2" tone="green">Lead form</Pill>, "1"],
            ["Generic - Services - Pump Repair & Maintenance", "Phone Click", <Pill key="m3" tone="blue">Phone lead</Pill>, "1"],
            [<b key="total">TOTAL</b>, "", <b key="cat">22 (11 form, 11 phone)</b>, <b key="t">22</b>],
          ]}
        />
        <p className="mt-6 text-sm text-slate-600 dark:text-slate-300 text-center max-w-3xl mx-auto">
          <span className="font-semibold">What this tells us:</span> Brand campaigns drive 68% of conversions (15 of 22). The form/phone split is even (11 each). Generic - Industry Verticals shows zero conversions, validating our decision to pull budget out of it.
        </p>
      </Slide>

      <Slide id="berendsen-conversion-mix" light>
        <SlideHeading>Berendsen conversion mix by campaign (last 25 days)</SlideHeading>
        <SlideSubtext>Pulled live from Google Ads. 29 conversions in 25 days, 90% of them phone calls.</SlideSubtext>
        <DataTable
          headers={["Campaign", "Conversion action", "Category", "Conv (25d)"]}
          rows={[
            ["Generic_Products_Hydraulic-Components", "Phone Call Click", <Pill key="g1" tone="blue">Phone lead</Pill>, "15"],
            ["Brand_Product", "Phone Call Click", <Pill key="b1" tone="blue">Phone lead</Pill>, "8"],
            ["Generic_Products_Hydraulic-Components", "Form Submission", <Pill key="g2" tone="green">Lead form</Pill>, "3"],
            ["Generic_Services_Location", "Phone Call Click", <Pill key="l1" tone="blue">Phone lead</Pill>, "3"],
            [<b key="total">TOTAL</b>, "", <b key="cat">29 (3 form, 26 phone)</b>, <b key="t">29</b>],
          ]}
        />
        <div className="mt-6 grid md:grid-cols-2 gap-4">
          <Card title="What's working">
            <ul className="list-disc pl-5 space-y-1">
              <li>Generic_Products_Hydraulic-Components is the engine: 18 of 29 conversions (62%)</li>
              <li>Brand_Product driving 8 phone calls — own-brand traffic is intent-rich</li>
              <li>Phone-call tracking is live and producing data</li>
            </ul>
          </Card>
          <Card title="What's NOT showing up here">
            <ul className="list-disc pl-5 space-y-1">
              <li>Generic_Services_Repair-Maintenance: <span className="font-semibold">zero conversions</span> despite $2,020 spent — this is the campaign feeding /service-repair/</li>
              <li>Generic_Services_Hydraulics, Generic_Services_Manufacturing, Generic_Services_Industry-Verticals: also zero each</li>
              <li>Display_remarketing: zero ($521 spent)</li>
            </ul>
          </Card>
        </div>
      </Slide>

      <Slide id="berendsen-cash-validation" light>
        <SlideHeading>We&apos;re seeing conversions, but we need to validate with the business</SlideHeading>
        <SlideSubtext>Phone clicks and form submissions are firing. The next step is confirming, with the sales teams, that those leads are actually arriving and being followed up.</SlideSubtext>
        <div className="grid md:grid-cols-3 gap-4 max-w-5xl mx-auto w-full">
          <Card title="What Google Ads says">
            <p>29 conversions on Berendsen, 22 on MTP across the last 25 days. Phone and form tracking both firing.</p>
          </Card>
          <Card title="What we still need to confirm">
            <p>Each business should reconcile against their own records: are these leads landing in inboxes, CRM, phones? Quality and follow-through?</p>
          </Card>
          <Card title="Why it matters">
            <p>If the leads are arriving and converting, our reporting is trustworthy. If there&apos;s a gap, it points to a CRM or routing issue, not a campaign issue.</p>
          </Card>
        </div>
      </Slide>

      <Slide id="berendsen-cash-table">
        <SlideHeading>April 2026 cash sales by branch (Berendsen)</SlideHeading>
        <SlideSubtext>Branch-level cash sales, March vs April, sent through by the client. Source of truth for revenue, regardless of where the lead came from.</SlideSubtext>
        <DataTable
          headers={["Branch", "State", "Mar 26", "Apr 26", "Δ %", "Status"]}
          rows={[
            ["Sydney", "NSW", "$23,291", "$348", <Pill key="syd" tone="red">−98.5%</Pill>, "Catastrophic"],
            ["Clontarf", "QLD", "$14,726", "$1,819", <Pill key="cl" tone="red">−87.6%</Pill>, "Catastrophic"],
            ["Newcastle", "NSW", "$34,876", "$4,905", <Pill key="nc" tone="red">−85.9%</Pill>, "Catastrophic"],
            ["Bundaberg", "QLD", "$7,616", "$4,697", <Pill key="bd" tone="amber">−38.3%</Pill>, "Soft"],
            ["Brisbane", "QLD", "$49,493", "$55,897", <Pill key="br" tone="green">+12.9%</Pill>, "Up"],
            ["Perth", "WA", "$21,378", "$25,109", <Pill key="pe" tone="green">+17.5%</Pill>, "Up"],
            ["Melbourne", "VIC", "$18,577", "$27,108", <Pill key="me" tone="green">+45.9%</Pill>, "Up"],
            ["Adelaide", "SA", "$31,162", "$53,430", <Pill key="ad" tone="green">+71.5%</Pill>, "Up"],
            ["Wollongong", "NSW", "$6,154", "$36,570", <Pill key="wl" tone="green">+494%</Pill>, "Strong"],
            ["Mackay", "QLD", "$350", "$5,050", <Pill key="mk" tone="green">+1342%</Pill>, "Strong"],
            [<b key="t">Total</b>, "", "$208k", "$215k", <b key="dt">+3.5%</b>, "Net flat"],
          ]}
        />
        <p className="mt-6 text-sm text-slate-600 dark:text-slate-300 text-center max-w-3xl mx-auto">
          Sydney&apos;s $348 matches the client&apos;s email exactly. Three branches collapsed, six grew strongly, total revenue is essentially flat MoM. Branch-specific issue, not system-wide.
        </p>
      </Slide>

      {/* ── SECTION 5: Optimisations ─────────────────────────── */}

      <Slide id="optimisations-overview" light>
        <div className="text-center mb-6">
          <Pill tone="blue">Section 5 · Optimisations · 20 minutes</Pill>
        </div>
        <SlideHeading>What we&apos;ve identified, ready to ship</SlideHeading>
        <SlideSubtext>The findings from this month&apos;s work, queued for the next two weeks. Each gets its own slide.</SlideSubtext>
        <div className="grid md:grid-cols-2 gap-4 max-w-4xl mx-auto w-full">
          <Card title="1. Keyword relevancy via negative keywords">
            <p>The previous account had no negative-keyword list applied. We&apos;re working through historical search data to filter out irrelevant queries so spend lands on commercial intent only.</p>
          </Card>
          <Card title="2. Landing-page improvements">
            <p>Top problem pages on Berendsen and MTP, audited live against actual search-term data. Forms missing where ads promise quotes, geo intent on national pages, broken sections.</p>
          </Card>
          <Card title="3. LP-to-search-intent mismatches">
            <p>Five top-spending Berendsen pages with specific copy and structural fixes. Vocabulary, geo response, broken H1s, missing forms.</p>
          </Card>
          <Card title="4. Hydraulic-seals routing fix">
            <p>~65 seal-shopping clicks per 25 days landing on the cylinder-repair service page because no Hydraulic-Seals ad group exists. Structural fix, not a copy fix.</p>
          </Card>
          <Card title="5. Brand-defence gap, fixed">
            <p>~142 own-brand clicks per month leaking into non-brand ad groups. Existing list had only misspellings, not the correct-spelling phrase negative.</p>
          </Card>
          <Card title="6. Budget headroom we&apos;re not using">
            <p>Generic_Products_Hydraulic-Components is converting at $20 CPA with 79% impression share lost to budget. ~$39/day uplift available within the existing cap.</p>
          </Card>
        </div>
      </Slide>

      <Slide id="keyword-relevancy">
        <SlideHeading>Keyword relevancy: how people actually search</SlideHeading>
        <SlideSubtext>The previous account had no negative-keyword list applied. The cost of that, in one month of historical data.</SlideSubtext>

        <div className="grid md:grid-cols-3 gap-2 mb-3">
          <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-3 border border-slate-200 dark:border-slate-700">
            <div className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-0.5">April 2025 spend</div>
            <div className="text-2xl font-bold text-slate-900 dark:text-white">$4.2k</div>
            <div className="text-[10px] text-slate-500 dark:text-slate-400">Berendsen, single month</div>
          </div>
          <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-3 border border-slate-200 dark:border-slate-700">
            <div className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-0.5">Distinct search terms</div>
            <div className="text-2xl font-bold text-slate-900 dark:text-white">310</div>
            <div className="text-[10px] text-slate-500 dark:text-slate-400">How people phrase it varies wildly</div>
          </div>
          <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-3 border border-slate-200 dark:border-slate-700">
            <div className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-0.5">Irrelevant searches</div>
            <div className="text-2xl font-bold text-slate-900 dark:text-white">43+</div>
            <div className="text-[10px] text-slate-500 dark:text-slate-400">Spend that should never have served</div>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-3">
          <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-3 border border-slate-200 dark:border-slate-700">
            <div className="text-[10px] uppercase tracking-wide text-blue-600 dark:text-blue-300 font-semibold mb-1.5">Top search terms (April 2025)</div>
            <ul className="text-[11px] text-slate-700 dark:text-slate-200 list-disc pl-4 columns-2 gap-3 leading-tight">
              <li>hydraulic cylinder repair</li>
              <li>hydraulic cylinder repairs</li>
              <li>hydraulic cylinder repair near me</li>
              <li>hydraulic cylinder repair brisbane</li>
              <li>hydraulic cylinder repair melbourne</li>
              <li>hydraulic cylinder repairs perth</li>
              <li>hydraulic cylinder repairs adelaide</li>
              <li>hydraulic cylinder seal replacement</li>
              <li>hydraulic cylinder</li>
              <li>hydraulic ram repairs</li>
              <li>hydraulic ram repairs perth</li>
              <li>hydraulic ram repairs near me</li>
              <li>hydraulic repairs perth</li>
              <li>hydraulic repairs adelaide</li>
              <li>hydraulic repairs brisbane</li>
              <li>hydraulic repairs near me</li>
              <li>hydraulic hose repair</li>
              <li>hydraulic pump</li>
              <li>hydraulic power pack</li>
              <li>who fixes hydraulic cylinders near me</li>
              <li>bosch rexroth</li>
              <li>rexroth brisbane</li>
              <li>rexroth melbourne</li>
              <li>parker hydraulics adelaide</li>
              <li>parker hydraulics perth</li>
              <li>parker hydraulics australia</li>
              <li>parker hannifin products</li>
              <li>vickers hydraulics</li>
              <li>horsham hydraulics</li>
              <li>warrnambool hydraulics</li>
              <li>mechanical contractors sydney</li>
              <li>pipe fittings</li>
              <li>pipe welding</li>
              <li>phoenix metalform</li>
              <li>pps townsville</li>
            </ul>
            <p className="mt-2 text-[10px] italic text-slate-500 dark:text-slate-400">35 of 310 search terms shown. Notice the long tail: every searcher phrases the same intent differently.</p>
          </div>

          <div className="bg-red-50 dark:bg-red-900/20 rounded-xl p-3 border border-red-200 dark:border-red-800">
            <div className="text-[10px] uppercase tracking-wide text-red-700 dark:text-red-300 font-semibold mb-1.5">43 negative keywords added this month</div>
            <ul className="text-[11px] text-slate-700 dark:text-slate-200 list-disc pl-4 columns-2 gap-3 leading-tight">
              <li>pipe fittings</li>
              <li>hose repairs</li>
              <li>equipment maintenance services</li>
              <li>pps</li>
              <li>metalform</li>
              <li>mechanical contractors</li>
              <li>flowfit</li>
              <li>pipeline welding</li>
              <li>kelly and lewis</li>
              <li>steel fabricator</li>
              <li>fuel hose</li>
              <li>mascot engineering</li>
              <li>racine pvq</li>
              <li>fabrication and welding</li>
              <li>truck</li>
              <li>welding companies</li>
              <li>lmats</li>
              <li>engineering firms</li>
              <li>manufacturing machines</li>
              <li>heater</li>
              <li>welding</li>
              <li>brass fittings</li>
              <li>crane parts</li>
              <li>automotive</li>
              <li>hose fittings</li>
              <li>air fittings</li>
              <li>steel construction</li>
              <li>counterbalance valve</li>
              <li>warren control valves</li>
              <li>engine machine</li>
              <li>industrial equipment manufacturers</li>
              <li>metal cutting</li>
              <li>centerless grinding</li>
              <li>hose specialist</li>
              <li>flucom</li>
              <li>stainless steel fittings</li>
              <li>steel structure company</li>
              <li>plumbing fittings</li>
              <li>john deere</li>
              <li>custom aluminium</li>
              <li>welding supplies</li>
              <li>welding fabrication</li>
              <li>machinery sales</li>
            </ul>
            <p className="mt-2 text-[10px] italic text-red-700 dark:text-red-300">All blocked across the account. Spend that would have served on these queries now redirects to commercial intent.</p>
          </div>
        </div>

        <div className="mt-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl p-3 border border-blue-200 dark:border-blue-800">
          <p className="text-xs text-slate-700 dark:text-slate-200 leading-snug">
            <span className="font-semibold">Why this matters:</span> with phrase and broad match, Google&apos;s auction matches your bid against thousands of close-variant queries. Without negatives, ~14% of April 2025 spend served on irrelevant intent (steel construction, plumbing fittings, John Deere, automotive). <span className="font-semibold">Keyword relevancy is the metric we&apos;re tracking</span>, the share of search-term spend matched to commercial intent. Working through historical search data weekly.
          </p>
        </div>
      </Slide>

      <Slide id="berendsen-lp-callout" dark>
        <h2 className="text-3xl md:text-4xl font-bold text-white text-center mb-10">
          Landing page improvements:<br />the lever paid search can&apos;t pull on its own
        </h2>
        <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
          <div className="bg-slate-800 rounded-2xl p-6 border border-slate-700">
            <h3 className="text-lg font-bold text-white mb-3">Berendsen, top 4 problem pages</h3>
            <ul className="text-sm text-slate-300 space-y-2 list-disc pl-5">
              <li><span className="font-semibold">/service-repair/</span>: $1,889 / 0 conv. No form, no branch locator, no &quot;ram repair&quot; section despite 51 clicks for it.</li>
              <li><span className="font-semibold">/hydraulic-system-design/</span>: $147 / 0 conv. Ad promises a quote form, page has none.</li>
              <li><span className="font-semibold">/hydraulic-cylinder-repairs/</span>: $307 / 0 conv. H1 says &quot;Experts in Melbourne&quot; on a national URL.</li>
              <li><span className="font-semibold">/brand/bosch-rexroth/</span>: $136 / 0 conv. Empty product loader, &quot;not available online&quot; message contradicting the ad.</li>
            </ul>
          </div>
          <div className="bg-slate-800 rounded-2xl p-6 border border-slate-700">
            <h3 className="text-lg font-bold text-white mb-3">MTP, top problem pages</h3>
            <ul className="text-sm text-slate-300 space-y-2 list-disc pl-5">
              <li><span className="font-semibold">/pump-repair-service/</span>: $1,979 / 3 conv at $660 CPA. 14-field form, no branch locator, generic vocabulary.</li>
              <li><span className="font-semibold">/industry/agriculture-irrigation/</span>: $326 / 0 conv. ~14 clicks for solar-pump queries; page doesn&apos;t mention solar.</li>
              <li><span className="font-semibold">/24-7-emergency-pump-repairs/</span>: $305 / 0 conv. Form too heavy for emergency intent.</li>
              <li><span className="font-semibold">/southern-cross-pumps/</span>: $187 / 0 conv. Only 3 featured products vs full Southern Cross catalogue.</li>
            </ul>
          </div>
        </div>
        <p className="mt-8 text-center text-sm text-slate-300 max-w-3xl mx-auto">
          The next four slides go through what we found on Berendsen&apos;s pages specifically and what to fix.
        </p>
      </Slide>

      <Slide id="berendsen-lp-mismatch" light>
        <SlideHeading>The LP-to-search-intent mismatches</SlideHeading>
        <DataTable
          headers={["Landing page", "Spend", "Conv", "What users searched for", "Recommended fix"]}
          rows={[
            [<a key="lp1" href="https://berendsen.com.au/service-repair/" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">/service-repair/</a>, "$1,889", "0", "hydraulic ram repairs, hydraulic seals, near me", "Add ram-repairs section, branch-locator widget, contact form"],
            [<a key="lp2" href="https://berendsen.com.au/" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">/ (homepage)</a>, "$780", "0", "hydraulic shop near me, hydraulic supplies near me", "Add a postcode-based branch-locator widget in the hero"],
            [<a key="lp3" href="https://berendsen.com.au/hydraulic-system-design/" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">/hydraulic-system-design/</a>, "$147", "0", "hydraulic engineer, consultants, drafting (Perth, Melbourne, Newcastle)", "Add quote form (ad copy promises one); use vocabulary searchers actually use"],
            [<a key="lp4" href="https://berendsen.com.au/hydraulic-cylinder-repairs/" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">/hydraulic-cylinder-repairs/</a>, "$307", "0", "ram repairs near me, Toowoomba, Bundaberg", "Fix misleading H1 (&quot;Experts in Melbourne&quot; on a national URL)"],
            [<a key="lp5" href="https://berendsen.com.au/brand/bosch-rexroth/" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">/brand/bosch-rexroth/</a>, "$136", "0", "rexroth Brisbane, Adelaide, Sydney, parts", "Fix broken page (empty product loader, &quot;not available&quot; message)"],
          ]}
        />
      </Slide>

      <Slide id="berendsen-seals">
        <SlideHeading>Structural campaign issues</SlideHeading>
        <SlideSubtext>Two routing problems where the ad group / campaign structure isn&apos;t matching how people actually search.</SlideSubtext>
        <div className="grid md:grid-cols-2 gap-6">
          <Card title="1. Hydraulic seals routing">
            <p className="mb-2"><span className="font-semibold">Problem:</span> ~65 clicks for &ldquo;hydraulic seals&rdquo; queries land on <a href="https://berendsen.com.au/service-repair/" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">/service-repair/</a> in 25 days. ~$485 spent, 0 conversions. Users want product, we serve a service page.</p>
            <p className="mb-2"><span className="font-semibold">Why it happens:</span> the account has no Hydraulic-Seals ad group. The auction routes seal queries to the nearest semantic match (Hydraulic-Cylinder-Repair), so wrong intent gets the click.</p>
            <p><span className="font-semibold">Fix:</span> create a Hydraulic-Seals ad group, point at a seals product page. Add seal terms as phrase negatives on Cylinder-Repair.</p>
          </Card>
          <Card title="2. 'Near me' geo routing">
            <p className="mb-2"><span className="font-semibold">Problem:</span> campaigns currently target the whole of Australia. Someone searching &ldquo;hydraulic shop near me&rdquo; from Perth can be served an ad whose landing page promotes Sydney.</p>
            <p className="mb-2"><span className="font-semibold">Why it happens:</span> single national campaigns send everyone to the same page. There&apos;s no signal in the structure that maps the user&apos;s location to the closest branch.</p>
            <p><span className="font-semibold">Fix:</span> structural change — split into location-based campaigns (state or branch-radius), so &ldquo;near me&rdquo; searches route to a location-aware page or a branch-locator. Same pattern as seals: missing structure → wrong page → no conversion.</p>
          </Card>
        </div>
      </Slide>

      <Slide id="berendsen-brand-defence" light>
        <SlideHeading>Brand defence gap, fixed</SlideHeading>
        <SlideSubtext>~142 own-brand clicks per month were leaking into non-brand ad groups.</SlideSubtext>
        <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto w-full">
          <Card title="The bug">
            <p>The brand negative list had 10 misspellings (berensen, brendsen, etc.) but the correct spelling, &ldquo;berendsen&rdquo;, was missing.</p>
          </Card>
          <Card title="The fix">
            <p>Added &ldquo;berendsen&rdquo; as a PHRASE-match negative. Closes all variants in one entry.</p>
          </Card>
        </div>
      </Slide>

      <Slide id="berendsen-budget">
        <SlideHeading>Reallocate budget toward what&apos;s converting</SlideHeading>
        <SlideSubtext>We need more data to call this with confidence, but the early signal is clear: shift spend from non-performing campaigns (e.g., Emergency Repair) into the campaigns already producing leads, while we fix the landing pages on the laggards.</SlideSubtext>
        <DataTable
          headers={["Campaign", "Daily $", "Conv (25d)", "CPA", "Bud lost IS", "Recommendation"]}
          rows={[
            ["Generic_Products_Hydraulic-Components", "$27", "18", "$20", "79.2%", "Bump to $48/day; projects +14 conversions per 25 days at the same CPA"],
            ["Brand_Product", "$22", "8", "$52", "86.9%", "Bump to $40/day"],
            ["Generic_Services_Location", "$59", "3", "$300", "54.2% bud + 22.7% rank lost", "Hold. Mixed signal — fix bids and ad copy first"],
            ["Emergency Repair / non-converting LPs", "—", "0", "—", "—", "Reduce spend until LP fixes ship; redeploy into performing campaigns"],
          ]}
        />
        <p className="mt-6 text-sm text-slate-600 dark:text-slate-300 text-center max-w-3xl mx-auto">
          <span className="font-semibold">Logic:</span> reallocate from campaigns with 0 conversions and broken landing pages into campaigns already converting at strong CPAs. Then revisit once we have more conversion data and the LP fixes are live.
        </p>
      </Slide>

      {/* ── SECTION 5: How we track progress ──────────────────────── */}

      <Slide id="tracking-dashboard" dark>
        <div className="text-center mb-6">
          <Pill tone="blue">Section 6 · How we track progress · 10 minutes</Pill>
        </div>
        <SlideHeading dark>The Google Ads dashboard view</SlideHeading>
        <SlideSubtext dark>What you actually open every morning, and what to look at on it.</SlideSubtext>
        <div className="bg-slate-800 rounded-2xl p-6 border border-slate-700">
          <ol className="text-slate-300 text-sm space-y-3 list-decimal pl-5">
            <li><span className="font-semibold text-white">Overview tab</span>, last 30 days. Conversions and CPA at the top — these are the goal metrics. If they&apos;re moving in the right direction, everything else is detail.</li>
            <li><span className="font-semibold text-white">Campaigns tab</span>, sort by conversions descending. Add columns for IS lost to budget + IS lost to rank. Anything &gt;10% budget-lost or &gt;20% rank-lost is a flag.</li>
            <li><span className="font-semibold text-white">Search terms tab</span> (under Insights or Keywords). Filter to terms with no conversions and high cost — those are the candidates for negative keywords.</li>
            <li><span className="font-semibold text-white">Keywords tab</span>, sort by conversions. Shows which actual keywords (not search terms) are driving leads.</li>
            <li><span className="font-semibold text-white">Audiences and Demographics</span> only after 90+ days of conversion data. Premature segmentation is noise.</li>
          </ol>
        </div>
      </Slide>

      <Slide id="month1-tracking-caveat" dark>
        <SlideHeading dark>The tracking gap, and what we still need from the business</SlideHeading>
        <SlideSubtext dark>
          Neither account had working conversion tracking before this round, so there&apos;s no clean historical baseline. To trust what we&apos;re seeing, we need two things from each business.
        </SlideSubtext>
        <div className="grid md:grid-cols-2 gap-6">
          <div className="bg-slate-800 rounded-2xl p-6 border border-slate-700">
            <h3 className="text-lg font-bold text-white mb-3">1. Validate forms with the business</h3>
            <p className="text-slate-300 text-sm">We need active communication with the sales teams to confirm the form submissions and phone calls Google Ads is logging are actually arriving, being responded to, and converting. Without that loop closed, &ldquo;conversions&rdquo; is just a number on a dashboard.</p>
          </div>
          <div className="bg-slate-800 rounded-2xl p-6 border border-slate-700">
            <h3 className="text-lg font-bold text-white mb-3">2. Full website traffic + lead source review</h3>
            <p className="text-slate-300 text-sm">A full review of all website traffic and where leads are actually coming from: organic, direct, paid, referral. Paid Google Ads is one channel; the business needs the complete picture so we can attribute correctly and prioritise across channels.</p>
          </div>
        </div>
      </Slide>

      <Slide id="mtp-next" light>
        <SlideHeading>What&apos;s next for MTP</SlideHeading>
        <SlideSubtext>Three workstreams running in parallel.</SlideSubtext>
        <div className="grid md:grid-cols-3 gap-4">
          <Card title="Paid: build conversion volume">
            <ul className="list-disc pl-5 space-y-1">
              <li>Let the new phrase-match additions accumulate impression history</li>
              <li>Need 20+ monthly conversions before D1 budget signals are trustworthy</li>
              <li>Review at 60 days for next re-allocation</li>
            </ul>
          </Card>
          <Card title="SEO: post-migration audit">
            <ul className="list-disc pl-5 space-y-1">
              <li>Diagnose the Aug 2025 event: redirects, sitemap, internal linking, indexing</li>
              <li>Largest long-term recovery lever, by far</li>
              <li>Confirm with client what changed in August</li>
            </ul>
          </Card>
          <Card title="Tracking: validate what we&apos;re collecting">
            <ul className="list-disc pl-5 space-y-1">
              <li>Reconcile Google Ads conversions with what the sales team actually receives</li>
              <li>If there&apos;s a gap, it&apos;s a CRM/routing issue, not a generation issue</li>
              <li>Confirms whether our reporting is trustworthy</li>
            </ul>
          </Card>
        </div>
      </Slide>

      <Slide id="month1-90day-target" light>
        <SlideHeading>What good looks like in the next 90 days</SlideHeading>
        <SlideSubtext>Tangible, measurable goals to anchor monthly reviews against.</SlideSubtext>
        <DataTable
          headers={["Metric", "Today", "Target by 31 Aug", "Why"]}
          rows={[
            ["Berendsen monthly conversions", "~26", "60+", "With LP fixes + budget uplift, 2.3× the current rate is achievable at the same CPA"],
            ["Berendsen blended CPA", "$204", "Below $150", "Better LP CvR + filtering out non-converting paths"],
            ["MTP monthly paid sessions", "~470", "1,000+", "Recovery of pre-Aug paid baseline, plus phrase-match additions compounding"],
            ["MTP conversions", "Building", "20+", "Volume threshold to start trusting D1 budget signals"],
            ["Both: search-term coverage", "Partial", "95%+ of top 20 search terms have a matched keyword", "No more zombie traffic going to wrong landing pages"],
          ]}
        />
      </Slide>

      <Slide id="qa" light>
        <SlideHeading>Q&A</SlideHeading>
        <SlideSubtext>Open questions, edge cases, anything not covered.</SlideSubtext>
        <div className="text-center mt-12">
          <p className="text-sm text-slate-600 dark:text-slate-300 max-w-2xl mx-auto">
            If we cover everything in 10 minutes, we&apos;re done early. If we don&apos;t cover everything, take it offline and we&apos;ll follow up in tomorrow&apos;s standup.
          </p>
          <p className="mt-12 text-xs text-slate-400">
            Slides + supporting docs: <span className="font-mono">drafts/optimate-agent-build-plan.md</span> (build plan + patterns library), the Berendsen and MTP optimisation emails on Desktop.
          </p>
        </div>
      </Slide>
    </div>
  );
}
