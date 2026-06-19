import type { buildMilestoneReport } from "@/lib/seo-migration-tracking";

type MilestoneReport = ReturnType<typeof buildMilestoneReport>;

export interface SeoMigrationReportEmailInput {
  clientName: string;
  siteUrl: string;
  cutoverDate: string;
  overallScore: number | null;
  milestoneDay: number;
  adminUrl: string;
  trackingNotes?: string | null;
  report: MilestoneReport;
}

function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function n(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "-";
  return Math.round(value).toLocaleString("en-AU");
}

function pct(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "-";
  return `${value > 0 ? "+" : ""}${value}%`;
}

function health(report: MilestoneReport): "critical" | "warning" | "healthy" {
  if (report.flags.some((flag) => flag.severity === "critical")) return "critical";
  if (report.flags.some((flag) => flag.severity === "warning")) return "warning";
  return "healthy";
}

function bar(widthPct: number, color: string): string {
  return `<div style="height:10px;width:${Math.max(2, Math.min(100, widthPct))}%;background:${color};border-radius:999px;"></div>`;
}

function miniChart(report: MilestoneReport): string {
  const rows = report.snapshots;
  const maxClicks = Math.max(1, ...rows.map((row) => row.clicks));
  const maxImpressions = Math.max(1, ...rows.map((row) => row.impressions));
  if (!rows.length) return `<p style="color:#64748b;">GSC daily data is still pending.</p>`;
  return `<table style="width:100%;border-collapse:collapse;font-size:12px;">
    <thead><tr><th align="left">Date</th><th align="left">Clicks</th><th align="left">Impressions</th></tr></thead>
    <tbody>${rows.map((row) => `<tr>
      <td style="padding:6px 8px 6px 0;color:#475569;white-space:nowrap;">${esc(row.date)}${row.daysSinceCutover === 1 ? " · migration" : row.daysSinceCutover < 1 ? ` · ${row.daysSinceCutover}d` : ""}</td>
      <td style="padding:6px 8px;min-width:130px;">${bar((row.clicks / maxClicks) * 100, "#2563eb")}<span style="color:#334155;">${n(row.clicks)}</span></td>
      <td style="padding:6px 0;min-width:130px;">${bar((row.impressions / maxImpressions) * 100, "#8b5cf6")}<span style="color:#334155;">${n(row.impressions)}</span></td>
    </tr>`).join("")}</tbody>
  </table>`;
}

function compactMetric(value: number, max: number, color: string): string {
  const width = Math.max(4, Math.min(100, (value / Math.max(1, max)) * 100));
  return `<div style="display:flex;align-items:center;gap:5px;white-space:nowrap;"><span style="display:inline-block;min-width:34px;text-align:right;color:#334155;font-variant-numeric:tabular-nums;">${n(value)}</span><span style="display:inline-block;height:7px;width:${width}%;max-width:72px;background:${color};border-radius:999px;"></span></div>`;
}

function brandGenericTable(report: MilestoneReport): string {
  const rows = report.snapshots;
  const maxClicks = Math.max(1, ...rows.flatMap((row) => [row.brandClicks ?? 0, row.genericClicks ?? 0]));
  const maxImpressions = Math.max(1, ...rows.flatMap((row) => [row.brandImpressions ?? 0, row.genericImpressions ?? 0]));
  if (!rows.length) return `<p style="color:#64748b;">Brand/generic data is still pending.</p>`;
  return `<table style="width:100%;border-collapse:collapse;font-size:11px;">
    <thead><tr><th align="left">Date</th><th align="left">Brand clicks</th><th align="left">Generic clicks</th><th align="left">Brand impr.</th><th align="left">Generic impr.</th><th align="right">Impr. share</th></tr></thead>
    <tbody>${rows.map((row) => {
      const brandClicks = row.brandClicks ?? 0;
      const genericClicks = row.genericClicks ?? 0;
      const brandImpressions = row.brandImpressions ?? 0;
      const genericImpressions = row.genericImpressions ?? 0;
      const totalImpressions = Math.max(1, brandImpressions + genericImpressions);
      return `<tr>
        <td style="padding:4px 6px 4px 0;color:#475569;white-space:nowrap;">${esc(row.date)}${row.daysSinceCutover === 1 ? " · migration" : row.daysSinceCutover < 1 ? ` · ${row.daysSinceCutover}d` : ` · +${row.daysSinceCutover - 1}d`}</td>
        <td style="padding:4px 6px;min-width:86px;">${compactMetric(brandClicks, maxClicks, "#0ea5e9")}</td>
        <td style="padding:4px 6px;min-width:86px;">${compactMetric(genericClicks, maxClicks, "#22c55e")}</td>
        <td style="padding:4px 6px;min-width:86px;">${compactMetric(brandImpressions, maxImpressions, "#38bdf8")}</td>
        <td style="padding:4px 6px;min-width:86px;">${compactMetric(genericImpressions, maxImpressions, "#86efac")}</td>
        <td align="right" style="padding:4px 0;color:#64748b;white-space:nowrap;">${Math.round((brandImpressions / totalImpressions) * 100)}% / ${Math.round((genericImpressions / totalImpressions) * 100)}%</td>
      </tr>`;
    }).join("")}</tbody>
  </table>`;
}

