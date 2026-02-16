import React from "react";
import { getPayload } from "payload";
import config from "@/payload.config";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function GscDashboardPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });

  const clientsResult = await payload.find({
    collection: "clients",
    where: { slug: { equals: slug } },
    limit: 1,
    overrideAccess: true,
  });

  const client = clientsResult.docs[0];
  if (!client) return notFound();

  if (!client.gscConnected) {
    return (
      <div style={styles.container}>
        <h1 style={styles.h1}>{client.name} — Search Console</h1>
        <p style={styles.muted}>
          Google Search Console is not connected for this client.
        </p>
      </div>
    );
  }

  const snapshotsResult = await payload.find({
    collection: "gsc-snapshots",
    where: { client: { equals: client.id } },
    sort: "-snapshotDate",
    limit: 1,
    overrideAccess: true,
  });

  const snapshot = snapshotsResult.docs[0];

  const alertsResult = await payload.find({
    collection: "gsc-alerts",
    where: { client: { equals: client.id } },
    sort: "-createdAt",
    limit: 10,
    overrideAccess: true,
  });

  const alerts = alertsResult.docs;

  if (!snapshot) {
    return (
      <div style={styles.container}>
        <h1 style={styles.h1}>{client.name} — Search Console</h1>
        <p style={styles.muted}>
          No data yet. Run a sync from the admin panel to pull GSC data.
        </p>
      </div>
    );
  }

  const topKeywords = (snapshot.topKeywords as any[]) || [];
  const topPages = (snapshot.topPages as any[]) || [];
  const sitemaps = (snapshot.sitemaps as any[]) || [];
  const cwvMobile = snapshot.cwvMobile as any;
  const cwvDesktop = snapshot.cwvDesktop as any;
  const indexingIssues = (snapshot.indexingIssues as any[]) || [];

  const unresolvedAlerts = alerts.filter((a: any) => !a.resolved);
  const criticalCount = unresolvedAlerts.filter((a: any) => a.severity === "critical").length;
  const warningCount = unresolvedAlerts.filter((a: any) => a.severity === "warning").length;

  // Build summary findings
  const findings: Array<{ type: "good" | "warning" | "critical"; text: string }> = [];

  if ((snapshot.totalClicks || 0) > 0) {
    findings.push({ type: "good", text: `${formatNumber(snapshot.totalClicks)} clicks from organic search over the last 28 days` });
  }
  if (snapshot.clicksChange && snapshot.clicksChange > 0) {
    findings.push({ type: "good", text: `Clicks up ${snapshot.clicksChange}% compared to the previous period` });
  } else if (snapshot.clicksChange && snapshot.clicksChange < -10) {
    findings.push({ type: snapshot.clicksChange < -20 ? "critical" : "warning", text: `Clicks down ${Math.abs(snapshot.clicksChange)}% compared to the previous period` });
  }
  if ((snapshot.avgPosition || 0) > 0 && (snapshot.avgPosition || 0) <= 10) {
    findings.push({ type: "good", text: `Average position ${snapshot.avgPosition} — appearing on page 1` });
  } else if ((snapshot.avgPosition || 0) > 20) {
    findings.push({ type: "warning", text: `Average position ${snapshot.avgPosition} — most pages are beyond page 2` });
  }
  if ((snapshot.indexedPages || 0) > 0) {
    const total = (snapshot.indexedPages || 0) + (snapshot.notIndexedPages || 0);
    const pct = total > 0 ? Math.round(((snapshot.indexedPages || 0) / total) * 100) : 0;
    findings.push({ type: pct >= 80 ? "good" : "warning", text: `${formatNumber(snapshot.indexedPages)} of ${formatNumber(total)} pages indexed (${pct}%)` });
  }
  if (cwvMobile?.status === "POOR") {
    findings.push({ type: "critical", text: "Mobile Core Web Vitals are failing" });
  } else if (cwvMobile?.status === "GOOD") {
    findings.push({ type: "good", text: "Mobile Core Web Vitals passing" });
  }
  if (cwvDesktop?.status === "POOR") {
    findings.push({ type: "critical", text: "Desktop Core Web Vitals are failing" });
  } else if (cwvDesktop?.status === "GOOD") {
    findings.push({ type: "good", text: "Desktop Core Web Vitals passing" });
  }
  for (const s of sitemaps) {
    if (s.errors > 0) {
      findings.push({ type: "warning", text: `Sitemap ${s.url} has ${s.errors} error(s)` });
    }
  }

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <h1 style={styles.h1}>{client.name}</h1>
        <p style={styles.subtitle}>Google Search Console Report</p>
        <p style={styles.muted}>
          28-day period: {formatDate(snapshot.periodStart)} — {formatDate(snapshot.periodEnd)}
        </p>
      </div>

      {/* ===== SUMMARY SECTION ===== */}
      <section style={{ ...styles.section, ...styles.summarySection }}>
        <h2 style={styles.h2}>Summary</h2>

        {/* Health indicator */}
        <div style={styles.healthBar}>
          <div style={{
            ...styles.healthIndicator,
            background: criticalCount > 0 ? "#dc2626" : warningCount > 0 ? "#d97706" : "#16a34a",
          }}>
            <span style={styles.healthText}>
              {criticalCount > 0 ? "Needs Attention" : warningCount > 0 ? "Minor Issues" : "Healthy"}
            </span>
          </div>
          {unresolvedAlerts.length > 0 && (
            <span style={styles.healthDetail}>
              {criticalCount > 0 && `${criticalCount} critical`}
              {criticalCount > 0 && warningCount > 0 && ", "}
              {warningCount > 0 && `${warningCount} warning`}
            </span>
          )}
        </div>

        {/* Key findings */}
        {findings.length > 0 && (
          <div style={styles.findingsList}>
            {findings.map((f, i) => (
              <div key={i} style={styles.findingRow}>
                <span style={{
                  ...styles.findingDot,
                  background: f.type === "good" ? "#16a34a" : f.type === "warning" ? "#d97706" : "#dc2626",
                }} />
                <span style={styles.findingText}>{f.text}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ===== TOPLINE METRICS ===== */}
      <section style={styles.section}>
        <h2 style={styles.h2}>Search Performance</h2>
        <div style={styles.grid4}>
          <MetricCard
            label="Total Clicks"
            value={formatNumber(snapshot.totalClicks)}
            change={snapshot.clicksChange}
          />
          <MetricCard
            label="Total Impressions"
            value={formatNumber(snapshot.totalImpressions)}
            change={snapshot.impressionsChange}
          />
          <MetricCard
            label="Avg CTR"
            value={`${snapshot.avgCtr || 0}%`}
            change={null}
          />
          <MetricCard
            label="Avg Position"
            value={String(snapshot.avgPosition || 0)}
            change={snapshot.positionChange ? -snapshot.positionChange : null}
          />
        </div>
      </section>

      {/* ===== TOP KEYWORDS ===== */}
      {topKeywords.length > 0 && (
        <section style={styles.section}>
          <h2 style={styles.h2}>Top Keywords</h2>
          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Keyword</th>
                  <th style={styles.thRight}>Clicks</th>
                  <th style={styles.thRight}>Impressions</th>
                  <th style={styles.thRight}>CTR</th>
                  <th style={styles.thRight}>Position</th>
                </tr>
              </thead>
              <tbody>
                {topKeywords.slice(0, 20).map((kw: any, i: number) => (
                  <tr key={i} style={i % 2 === 0 ? styles.rowEven : undefined}>
                    <td style={styles.td}>{kw.keyword}</td>
                    <td style={styles.tdRight}>{formatNumber(kw.clicks)}</td>
                    <td style={styles.tdRight}>{formatNumber(kw.impressions)}</td>
                    <td style={styles.tdRight}>{kw.ctr}%</td>
                    <td style={styles.tdRight}>{kw.position}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ===== INDEXING + CWV SIDE BY SIDE ===== */}
      <div style={styles.grid2}>
        {/* Indexing */}
        <section style={styles.section}>
          <h2 style={styles.h2}>Indexing</h2>
          <div style={styles.card}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
              <div>
                <span style={styles.cardLabel}>Indexed</span>
                <span style={{ ...styles.cardValue, fontSize: 24 }}>
                  {formatNumber(snapshot.indexedPages)}
                </span>
              </div>
              <div style={{ textAlign: "right" }}>
                <span style={styles.cardLabel}>Not Indexed</span>
                <span style={{ ...styles.cardValue, fontSize: 24, color: (snapshot.notIndexedPages || 0) > 0 ? "#dc2626" : "#111827" }}>
                  {formatNumber(snapshot.notIndexedPages)}
                </span>
              </div>
            </div>
            {(snapshot.indexedPages || 0) + (snapshot.notIndexedPages || 0) > 0 && (
              <div style={styles.barWrap}>
                <div style={{
                  ...styles.barGood,
                  width: `${((snapshot.indexedPages || 0) / ((snapshot.indexedPages || 0) + (snapshot.notIndexedPages || 0))) * 100}%`,
                }} />
                <div style={{
                  ...styles.barBad,
                  width: `${((snapshot.notIndexedPages || 0) / ((snapshot.indexedPages || 0) + (snapshot.notIndexedPages || 0))) * 100}%`,
                }} />
              </div>
            )}
            <p style={{ fontSize: 11, color: "#9ca3af", marginTop: 8, marginBottom: 0 }}>
              Based on pages appearing in search results
            </p>
            {indexingIssues.length > 0 && (
              <div style={{ marginTop: 12 }}>
                {indexingIssues.map((issue: any, i: number) => (
                  <p key={i} style={{ fontSize: 12, color: "#d97706", margin: "4px 0" }}>
                    {issue.reason}: {issue.count} page(s)
                  </p>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Core Web Vitals */}
        <section style={styles.section}>
          <h2 style={styles.h2}>Core Web Vitals</h2>
          {(cwvMobile || cwvDesktop) ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {cwvMobile && (
                <div style={styles.card}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <h3 style={{ ...styles.h3, margin: 0 }}>Mobile</h3>
                    <CwvStatusBadge status={cwvMobile.status} />
                  </div>
                  <CwvMetrics data={cwvMobile} />
                </div>
              )}
              {cwvDesktop && (
                <div style={styles.card}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <h3 style={{ ...styles.h3, margin: 0 }}>Desktop</h3>
                    <CwvStatusBadge status={cwvDesktop.status} />
                  </div>
                  <CwvMetrics data={cwvDesktop} />
                </div>
              )}
            </div>
          ) : (
            <div style={styles.card}>
              <p style={{ fontSize: 13, color: "#9ca3af", margin: 0 }}>
                No Core Web Vitals data available. The site may not have enough traffic for field data, and Lighthouse lab data was unavailable.
              </p>
            </div>
          )}
        </section>
      </div>

      {/* ===== SITEMAPS ===== */}
      {sitemaps.length > 0 && (
        <section style={styles.section}>
          <h2 style={styles.h2}>Sitemaps</h2>
          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>URL</th>
                  <th style={styles.thRight}>Status</th>
                  <th style={styles.thRight}>Warnings</th>
                  <th style={styles.thRight}>Errors</th>
                </tr>
              </thead>
              <tbody>
                {sitemaps.map((s: any, i: number) => (
                  <tr key={i} style={i % 2 === 0 ? styles.rowEven : undefined}>
                    <td style={styles.td}>{s.url}</td>
                    <td style={styles.tdRight}>
                      <StatusBadge
                        status={
                          s.errors > 0 ? "error" : s.warnings > 0 ? "warning" : s.isPending ? "pending" : "ok"
                        }
                      />
                    </td>
                    <td style={styles.tdRight}>{s.warnings}</td>
                    <td style={styles.tdRight}>{s.errors}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ===== ALERTS ===== */}
      {alerts.length > 0 && (
        <section style={styles.section}>
          <h2 style={styles.h2}>Recent Alerts</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {alerts.map((alert: any) => (
              <div
                key={alert.id}
                style={{
                  ...styles.card,
                  borderLeft: `4px solid ${
                    alert.severity === "critical" ? "#dc2626" : alert.severity === "warning" ? "#d97706" : "#2563eb"
                  }`,
                  opacity: alert.resolved ? 0.5 : 1,
                  padding: 16,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <SeverityBadge severity={alert.severity} />
                  <span style={{ fontSize: 12, color: "#9ca3af", textTransform: "capitalize" }}>{alert.category}</span>
                  {alert.resolved && (
                    <span style={{ fontSize: 11, color: "#16a34a", fontWeight: 600 }}>RESOLVED</span>
                  )}
                </div>
                <p style={{ fontWeight: 600, margin: "4px 0", fontSize: 14 }}>{alert.title}</p>
                {alert.description && (
                  <p style={{ fontSize: 13, color: "#6b7280", margin: "4px 0 0" }}>{alert.description}</p>
                )}
                {alert.recommendation && (
                  <p style={{ fontSize: 12, color: "#3b82f6", margin: "8px 0 0", fontStyle: "italic" }}>
                    Recommendation: {alert.recommendation}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ===== TOP PAGES ===== */}
      {topPages.length > 0 && (
        <section style={styles.section}>
          <h2 style={styles.h2}>Top Pages</h2>
          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Page</th>
                  <th style={styles.thRight}>Clicks</th>
                  <th style={styles.thRight}>Impressions</th>
                  <th style={styles.thRight}>CTR</th>
                  <th style={styles.thRight}>Position</th>
                </tr>
              </thead>
              <tbody>
                {topPages.slice(0, 20).map((pg: any, i: number) => (
                  <tr key={i} style={i % 2 === 0 ? styles.rowEven : undefined}>
                    <td style={{ ...styles.td, maxWidth: 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {pg.page}
                    </td>
                    <td style={styles.tdRight}>{formatNumber(pg.clicks)}</td>
                    <td style={styles.tdRight}>{formatNumber(pg.impressions)}</td>
                    <td style={styles.tdRight}>{pg.ctr}%</td>
                    <td style={styles.tdRight}>{pg.position}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Footer */}
      <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: 16, marginTop: 24 }}>
        <p style={{ fontSize: 11, color: "#9ca3af", margin: 0 }}>
          Synced {formatDate(snapshot.snapshotDate)} — {client.gscPropertyUrl}
        </p>
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  change,
}: {
  label: string;
  value: string;
  change: number | null | undefined;
}) {
  return (
    <div style={styles.card}>
      <span style={styles.cardLabel}>{label}</span>
      <span style={styles.cardValue}>{value}</span>
      {change != null && change !== 0 && (
        <span
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: change > 0 ? "#16a34a" : "#dc2626",
            marginTop: 4,
            display: "block",
          }}
        >
          {change > 0 ? "+" : ""}{change}%
        </span>
      )}
    </div>
  );
}

function CwvMetrics({ data }: { data: any }) {
  if (!data) return null;
  return (
    <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
      {data.lcp != null && (
        <CwvMetricItem label="LCP" value={data.lcp >= 1000 ? `${(data.lcp / 1000).toFixed(1)}s` : `${data.lcp}ms`} good={data.lcp <= 2500} />
      )}
      {data.inp != null && (
        <CwvMetricItem label="INP" value={`${data.inp}ms`} good={data.inp <= 200} />
      )}
      {data.cls != null && (
        <CwvMetricItem label="CLS" value={String(data.cls)} good={data.cls <= 0.1} />
      )}
      {data.performanceScore != null && (
        <CwvMetricItem label="Score" value={`${data.performanceScore}/100`} good={data.performanceScore >= 90} />
      )}
      {data.source && (
        <div style={{ display: "flex", alignItems: "flex-end" }}>
          <span style={{ fontSize: 10, color: "#9ca3af", fontStyle: "italic" }}>
            {data.source === "field" ? "Field data" : "Lab data"}
          </span>
        </div>
      )}
    </div>
  );
}

function CwvMetricItem({ label, value, good }: { label: string; value: string; good: boolean }) {
  return (
    <div>
      <span style={{ display: "block", fontSize: 11, color: "#9ca3af", fontWeight: 600, marginBottom: 2 }}>{label}</span>
      <span style={{ fontSize: 18, fontWeight: 700, color: good ? "#16a34a" : "#dc2626" }}>{value}</span>
    </div>
  );
}

function CwvStatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; text: string }> = {
    GOOD: { bg: "#dcfce7", text: "#166534" },
    NEEDS_IMPROVEMENT: { bg: "#fef3c7", text: "#92400e" },
    POOR: { bg: "#fef2f2", text: "#991b1b" },
  };
  const c = map[status] || { bg: "#f3f4f6", text: "#6b7280" };
  return (
    <span style={{ padding: "3px 10px", background: c.bg, color: c.text, borderRadius: 4, fontSize: 11, fontWeight: 700 }}>
      {status === "NEEDS_IMPROVEMENT" ? "NEEDS WORK" : status}
    </span>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  const colors: Record<string, { bg: string; text: string }> = {
    critical: { bg: "#fef2f2", text: "#dc2626" },
    warning: { bg: "#fffbeb", text: "#d97706" },
    info: { bg: "#eff6ff", text: "#2563eb" },
  };
  const c = colors[severity] || colors.info;
  return (
    <span style={{ padding: "2px 8px", background: c.bg, color: c.text, borderRadius: 4, fontSize: 11, fontWeight: 700, textTransform: "uppercase" }}>
      {severity}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; text: string; label: string }> = {
    ok: { bg: "#dcfce7", text: "#166534", label: "OK" },
    warning: { bg: "#fef3c7", text: "#92400e", label: "Warning" },
    error: { bg: "#fef2f2", text: "#991b1b", label: "Error" },
    pending: { bg: "#e0e7ff", text: "#3730a3", label: "Pending" },
  };
  const c = map[status] || map.ok;
  return (
    <span style={{ padding: "2px 8px", background: c.bg, color: c.text, borderRadius: 4, fontSize: 11, fontWeight: 600 }}>
      {c.label}
    </span>
  );
}

function formatNumber(n: number | null | undefined): string {
  if (n == null) return "0";
  return n.toLocaleString("en-AU");
}

function formatDate(d: string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-AU", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    maxWidth: 1100,
    margin: "0 auto",
    padding: "40px 24px",
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    color: "#1f2937",
    background: "#fff",
  },
  header: { marginBottom: 36 },
  h1: { fontSize: 30, fontWeight: 800, margin: "0 0 4px", color: "#111827" },
  subtitle: { fontSize: 16, fontWeight: 500, color: "#6b7280", margin: "0 0 4px" },
  h2: { fontSize: 18, fontWeight: 700, margin: "0 0 16px", color: "#111827" },
  h3: { fontSize: 14, fontWeight: 600, margin: "0 0 8px", color: "#6b7280" },
  muted: { fontSize: 13, color: "#9ca3af" },
  section: { marginBottom: 36 },
  summarySection: {
    background: "#f8fafc",
    borderRadius: 12,
    padding: 24,
    border: "1px solid #e2e8f0",
  },
  healthBar: { display: "flex", alignItems: "center", gap: 12, marginBottom: 20 },
  healthIndicator: { padding: "6px 16px", borderRadius: 20, display: "inline-flex", alignItems: "center" },
  healthText: { color: "#fff", fontWeight: 700, fontSize: 13 },
  healthDetail: { fontSize: 13, color: "#6b7280" },
  findingsList: { display: "flex", flexDirection: "column", gap: 8 },
  findingRow: { display: "flex", alignItems: "flex-start", gap: 10 },
  findingDot: { width: 8, height: 8, borderRadius: "50%", marginTop: 5, flexShrink: 0 },
  findingText: { fontSize: 14, color: "#374151", lineHeight: "1.5" },
  grid4: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 0 },
  grid2: { display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 24 },
  card: { background: "#f9fafb", borderRadius: 10, padding: 20, border: "1px solid #e5e7eb" },
  cardLabel: {
    display: "block", fontSize: 11, fontWeight: 600, color: "#6b7280",
    textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4,
  },
  cardValue: { display: "block", fontSize: 28, fontWeight: 700, color: "#111827" },
  tableWrap: { overflowX: "auto", borderRadius: 10, border: "1px solid #e5e7eb" },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th: {
    textAlign: "left", padding: "12px 14px", borderBottom: "2px solid #e5e7eb",
    fontWeight: 600, color: "#6b7280", fontSize: 11, textTransform: "uppercase",
    letterSpacing: "0.05em", background: "#f9fafb",
  },
  thRight: {
    textAlign: "right", padding: "12px 14px", borderBottom: "2px solid #e5e7eb",
    fontWeight: 600, color: "#6b7280", fontSize: 11, textTransform: "uppercase",
    letterSpacing: "0.05em", background: "#f9fafb",
  },
  td: { padding: "10px 14px", borderBottom: "1px solid #f3f4f6" },
  tdRight: { textAlign: "right", padding: "10px 14px", borderBottom: "1px solid #f3f4f6" },
  rowEven: { background: "#fafafa" },
  barWrap: { display: "flex", height: 20, borderRadius: 10, overflow: "hidden" },
  barGood: { background: "#22c55e", height: "100%" },
  barBad: { background: "#ef4444", height: "100%" },
};
