import { getPayload } from "payload";
import { notFound } from "next/navigation";
import config from "@/payload.config";
import "./report.css";

// ---------------------------------------------------------------------------
// Report types (mirror Growth Tools SeoProposalReport — kept loose on purpose
// so a partial/degraded report still renders).
// ---------------------------------------------------------------------------

type QueryRow = { query: string; clicks: number; impressions: number; ctr: number; position: number };
type PageRow = { url: string; clicks: number; impressions: number; ctr: number; position: number };

type SeoProposalReport = {
  meta?: {
    websiteUrl?: string;
    gscSiteUrl?: string;
    businessType?: string;
    location?: string;
    generatedAt?: string;
    brandTerms?: string[];
  };
  searchPerformance?: {
    totalClicks: number;
    totalImpressions: number;
    averageCtr: number;
    averagePosition: number;
    brandClicks: number;
    nonBrandClicks: number;
    brandDependencyPct: number;
    topNonBrandQueries: QueryRow[];
    strikingDistanceQueries: QueryRow[];
    buriedQueries: QueryRow[];
    topPages: PageRow[];
    trend: { firstHalfClicks: number; secondHalfClicks: number; clicksChangePct: number; direction: string };
  } | null;
  gscTechnical?: {
    indexRate: number; indexed: number; notIndexed: number; errors: number;
    sitemapHealth: number; crawlHealth: number; canonicalHealth: number; overallScore: number;
    topExclusionReasons: { reason: string; count: number }[];
  } | null;
  demandLandscape?: {
    totalKeywords: number; totalMonthlyVolume: number;
    categories: { name: string; keywordCount: number; totalVolume: number }[];
  } | null;
  liveRankings?: {
    keywordsChecked: number; page1Count: number;
    rankings: { keyword: string; position: number | null; searchVolume: number; opportunity: string }[];
  } | null;
  seoAudit?: { overallScore: number; categoryScores: Record<string, number>; topRecommendations: { title: string; impact: string }[] } | null;
  croAudit?: { overallScore: number; categoryScores: Record<string, number> } | null;
  serviceCoverage?: {
    offeredServices: string[]; coveredServices: string[];
    missingServicePages: { service: string; evidence: string }[];
    multiServicePagesToSplit: { url: string; services: string[] }[];
  } | null;
  locationTargeting?: {
    isMultiLocation: boolean; confidence: string; detectedLocations: string[]; hasLocationPages: boolean;
    locationOpportunities: { location: string; service: string; gscImpressions: number }[];
  } | null;
  topicAuthority?: {
    runId: number | null;
    clusters: { name: string; pages: string[]; isBlogCluster: boolean; memberCount: number }[];
    underlinkedClusters: { name: string; memberCount: number; reason: string }[];
    linkSuggestions: { sourceUrl: string; targetUrl: string; anchorText: string; confidenceScore: number; clusterName: string | null }[];
  } | null;
  synthesis?: {
    verdict: string;
    narrative?: string;
    opportunityTiers: { quickWins: QueryRow[]; growth: QueryRow[]; foundational: QueryRow[] };
    trafficUpside: {
      conservativeAdditionalClicks: number; optimisticAdditionalClicks: number;
      queries: { query: string; currentPosition: number; targetPosition: number; additionalMonthlyClicks: number }[];
    };
    roi: {
      assumptions: { conversionRate: number; averageOrderValue: number | null; costPerLead: number | null };
      conservative: RoiBand;
      optimistic: RoiBand;
      note: string;
    } | null;
  };
  sectionStatus?: Record<string, string>;
};

type RoiBand = {
  additionalMonthlyClicks: number;
  additionalMonthlyLeads: number;
  additionalMonthlyRevenue: number | null;
  equivalentPaidLeadCost: number | null;
  additionalAnnualRevenue: number | null;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function money(n: number | null | undefined): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(n);
}
function num(n: number | null | undefined): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-AU").format(Math.round(n));
}
function pct(n: number | null | undefined, digits = 1): string {
  if (n == null) return "—";
  return `${(n * 100).toFixed(digits)}%`;
}