function issueHtml(report: MilestoneReport): string {
  const labels: Record<string, string> = {
    redirects: "Redirects",
    indexing: "Indexing & Crawl",
    performance: "Organic Performance",
    technical: "Technical",
    process: "Process",
  };
  return Object.entries(labels).map(([phase, label]) => {
    const bullets = report.issueReport[phase as keyof typeof report.issueReport] || [];
    const items = bullets.length ? bullets.slice(0, 6).map((item) => `<li>${esc(item)}</li>`).join("") : `<li>No urgent issues currently flagged.</li>`;
    return `<h3 style="margin:18px 0 6px;color:#0f172a;">${label}</h3><ul style="margin-top:0;padding-left:20px;color:#334155;">${items}</ul>`;
  }).join("");
}

export function buildSeoMigrationReportEmail(input: SeoMigrationReportEmailInput) {
  const status = health(input.report);
  const latest = input.report.latest;
  const latestBrand = latest?.brandClicks ?? null;
  const latestGeneric = latest?.genericClicks ?? null;
  const subject = `Post-migration SEO day ${input.milestoneDay} — ${input.clientName} — ${status}`;
  const text = [
    subject,
    "",
    `Site: ${input.siteUrl}`,
    `Cutover: ${input.cutoverDate}`,
    `Latest GSC date: ${latest?.date || "pending"}`,
    `Health score: ${input.overallScore ?? "-"}`,
    `Clicks since migration: ${n(input.report.totals.clicks)} (${pct(input.report.baselineClicksChange)} vs baseline)`,
    `Impressions since migration: ${n(input.report.totals.impressions)} (${pct(input.report.baselineImpressionsChange)} vs baseline)`,
    `Latest brand/generic clicks: ${n(latestBrand)} / ${n(latestGeneric)}`,
    ...(input.trackingNotes ? ["", `Comment: ${input.trackingNotes}`] : []),
    "",
    "Potential issues:",
    ...input.report.flags.map((flag) => `- [${flag.severity}] ${flag.title}: ${flag.description}`),
    "",
    "Bullet-point report:",
    ...Object.entries(input.report.issueReport).flatMap(([phase, bullets]) => [`${phase}:`, ...bullets.map((b) => `- ${b}`)]),
    "",
    `Open full report: ${input.adminUrl}`,
  ].join("\n");

  const html = `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#0f172a;line-height:1.5;max-width:760px;">
    <h2 style="margin-bottom:4px;">${esc(subject)}</h2>
    <p style="color:#64748b;margin-top:0;">${esc(input.siteUrl)} · cutover ${esc(input.cutoverDate)} · latest GSC date ${esc(latest?.date || "pending")}</p>
    ${input.trackingNotes ? `<div style="border:1px solid #bfdbfe;border-radius:12px;background:#eff6ff;color:#1e3a8a;padding:12px;margin:14px 0;"><strong>Comment:</strong> ${esc(input.trackingNotes)}</div>` : ""}
    <div style="display:block;border:1px solid #e2e8f0;border-radius:14px;padding:14px;background:#f8fafc;margin:16px 0;">
      <strong>Visual snapshot</strong>
      <p style="margin:4px 0 10px;color:#64748b;font-size:12px;">Shows 14 days before migration, then extends to each milestone day as the report progresses.</p>
      ${miniChart(input.report)}
    </div>
    <div style="display:block;border:1px solid #e2e8f0;border-radius:14px;padding:14px;background:#f8fafc;margin:16px 0;">
      <strong>Brand vs generic bar table</strong>
      <p style="margin:4px 0 10px;color:#64748b;font-size:12px;">Uses the client brand terms configured in the CMS.</p>
      ${brandGenericTable(input.report)}
    </div>
    <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px;">
      <tr><td style="padding:8px;border:1px solid #e2e8f0;">Health score</td><td style="padding:8px;border:1px solid #e2e8f0;"><strong>${esc(input.overallScore ?? "-")}</strong></td></tr>
      <tr><td style="padding:8px;border:1px solid #e2e8f0;">Clicks since migration</td><td style="padding:8px;border:1px solid #e2e8f0;">${n(input.report.totals.clicks)} (${pct(input.report.baselineClicksChange)} vs baseline)</td></tr>
      <tr><td style="padding:8px;border:1px solid #e2e8f0;">Impressions since migration</td><td style="padding:8px;border:1px solid #e2e8f0;">${n(input.report.totals.impressions)} (${pct(input.report.baselineImpressionsChange)} vs baseline)</td></tr>
      <tr><td style="padding:8px;border:1px solid #e2e8f0;">Latest brand/generic clicks</td><td style="padding:8px;border:1px solid #e2e8f0;">${n(latestBrand)} / ${n(latestGeneric)}</td></tr>
    </table>
    <h3>Potential issues</h3>
    <ul>${input.report.flags.length ? input.report.flags.map((flag) => `<li><strong>${esc(flag.severity.toUpperCase())}</strong>: ${esc(flag.title)} — ${esc(flag.description)}</li>`).join("") : "<li>No current traffic-drop flags.</li>"}</ul>
    ${issueHtml(input.report)}
    <p><a href="${esc(input.adminUrl)}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;font-weight:bold;">Open full report in CMS</a></p>
  </body></html>`;

  return { subject, html, text };
}
