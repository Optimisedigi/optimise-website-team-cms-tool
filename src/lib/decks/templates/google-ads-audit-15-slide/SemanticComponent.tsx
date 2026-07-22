import type { ReactNode } from "react";
import type { SemanticAuditSlide, SemanticGoogleAdsAuditPayload } from "./payload";

const money = (value: unknown, currency = "AUD") => new Intl.NumberFormat("en-AU", { style: "currency", currency, maximumFractionDigits: 0 }).format(Number(value ?? 0));
const number = (value: unknown) => new Intl.NumberFormat("en-AU", { maximumFractionDigits: 1 }).format(Number(value ?? 0));
const percent = (value: unknown) => `${number(Number(value ?? 0) * 100)}%`;

function Metric({ label, value }: { label: string; value: ReactNode }) {
  return <div className="gads-semantic__metric"><span>{label}</span><strong>{value}</strong></div>;
}

function MonthlyChart({ rows, currency }: { rows: any[]; currency: string }) {
  const values = rows.map((row) => Number(row.cost ?? 0));
  const maximum = Math.max(...values, 1);
  const firstMonth = rows[0]?.month ? String(rows[0].month).slice(0, 7) : "no available month";
  const lastMonth = rows.at(-1)?.month ? String(rows.at(-1).month).slice(0, 7) : "no available month";
  const summary = rows.length > 0
    ? `Monthly Google Ads spend trend from ${firstMonth} to ${lastMonth}. Highest monthly spend ${money(maximum, currency)}.`
    : "Monthly Google Ads spend trend unavailable.";
  return <div className="gads-semantic__chart" role="img" aria-label={summary}>
    {rows.slice(-18).map((row) => <div className="gads-semantic__bar-column" key={row.month}>
      <span className="gads-semantic__bar-value">{money(row.cost, currency)}</span>
      <span className="gads-semantic__bar" style={{ height: `${Math.max(3, (Number(row.cost ?? 0) / maximum) * 100)}%` }} />
      <span className="gads-semantic__bar-label">{String(row.month).slice(2)}</span>
    </div>)}
  </div>;
}