async function loadRecord(idOrSlug: string) {
  const payload = await getPayload({ config: await config });
  // Try slug first, then numeric id.
  const bySlug = await payload.find({
    collection: "seo-audit-proposals",
    where: { reportSlug: { equals: idOrSlug } },
    limit: 1,
    overrideAccess: true,
  });
  if (bySlug.docs.length > 0) return bySlug.docs[0];
  const numId = Number(idOrSlug);
  if (!Number.isNaN(numId)) {
    try {
      return await payload.findByID({ collection: "seo-audit-proposals", id: numId, overrideAccess: true });
    } catch {
      return null;
    }
  }
  return null;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const record = (await loadRecord(id)) as any;
  const site = record?.websiteUrl || "SEO Audit Proposal";
  return { title: `SEO Audit Proposal — ${site}` };
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function SeoAuditProposalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const record = (await loadRecord(id)) as any;
  if (!record) notFound();

  const report = (record.report || null) as SeoProposalReport | null;
  if (!report || record.status !== "completed") {
    return (
      <div className="sap-wrap">
        <h1>SEO Audit Proposal</h1>
        <p className="sap-muted">
          {record.status === "running"
            ? "This proposal is still being generated. Refresh shortly."
            : record.status === "failed"
              ? `This run failed: ${record.error || "unknown error"}`
              : "No report yet. Run the SEO Audit Proposal to generate it."}
        </p>
      </div>
    );
  }

  const sp = report.searchPerformance;
  const tech = report.gscTechnical;
  const demand = report.demandLandscape;
  const live = report.liveRankings;
  const seo = report.seoAudit;
  const cro = report.croAudit;
  const svc = report.serviceCoverage;
  const loc = report.locationTargeting;
  const topic = report.topicAuthority;
  const syn = report.synthesis;
  const roi = syn?.roi ?? null;

  return (
    <div className="sap-wrap">
      <header className="sap-header">
        <div className="sap-eyebrow">SEO Audit Proposal</div>
        <h1>{report.meta?.websiteUrl || record.websiteUrl}</h1>
        {syn?.verdict && <p className="sap-verdict">{syn.verdict}</p>}
        {syn?.narrative && <p className="sap-narrative">{syn.narrative}</p>}
        {report.meta?.generatedAt && (
          <div className="sap-muted">Generated {new Date(report.meta.generatedAt).toLocaleDateString("en-AU")}</div>
        )}
      </header>

      {/* Headline metrics */}
      {sp && (
        <section className="sap-section">
          <h2>Search performance (Search Console)</h2>
          <div className="sap-metric-grid">
            <Metric label="Clicks" value={num(sp.totalClicks)} />
            <Metric label="Impressions" value={num(sp.totalImpressions)} />
            <Metric label="Avg CTR" value={pct(sp.averageCtr)} />
            <Metric label="Avg position" value={sp.averagePosition.toFixed(1)} />
            <Metric
              label="Brand dependency"
              value={`${sp.brandDependencyPct}%`}
              tone={sp.brandDependencyPct >= 70 ? "warn" : "ok"}
              sub={`${num(sp.brandClicks)} brand · ${num(sp.nonBrandClicks)} non-brand`}
            />
            <Metric
              label="Trend"
              value={`${sp.trend.clicksChangePct > 0 ? "+" : ""}${sp.trend.clicksChangePct}%`}
              tone={sp.trend.direction === "down" ? "warn" : sp.trend.direction === "up" ? "ok" : "neutral"}
              sub={`${sp.trend.direction} over window`}
            />
          </div>

          {sp.strikingDistanceQueries.length > 0 && (
            <>
              <h3>Quick wins — striking distance (positions 4–20)</h3>
              <QueryTable rows={sp.strikingDistanceQueries.slice(0, 15)} />
            </>
          )}
        </section>
      )}

      {/* Money slide: traffic upside + ROI */}
      {syn?.trafficUpside && (
        <section className="sap-section sap-money">
          <h2>The opportunity</h2>
          <div className="sap-band">
            <div className="sap-band-col">
              <div className="sap-band-label">Conservative</div>
              <div className="sap-band-clicks">+{num(syn.trafficUpside.conservativeAdditionalClicks)} clicks/mo</div>
              {roi && (
                <>
                  <div className="sap-band-line">{num(roi.conservative.additionalMonthlyLeads)} leads/mo</div>
                  <div className="sap-band-revenue">{money(roi.conservative.additionalMonthlyRevenue)}/mo</div>
                  <div className="sap-band-line">{money(roi.conservative.additionalAnnualRevenue)}/yr</div>
                </>
              )}
            </div>
            <div className="sap-band-col sap-band-optimistic">
              <div className="sap-band-label">Optimistic</div>
              <div className="sap-band-clicks">+{num(syn.trafficUpside.optimisticAdditionalClicks)} clicks/mo</div>
              {roi && (
                <>
                  <div className="sap-band-line">{num(roi.optimistic.additionalMonthlyLeads)} leads/mo</div>
                  <div className="sap-band-revenue">{money(roi.optimistic.additionalMonthlyRevenue)}/mo</div>
                  <div className="sap-band-line">{money(roi.optimistic.additionalAnnualRevenue)}/yr</div>
                </>
              )}
            </div>
          </div>
          {roi?.note && <p className="sap-note">{roi.note}</p>}
          {!roi && <p className="sap-note">Add an average order value + conversion rate to see the revenue band.</p>}
        </section>
      )}

      {/* Scores */}
      {(seo || cro || tech) && (
        <section className="sap-section">
          <h2>Health scores</h2>
          <div className="sap-metric-grid">
            {seo && <Metric label="SEO" value={`${seo.overallScore}/10`} tone={seo.overallScore >= 7 ? "ok" : seo.overallScore >= 5 ? "neutral" : "warn"} />}
            {cro && <Metric label="CRO" value={`${cro.overallScore}/10`} tone={cro.overallScore >= 7 ? "ok" : cro.overallScore >= 5 ? "neutral" : "warn"} />}
            {tech && <Metric label="GSC technical" value={`${tech.overallScore}/10`} sub={`${tech.indexRate}% indexed`} />}
          </div>
          {seo?.topRecommendations?.length ? (
            <ul className="sap-list">
              {seo.topRecommendations.map((r, i) => (
                <li key={i}><strong>{r.title}</strong> — {r.impact}</li>
              ))}
            </ul>
          ) : null}
        </section>
      )}

      {/* Demand landscape */}
      {demand && demand.categories.length > 0 && (
        <section className="sap-section">
          <h2>Market demand</h2>
          <div className="sap-muted">{num(demand.totalMonthlyVolume)} monthly searches across {num(demand.totalKeywords)} keywords</div>
          <table className="sap-table">
            <thead><tr><th>Category</th><th>Keywords</th><th>Monthly volume</th></tr></thead>
            <tbody>
              {demand.categories.slice(0, 12).map((c, i) => (
                <tr key={i}><td>{c.name}</td><td>{num(c.keywordCount)}</td><td>{num(c.totalVolume)}</td></tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* Service coverage */}
      {svc && (svc.missingServicePages.length > 0 || svc.multiServicePagesToSplit.length > 0) && (
        <section className="sap-section">
          <h2>Service coverage</h2>
          {svc.missingServicePages.length > 0 && (
            <>
              <h3>Missing service pages</h3>
              <ul className="sap-list">
                {svc.missingServicePages.map((m, i) => (
                  <li key={i}><strong>{m.service}</strong> — {m.evidence}</li>
                ))}
              </ul>
            </>
          )}
          {svc.multiServicePagesToSplit.length > 0 && (
            <>
              <h3>Pages to split into dedicated services</h3>
              <ul className="sap-list">
                {svc.multiServicePagesToSplit.map((p, i) => (
                  <li key={i}><code>{p.url}</code> — covers {p.services.join(", ")}</li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      {/* Location targeting */}
      {loc && loc.confidence !== "none" && (
        <section className="sap-section">
          <h2>Location targeting</h2>
          <div className="sap-muted">
            {loc.isMultiLocation ? "Multi-location business detected" : "Possible multi-location signals"} ·
            {" "}{loc.detectedLocations.join(", ")}
          </div>
          {loc.locationOpportunities.length > 0 && (
            <table className="sap-table">
              <thead><tr><th>Location</th><th>Service intent</th><th>Impressions</th></tr></thead>
              <tbody>
                {loc.locationOpportunities.slice(0, 10).map((o, i) => (
                  <tr key={i}><td>{o.location}</td><td>{o.service}</td><td>{num(o.gscImpressions)}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      {/* Topic authority */}
      {topic && (topic.clusters.length > 0 || topic.linkSuggestions.length > 0) && (
        <section className="sap-section">
          <h2>Topic authority & internal linking</h2>
          {topic.clusters.filter((c) => c.isBlogCluster).length > 0 && (
            <>
              <h3>Blog clusters to strengthen</h3>
              <ul className="sap-list">
                {topic.clusters.filter((c) => c.isBlogCluster).slice(0, 8).map((c, i) => (
                  <li key={i}><strong>{c.name}</strong> — {c.memberCount} pages</li>
                ))}
              </ul>
            </>
          )}
          {topic.underlinkedClusters.length > 0 && (
            <>
              <h3>Under-linked clusters</h3>
              <ul className="sap-list">
                {topic.underlinkedClusters.slice(0, 8).map((c, i) => (
                  <li key={i}><strong>{c.name}</strong> — {c.reason}</li>
                ))}
              </ul>
            </>
          )}
          {topic.linkSuggestions.length > 0 && (
            <>
              <h3>Top internal-link suggestions</h3>
              <ul className="sap-list">
                {topic.linkSuggestions.slice(0, 10).map((s, i) => (
                  <li key={i}>
                    <code>{s.sourceUrl}</code> → <code>{s.targetUrl}</code> (&ldquo;{s.anchorText}&rdquo;, {s.confidenceScore}%)
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      {/* Live rankings */}
      {live && live.rankings.length > 0 && (
        <section className="sap-section">
          <h2>Current rankings</h2>
          <div className="sap-muted">{live.page1Count} of {live.keywordsChecked} keywords on page 1</div>
          <table className="sap-table">
            <thead><tr><th>Keyword</th><th>Position</th><th>Volume</th></tr></thead>
            <tbody>
              {live.rankings.slice(0, 20).map((r, i) => (
                <tr key={i}><td>{r.keyword}</td><td>{r.position ?? "—"}</td><td>{num(r.searchVolume)}</td></tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}

function Metric({ label, value, sub, tone = "neutral" }: { label: string; value: string; sub?: string; tone?: "ok" | "warn" | "neutral" }) {
  return (
    <div className={`sap-metric sap-metric-${tone}`}>
      <div className="sap-metric-value">{value}</div>
      <div className="sap-metric-label">{label}</div>
      {sub && <div className="sap-metric-sub">{sub}</div>}
    </div>
  );
}

function QueryTable({ rows }: { rows: QueryRow[] }) {
  return (
    <table className="sap-table">
      <thead><tr><th>Query</th><th>Position</th><th>Impressions</th><th>Clicks</th></tr></thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}><td>{r.query}</td><td>{r.position}</td><td>{num(r.impressions)}</td><td>{num(r.clicks)}</td></tr>
        ))}
      </tbody>
    </table>
  );
}
