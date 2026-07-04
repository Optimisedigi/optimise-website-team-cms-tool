"use client";

/**
 * Delivery Radius Review rendered in the same visual system as the Google Ads
 * audit deck: dark starfield cover/close, orbit rings, centred white content
 * slides, column-reverse scroll flow, rocket scroll affordance, and compact
 * audit-style cards/tables.
 */
import type { ReactNode } from "react";

import DeckScrollEffects from "../google-ads-audit-15-slide/DeckScrollEffects";
import Starfield from "../google-ads-audit-15-slide/Starfield";
import type {
  DeliveryRadiusReviewPayload,
  DeliverySplitRow,
  MonthlyBar,
  SourceSummaryRow,
} from "./payload";

const SLIDES = ["cover", "monthly", "radius", "channels", "sources"] as const;
type SlideId = (typeof SLIDES)[number];

const NIGHT = "#07091a";
const BLUE = "#4d94ff";
const BLUE_SOFT = "#99c0ff";
const SLATE = "#0f172a";
const MUTED = "#64748b";
const ROSE = "#e11d48";
const DELIVERY_BLUE = "#2563eb";
const PICKUP_GREEN = "#16a34a";
const BORDER = "#e2e8f0";
const SURFACE = "#f8fafc";
const CALLOUT_SURFACE = "#f1f5f9";
const MONO = "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";