function SlideContent({ slide, payload }: { slide: SemanticAuditSlide; payload: SemanticGoogleAdsAuditPayload }) {
  const a = payload.analysis as any;
  const currency = payload.provenance.currencyCode || "AUD";
  const total = a.totals ?? {};
  switch (slide.id) {
    case "cover": return <><p className="gads-semantic__lead">A traceable, account-specific review of performance and improvement priorities.</p><div className="gads-semantic__period">{String(payload.provenance.periodStart).slice(0, 10)} to {String(payload.provenance.periodEnd).slice(0, 10)}</div></>;
    case "executive-summary": return <><div className="gads-semantic__metrics"><Metric label="Spend" value={money(total.cost, currency)} /><Metric label="Primary conversions" value={number(total.conversions)} /><Metric label="Primary CPA" value={total.cpa == null ? "Not available" : money(total.cpa, currency)} /><Metric label="Audit score" value={a.scoring?.total == null ? "Not assessed" : `${number(a.scoring.total)}/100`} /></div><ul className="gads-semantic__list">{(a.recommendations ?? []).slice(0, 4).map((item: any) => <li key={item.title}>{item.title}</li>)}</ul></>;
    case "account-glance": return <><div className="gads-semantic__metrics"><Metric label="Impressions" value={number(total.impressions)} /><Metric label="Clicks" value={number(total.clicks)} /><Metric label="CTR" value={percent(total.ctr)} /><Metric label="Average CPC" value={money(total.averageCpc, currency)} /></div><MonthlyChart rows={a.monthlyTrend ?? []} currency={currency} /></>;
    case "conversion-tracking": return <div className="gads-semantic__metrics"><Metric label="Configured actions" value={number(a.conversionDiagnostics?.configuredActions)} /><Metric label="Primary actions" value={number(a.conversionDiagnostics?.primaryActions)} /><Metric label="Primary conversions" value={number(a.conversionDiagnostics?.primaryConversions)} /><Metric label="All conversions" value={number(a.conversionDiagnostics?.allConversions)} /></div>;
    case "audit-score": return <><div className="gads-semantic__score">{a.scoring?.total == null ? <span>Not assessed</span> : <>{number(a.scoring.total)}<small>/100</small></>}</div><CategoryScorecards categories={payload.scorecards ?? a.scoring?.categories ?? []} /></>;
    case "structure": return <div className="gads-semantic__metrics"><Metric label="Campaigns" value={number(a.structure?.campaigns)} /><Metric label="Enabled campaigns" value={number(a.structure?.enabledCampaigns)} /><Metric label="Ad groups" value={number(a.structure?.adGroups)} /><Metric label="Enabled ads" value={number(a.structure?.enabledAds)} /></div>;
    case "brand-generic": return <div className="gads-semantic__comparison"><Metric label="Brand spend" value={money(a.brandGeneric?.brand?.cost, currency)} /><Metric label="Brand CPA" value={a.brandGeneric?.brand?.cpa == null ? "Not available" : money(a.brandGeneric.brand.cpa, currency)} /><Metric label="Generic spend" value={money(a.brandGeneric?.generic?.cost, currency)} /><Metric label="Generic CPA" value={a.brandGeneric?.generic?.cpa == null ? "Not available" : money(a.brandGeneric.generic.cpa, currency)} /></div>;
    case "campaign-performance": return <DataTable rows={a.channelPerformance ?? []} currency={currency} />;
    case "impression-share": return <><p className="gads-semantic__lead">Budget and rank loss are separated so opportunity is not overstated.</p><ImpressionShareList rows={a.impressionShare?.campaigns ?? []} /></>;
    case "competitors": return <SimpleList rows={(a.competitors ?? []).slice(0, 8)} label={(row) => row.domain || "Unknown domain"} value={(row) => row.appearances ? `${row.appearances} paid listing${row.appearances === 1 ? "" : "s"}` : "Paid competitor"} />;
    case "search-terms": return <><div className="gads-semantic__metrics"><Metric label="Confirmed wasted spend" value={money(a.searchTerms?.confirmedWasteAmount, currency)} /><Metric label="Terms needing review" value={number(a.searchTerms?.reviewCount)} /></div><SimpleList rows={(a.searchTerms?.classified ?? []).filter((row: any) => row.category !== "relevant").slice(0, 8)} label={(row) => row.term} value={(row) => `${money(row.spend, currency)} · ${row.category}`} /></>;
    case "negatives": return <div className="gads-semantic__metrics"><Metric label="Campaign negatives" value={number(a.negatives?.campaignCount)} /><Metric label="Shared-list negatives" value={number(a.negatives?.sharedCount)} /><Metric label="List assignments" value={number(a.negatives?.assignments)} /></div>;
    case "ad-copy": return <div className="gads-semantic__metrics"><Metric label="Ads reviewed" value={number(a.adCopy?.ads)} /><Metric label="Assets reviewed" value={number(a.adCopy?.assets)} /><Metric label="Poor ad strength" value={number(a.adCopy?.strengthCounts?.POOR)} /><Metric label="Unrated ads" value={number(a.adCopy?.strengthCounts?.UNRATED)} /></div>;
    case "landing-pages": return <SimpleList rows={(a.landingPages?.pages ?? []).slice(0, 8)} label={(row) => row.name} value={(row) => `${money(row.cost, currency)} spend · ${row.cpa == null ? "CPA unavailable" : money(row.cpa, currency)}`} />;
    case "recommendations": return <ol className="gads-semantic__recommendations">{(a.recommendations ?? []).map((item: any) => <li key={item.title}><span>{item.priority}</span><div><strong>{item.title}</strong><small>{item.area?.replace(/_/g, " ")}</small></div></li>)}</ol>;
    case "quantified-opportunity": return <><p className="gads-semantic__lead">The defensible baseline uses primary conversions only.</p><div className="gads-semantic__metrics"><Metric label="Current primary CPA" value={total.cpa == null ? "Not available" : money(total.cpa, currency)} /><Metric label="Confirmed waste" value={money(a.searchTerms?.confirmedWasteAmount, currency)} /></div></>;
    case "how-we-work": return <Steps items={["Validate measurement", "Control intent and structure", "Test creative and landing pages", "Reallocate from evidence"]} />;
    case "working-together": return <Steps items={["Agree the conversion definition", "Prioritize the first 90 days", "Review changes and outcomes together"]} />;
    case "closing": return <><p className="gads-semantic__lead">Start with the highest-confidence changes, measure primary outcomes, then scale what works.</p><p>Optimise Digital</p></>;
    case "methodology": return <><dl className="gads-semantic__provenance"><dt>Captured</dt><dd>{payload.provenance.capturedAt}</dd><dt>Account timezone</dt><dd>{payload.provenance.accountTimeZone}</dd><dt>Earliest available activity</dt><dd>{payload.provenance.earliestAvailableActivityDate}</dd><dt>Rubric</dt><dd>{payload.provenance.rubricVersion ?? "Legacy payload"}</dd></dl><p>{payload.provenance.retentionCaveat}</p><EvidenceGaps coverage={a.evidenceCoverage} /></>;
    default: return <p className="gads-semantic__lead">Evidence retained in the immutable audit snapshot.</p>;
  }
}

function CategoryScorecards({ categories }: { categories: any[] }) {
  return <div className="gads-semantic__categories" aria-label={`${categories.length} audit category scores`}>
    {categories.map((category) => <article className="gads-semantic__category" data-status={category.status} key={category.id}>
      <div><strong>{category.label}</strong><small>Weight {category.weight}</small></div>
      <span>{category.score == null ? "Not assessed" : `${number(category.score)}/10`}</span>
    </article>)}
  </div>;
}

function EvidenceGaps({ coverage }: { coverage: any }) {
  const unavailable = (coverage?.datasets ?? []).filter((item: any) => item.status !== "completed");
  if (!unavailable.length) return <p className="gads-semantic__coverage" data-status="complete">All required evidence collectors completed.</p>;
  return <div className="gads-semantic__coverage" data-status="partial"><strong>Evidence not assessed</strong><p>{unavailable.map((item: any) => item.datasetKey.replace(/_/g, " ")).join(", ")}</p>{coverage?.unavailableProviders?.length > 0 && <small>Unavailable providers: {coverage.unavailableProviders.join(", ")}</small>}</div>;
}

function ImpressionShareList({ rows }: { rows: any[] }) {
  return <SimpleList
    rows={rows.slice(0, 8)}
    label={(row) => row.campaign?.name || "Unknown campaign"}
    value={(row) => {
      const metrics = row.metrics ?? {};
      const share = metrics.searchImpressionShare ?? metrics.search_impression_share;
      const budgetLost = metrics.searchBudgetLostImpressionShare ?? metrics.search_budget_lost_impression_share;
      const rankLost = metrics.searchRankLostImpressionShare ?? metrics.search_rank_lost_impression_share;
      return `IS ${percent(share)} · budget lost ${percent(budgetLost)} · rank lost ${percent(rankLost)}`;
    }}
  />;
}

function DataTable({ rows, currency }: { rows: any[]; currency: string }) { return <div className="gads-semantic__table" role="table">{rows.slice(0, 8).map((row) => <div role="row" key={row.name}><strong role="cell">{row.name}</strong><span role="cell">{money(row.cost, currency)}</span><span role="cell">{number(row.conversions)} conversions</span><span role="cell">{row.cpa == null ? "CPA unavailable" : money(row.cpa, currency)}</span></div>)}</div> }
function SimpleList({ rows, label, value }: { rows: any[]; label: (row: any) => string; value: (row: any) => string }) { return <ul className="gads-semantic__ranked">{rows.map((row, index) => <li key={`${label(row)}-${index}`}><span>{label(row)}</span><strong>{value(row)}</strong></li>)}</ul> }
function Steps({ items }: { items: string[] }) { return <ol className="gads-semantic__steps">{items.map((item, index) => <li key={item}><span>{String(index + 1).padStart(2, "0")}</span>{item}</li>)}</ol> }

export function SemanticComponent({ payload }: { payload: SemanticGoogleAdsAuditPayload }) {
  const visibleSlides = payload.slides.filter((slide) => !slide.hidden && (slide.required || (slide.assessment !== "not_applicable" && slide.completeness !== "unavailable")));
  return <main className="gads-semantic">{visibleSlides.map((slide, index) => <section className="gads-semantic__slide" data-slide-id={slide.id} key={slide.id}>
    <div className="gads-semantic__topline"><span>{payload.clientName}</span><span>{slide.assessment.replace("_", " ")}</span></div>
    <header><p>{String(index + 1).padStart(2, "0")} / {String(visibleSlides.length).padStart(2, "0")}</p><h1>{slide.title}</h1></header>
    <div className="gads-semantic__content"><SlideContent slide={slide} payload={payload} /></div>
    <footer>Google Ads audit · {String(payload.provenance.periodStart).slice(0, 10)} to {String(payload.provenance.periodEnd).slice(0, 10)}</footer>
  </section>)}</main>;
}