function DeckStyles() {
  return (
    <style
      dangerouslySetInnerHTML={{
        __html: `
          html { scroll-behavior: smooth; scroll-snap-type: y proximity; }
          body { background: white; color: rgb(15, 23, 42); font-size: 16px; line-height: 1.5; }
          .delivery-radius-deck h1,
          .delivery-radius-deck h2,
          .delivery-radius-deck h3,
          .delivery-radius-deck p { margin-block: 0; }
          .delivery-radius-deck {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, system-ui, sans-serif;
            display: flex;
            flex-direction: column-reverse;
            background: white;
            min-height: 100vh;
          }
          .delivery-radius-deck section { scroll-snap-align: start; }
          .delivery-radius-deck .deck-slide {
            min-height: 100vh;
            width: 100%;
            max-width: none;
            margin: 0;
            padding: 80px max(24px, calc((100vw - 1024px) / 2 + 24px)) 48px;
            box-sizing: border-box;
            position: relative;
            display: flex;
            flex-direction: column;
            justify-content: center;
            color: ${SLATE};
          }
          .delivery-radius-deck .deck-slide.dark {
            max-width: none;
            min-height: 100vh;
            background: ${NIGHT};
            color: #fff;
            overflow: hidden;
            align-items: center;
            text-align: center;
          }
          .delivery-radius-deck .dark-inner {
            width: min(900px, calc(100vw - 48px));
            margin: 0 auto;
            position: relative;
            z-index: 2;
          }
          .delivery-radius-deck .starfield { position: absolute; inset: 0; pointer-events: none; z-index: 0; }
          .delivery-radius-deck .star { position: absolute; background: rgba(255,255,255,0.85); border-radius: 50%; }
          .delivery-radius-deck .orbit-deco {
            position: absolute;
            border: 1px dashed rgba(77,148,255,0.18);
            border-radius: 50%;
            pointer-events: none;
            animation: delivery-orbit-ping 3s ease-out infinite;
            transform-origin: center center;
            z-index: 0;
          }
          .delivery-radius-deck .orbit-deco:nth-of-type(2) { animation-delay: 1s; }
          .delivery-radius-deck .orbit-deco:first-of-type::after {
            content: '';
            position: absolute;
            inset: -2px;
            border: 1px dashed rgba(77,148,255,0.18);
            border-radius: 50%;
            animation: delivery-orbit-ping 3s ease-out 2s infinite;
          }
          @keyframes delivery-orbit-ping {
            0% { opacity: 0.7; transform: scale(0.9); }
            80%, 100% { opacity: 0; transform: scale(1.05); }
          }
          .delivery-radius-deck .cover-pill {
            display: inline-block;
            white-space: nowrap;
            padding: 8px 18px;
            border: 1px solid rgba(77,148,255,0.5);
            border-radius: 999px;
            font-size: 13px;
            color: ${BLUE_SOFT};
            letter-spacing: 0.15em;
            text-transform: uppercase;
            font-weight: 600;
          }
          .delivery-radius-deck .cover-h1,
          .delivery-radius-deck .closing-h1 {
            font-weight: 650;
            line-height: 0.92;
            letter-spacing: -0.045em;
            color: #fff;
          }
          .delivery-radius-deck .slide-num {
            position: absolute;
            right: 20px;
            bottom: 16px;
            font-family: ${MONO};
            font-size: 12px;
            color: rgb(148, 163, 184);
            user-select: none;
          }
          .delivery-radius-deck .dark .slide-num { color: rgb(71, 85, 105); }
          .delivery-radius-deck .rocket-fixed {
            position: fixed;
            right: 3px;
            bottom: min(calc(5.5% - 26px + var(--scroll-progress, 0) * 70%), calc(65% - 25px));
            z-index: 2147483647;
            display: flex;
            flex-direction: column;
            align-items: center;
            transition: bottom 0.05s linear, transform 0.05s linear, opacity 0.05s linear;
            cursor: pointer;
            transform: scale(clamp(0.2, calc(var(--scroll-from-end, 9999) / max(1, var(--last-slide-height, 900))), 1));
            transform-origin: center bottom;
            opacity: clamp(0.05, calc(var(--scroll-from-end, 9999) / max(1, var(--last-slide-height, 900))), 1);
          }
          .delivery-radius-deck .rocket-img { width: 48px; height: auto; filter: drop-shadow(0 4px 16px rgba(0,0,0,0.3)); }
          .delivery-radius-deck .rocket-flame {
            width: 18px;
            height: 44px;
            margin-top: -5px;
            background: radial-gradient(ellipse at top, #fff 0%, #fde68a 22%, #fb923c 48%, rgba(239,68,68,0.85) 72%, transparent 100%);
            border-radius: 999px;
            filter: blur(0.5px);
            transform-origin: top center;
            animation: delivery-flame 0.18s infinite alternate;
          }
          @keyframes delivery-flame { from { transform: scaleY(0.78); opacity: 0.82; } to { transform: scaleY(1.08); opacity: 1; } }
          .delivery-radius-deck .flame-trail {
            position: fixed;
            right: 25px;
            bottom: 0;
            width: 4px;
            height: min(calc(5.5% - 26px + var(--scroll-progress, 0) * 70% + 18px), calc(65% - 25px + 18px));
            background: linear-gradient(to top, transparent, rgba(255, 165, 0, 0.15) 20%, rgba(255, 165, 0, 0.4) 60%, rgba(255, 100, 0, 0.6));
            z-index: 2147483646;
            pointer-events: none;
            transition: height 0.05s linear, opacity 0.05s linear;
            border-radius: 2px;
            opacity: clamp(0, calc(var(--scroll-from-end, 9999) / max(1, var(--last-slide-height, 900))), 1);
          }
          .delivery-radius-deck .flame-trail-hit {
            position: fixed;
            right: 7px;
            bottom: 0;
            width: 40px;
            height: min(calc(5.5% - 26px + var(--scroll-progress, 0) * 70% + 18px), calc(65% - 25px + 18px));
            background: transparent;
            z-index: 2147483645;
            cursor: pointer;
            opacity: clamp(0, calc(var(--scroll-from-end, 9999) / max(1, var(--last-slide-height, 900))), 1);
            pointer-events: auto;
            border: none;
          }
          .delivery-radius-deck .rocket-hint { position: fixed; right: 62px; bottom: 48px; z-index: 2147483647; display: flex; gap: 8px; align-items: center; color: rgba(255,255,255,0.74); font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; }
          .delivery-radius-deck .rocket-hint[hidden] { display: none; }
          @media (max-width: 820px) {
            .delivery-radius-deck .deck-slide { min-height: 100vh; padding: 64px 20px 44px; }
            .delivery-radius-deck .deck-slide.dark { min-height: 100vh; }
            .delivery-radius-deck .responsive-grid { grid-template-columns: 1fr !important; }
          }
        `,
      }}
    />
  );
}

function SlideWrapper({ id, children, dark = false, light = false }: { id: SlideId; children: ReactNode; dark?: boolean; light?: boolean }) {
  const num = SLIDES.indexOf(id) + 1;
  return (
    <section
      id={id}
      className={`deck-slide${dark ? " dark" : ""}`}
      style={{ background: dark ? NIGHT : light ? SURFACE : "#fff" }}
    >
      {children}
      <div className="slide-num" aria-hidden="true">{num} / {SLIDES.length}</div>
    </section>
  );
}

function CoverSlide({ p }: { p: DeliveryRadiusReviewPayload }) {
  return (
    <SlideWrapper id="cover" dark>
      <Starfield id="delivery-cover-starfield" />
      <div className="orbit-deco" style={{ width: 280, height: 280, top: "10%", left: "5%" }} />
      <div className="orbit-deco" style={{ width: 440, height: 440, top: "2%", left: "-2%" }} />
      <img
        src="/optimise-digital-logo-white.png"
        alt="Optimise Digital"
        style={{ position: "absolute", top: 42, left: "50%", transform: "translateX(-50%)", width: 190, height: "auto", zIndex: 2, opacity: 0.92 }}
      />
      <div className="dark-inner">
        <h1 className="cover-h1" style={{ fontSize: "clamp(2.5rem, 6vw, 4.5rem)", marginBottom: 24 }}>{p.clientName}</h1>
        <p style={{ color: "rgba(255,255,255,0.62)", fontSize: 20, margin: "0 auto", maxWidth: 720 }}>
          Roselands analysis
        </p>
        <div style={{ marginTop: 48, color: "rgba(255,255,255,0.55)", fontFamily: MONO, fontSize: 13 }}>
          {p.reviewPeriod}
        </div>
      </div>
      <RocketUi />
    </SlideWrapper>
  );
}

function RocketUi() {
  return (
    <>
      <div id="rocket-fixed" className="rocket-fixed" role="button" tabIndex={0} aria-label="Go to next section">
        <img src="/optimise-digital-rocket.png" alt="" className="rocket-img" />
        <div className="rocket-flame" />
      </div>
      <div className="flame-trail" />
      <div className="flame-trail-hit" id="flame-trail-hit" />
      <div className="rocket-hint" id="rocket-hint">
        <span>Click to take off</span>
        <span>←</span>
      </div>
    </>
  );
}

function RadiusSlide({ p }: { p: DeliveryRadiusReviewPayload }) {
  return (
    <SlideWrapper id="radius" light>
      <SlideHeader title={`${p.radiusKm} km catchment performance`} subtitle={`${p.suburbCount} nearby suburbs · delivery sales and orders by postcode`} />
      <div className="responsive-grid" style={{ display: "grid", gridTemplateColumns: "0.95fr 1.05fr", gap: 28, alignItems: "center" }}>
        <div>
          <AuditTable headers={["Suburb", "km", "PC", "Delivery", "Orders"]} widths={["31%", "10%", "13%", "25%", "21%"]} rows={p.suburbs.map((s) => [s.name, s.km, s.postcode, s.deliverySales, s.deliveryOrders])} />
          <p style={{ marginTop: 18, color: SLATE, fontSize: 15, fontWeight: 700 }}>
            {p.totalDeliverySales} from {p.totalDeliveryOrders} delivery orders · average order {p.totalAvgOrder}
          </p>
          {p.suburbFootnote ? <p style={{ marginTop: 8, color: MUTED, fontSize: 12 }}>{p.suburbFootnote}</p> : null}
        </div>
        <Panel pad={18}><MapSvg payload={p} /></Panel>
      </div>
    </SlideWrapper>
  );
}

function SlideHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <>
      <h2 style={{ margin: "0 0 8px", textAlign: "center", fontSize: 32, lineHeight: 1.1, fontWeight: 800, letterSpacing: "-0.03em", color: SLATE }}>{title}</h2>
      <p style={{ margin: "0 auto 34px", textAlign: "center", color: MUTED, fontSize: 15, maxWidth: 780 }}>{subtitle}</p>
    </>
  );
}

function Panel({ children, pad = 20 }: { children: ReactNode; pad?: number }) {
  return <div style={{ background: "white", border: `1px solid ${BORDER}`, borderRadius: 14, padding: pad, boxShadow: "0 12px 30px rgba(15,23,42,0.06)" }}>{children}</div>;
}

function AuditTable({ headers, rows, widths, small = false }: { headers: string[]; rows: string[][]; widths: string[]; small?: boolean }) {
  return (
    <div style={{ overflow: "hidden", border: `1px solid ${BORDER}`, borderRadius: 10, background: "white" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed", fontSize: small ? 11 : 12, color: SLATE }}>
        <thead>
          <tr style={{ background: "#f1f5f9", borderBottom: `1px solid ${BORDER}` }}>
            {headers.map((h, i) => <th key={h} style={{ width: widths[i], padding: small ? "8px 10px" : "10px 12px", color: MUTED, textAlign: "left", fontSize: small ? 10 : 11, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 800 }}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} style={{ background: i % 2 ? "#fff" : "#f8fafc", borderBottom: `1px solid ${BORDER}` }}>
              {row.map((cell, j) => <td key={`${i}-${j}`} style={{ padding: small ? "7px 10px" : "9px 12px", color: j === 0 ? SLATE : MUTED, fontWeight: j === 0 ? 700 : 500 }}>{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MapSvg({ payload }: { payload: DeliveryRadiusReviewPayload }) {
  const W = 640;
  const H = 430;

  if (payload.mapImageUrl) {
    return (
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="auto" role="img" aria-label={`${payload.radiusKm} km radius map`}>
        <image href={payload.mapImageUrl} x="0" y="0" width={W} height={H} preserveAspectRatio="xMidYMid slice" />
      </svg>
    );
  }

  const cx = W / 2;
  const cy = H / 2;
  const radius = 170;
  const scale = radius / payload.radiusKm;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="auto" role="img" aria-label={`${payload.radiusKm} km radius map`}>
      <rect width={W} height={H} rx={12} fill="#f8fafc" />
      <circle cx={cx} cy={cy} r={radius} fill="rgba(77,148,255,0.12)" stroke={BLUE} strokeWidth={4} />
      <text x={28} y={34} fill={MUTED} fontSize={12} fontFamily={MONO}>{payload.radiusKm} km radius approximation</text>
      {payload.suburbs.filter((s) => s.lat !== undefined && s.lon !== undefined).map((s) => {
        const dx = ((s.lon! - payload.storeLon) * Math.cos(payload.storeLat * Math.PI / 180) * 111.32) * scale;
        const dy = -((s.lat! - payload.storeLat) * 111.32) * scale;
        return (
          <g key={s.name}>
            <circle cx={cx + dx} cy={cy + dy} r={7} fill={SLATE} stroke="white" strokeWidth={3} />
            <text x={cx + dx + 11} y={cy + dy + 4} fill={SLATE} fontSize={10} fontWeight={700}>{s.name}</text>
          </g>
        );
      })}
      <circle cx={cx} cy={cy} r={14} fill="#facc15" stroke={ROSE} strokeWidth={3} />
      <text x={cx} y={cy + 5} textAnchor="middle" fill={ROSE} fontSize={13} fontWeight={900}>★</text>
      <text x={cx + 18} y={cy + 5} fill={ROSE} fontSize={12} fontWeight={800}>Roselands</text>
    </svg>
  );
}

function MonthlySlide({ p }: { p: DeliveryRadiusReviewPayload }) {
  return (
    <SlideWrapper id="monthly">
      <SlideHeader title="Monthly Sales: Delivery vs Roselands Pick-up" subtitle={`${p.radiusKm} km radius · sales amount inside each bar · ${p.reviewPeriod}`} />
      <Panel pad={18}><MonthlyChart bars={p.monthlyBars} /></Panel>
      <div style={{ display: "flex", gap: 28, marginTop: 16, justifyContent: "center", color: MUTED, fontSize: 13 }}>
        <Legend color={DELIVERY_BLUE} label="Delivery" />
        <Legend color={PICKUP_GREEN} label="Roselands Pick-up" />
      </div>
      <p style={{ margin: "24px auto 0", maxWidth: 780, textAlign: "center", color: MUTED, fontSize: 14 }}><strong style={{ color: SLATE }}>Six-month totals:</strong> {p.monthlySummary}</p>
    </SlideWrapper>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><span style={{ width: 18, height: 10, borderRadius: 2, background: color }} />{label}</span>;
}

function shortMoney(v: number) {
  return v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${v.toLocaleString()}`;
}

function MonthlyChart({ bars }: { bars: MonthlyBar[] }) {
  const maxVal = Math.max(...bars.map((b) => b.deliveryValue + b.pickupValue), 1);
  const W = 940;
  const H = 390;
  const pad = { top: 42, right: 24, bottom: 56, left: 24 };
  const innerW = W - pad.left - pad.right;
  const innerH = H - pad.top - pad.bottom;
  const gap = 18;
  const barW = (innerW - gap * (bars.length - 1)) / bars.length;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="auto" role="img" aria-label="Monthly delivery vs pickup chart">
      <rect x={pad.left} y={pad.top} width={innerW} height={innerH} fill="#fff" />
      {bars.map((b, i) => {
        const x = pad.left + i * (barW + gap);
        const usable = innerH - 16;
        const pickupH = (b.pickupValue / maxVal) * usable;
        const deliveryH = (b.deliveryValue / maxVal) * usable;
        const base = pad.top + innerH;
        const pickupY = base - pickupH;
        const deliveryY = pickupY - deliveryH;
        const total = b.pickupValue + b.deliveryValue;
        return (
          <g key={b.label}>
            <text x={x + barW / 2} y={24} textAnchor="middle" fill={MUTED} fontSize={10}>{shortMoney(total)} total</text>
            <rect x={x} y={pickupY} width={barW} height={pickupH} fill={PICKUP_GREEN} rx={2} />
            <rect x={x} y={deliveryY} width={barW} height={deliveryH} fill={DELIVERY_BLUE} rx={2} />
            <text x={x + barW / 2} y={pickupY + pickupH / 2 + 4} textAnchor="middle" fill="white" fontSize={12} fontWeight={800}>{shortMoney(b.pickupValue)}</text>
            <text x={x + barW / 2} y={deliveryH > 26 ? deliveryY + deliveryH / 2 + 4 : deliveryY - 7} textAnchor="middle" fill={deliveryH > 26 ? "white" : DELIVERY_BLUE} fontSize={12} fontWeight={800}>{shortMoney(b.deliveryValue)}</text>
            <text x={x + barW / 2} y={H - 16} textAnchor="middle" fill={SLATE} fontSize={13} fontWeight={800}>{b.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

function ChannelSlide({ p }: { p: DeliveryRadiusReviewPayload }) {
  return (
    <SlideWrapper id="channels" light>
      <SlideHeader title={`Delivery vs Roselands Pick-up · ${p.radiusKm} km`} subtitle="Channel totals · free vs paid delivery split" />
      <MetricGrid titles={p.channelTitles} values={p.channelValues} sub1={p.channelSub1} sub2={p.channelSub2} />
      <SectionEyebrow>Delivery split: free vs paid</SectionEyebrow>
      <AuditTable headers={["Delivery type", "Sales", "Orders", "Avg order", "Share"]} widths={["34%", "18%", "16%", "18%", "14%"]} rows={p.deliverySplit.map(toDeliverySplitRow)} />
      <Callout>{p.commentary.map((item) => <li key={item}>{item}</li>)}</Callout>
    </SlideWrapper>
  );
}

function SourcesSlide({ p }: { p: DeliveryRadiusReviewPayload }) {
  return (
    <SlideWrapper id="sources">
      <SlideHeader title="Where demand is clicking through" subtitle={`Clicks, calls and directions snapshot · ${p.reviewPeriod}`} />
      <MetricGrid titles={p.sourceCardTitles} values={p.sourceCardValues} sub1={p.sourceCardSub1} sub2={p.sourceCardSub2} />
      <SectionEyebrow>Source detail</SectionEyebrow>
      <AuditTable small headers={["Source", "Metric", "Clicks", "Window"]} widths={["31%", "38%", "14%", "17%"]} rows={p.sourceDetail.map(toSourceRow)} />
      <Callout>{p.sourceInsight.map((item) => <li key={item}>{item}</li>)}</Callout>
    </SlideWrapper>
  );
}

function MetricGrid({ titles, values, sub1, sub2 }: { titles: string[]; values: string[]; sub1: string[]; sub2: string[] }) {
  return (
    <div className="responsive-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 18, marginBottom: 28 }}>
      {titles.slice(0, 3).map((title, i) => (
        <div key={title} style={{ border: "1px solid #bfdbfe", background: "#eff6ff", borderRadius: 12, padding: 20 }}>
          <p style={{ color: "#1d4ed8", fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em" }}>{title}</p>
          <p style={{ color: SLATE, fontSize: 34, lineHeight: 1, fontWeight: 850, letterSpacing: "-0.04em", marginTop: 12 }}>{values[i]}</p>
          <p style={{ color: MUTED, fontSize: 12, marginTop: 8 }}>{sub1[i]}</p>
          <p style={{ color: MUTED, fontSize: 12 }}>{sub2[i]}</p>
        </div>
      ))}
    </div>
  );
}

function SectionEyebrow({ children }: { children: ReactNode }) {
  return <h3 style={{ margin: "6px 0 12px", color: ROSE, fontSize: 12, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em" }}>{children}</h3>;
}

function Callout({ children }: { children: ReactNode }) {
  return (
    <div style={{ marginTop: 22, border: `1px solid ${BORDER}`, background: CALLOUT_SURFACE, borderRadius: 12, padding: "18px 20px" }}>
      <h3 style={{ margin: "0 0 10px", color: SLATE, fontSize: 13, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.06em" }}>What this tells us</h3>
      <ul style={{ margin: 0, paddingLeft: 18, color: "#475569", fontSize: 13 }}>{children}</ul>
    </div>
  );
}

function toDeliverySplitRow(r: DeliverySplitRow) {
  return [r.label, r.sales, r.orders, r.avgOrder, r.share];
}

function toSourceRow(r: SourceSummaryRow) {
  return [r.source, r.metric, r.value, r.window];
}


export function Component({ payload: p }: { payload: DeliveryRadiusReviewPayload }) {
  return (
    <>
      <DeckStyles />
      <div style={{ position: "fixed", top: 0, left: 0, right: 0, height: 4, background: "#e2e8f0", zIndex: 50 }}>
        <div id="progress-bar" style={{ height: "100%", width: "0%", background: BLUE, transition: "width 150ms ease" }} />
      </div>
      <main className="delivery-radius-deck">
        <CoverSlide p={p} />
        <MonthlySlide p={p} />
        <RadiusSlide p={p} />
        <ChannelSlide p={p} />
        <SourcesSlide p={p} />
      </main>
      <DeckScrollEffects />
    </>
  );
}
