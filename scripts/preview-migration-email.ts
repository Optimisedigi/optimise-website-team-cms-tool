/**
 * One-off: render the SEO migration milestone email from the live We Can Quit
 * review data so we can visually verify formatting changes before deploy.
 * Run: node --env-file=.env --import tsx scripts/preview-migration-email.ts
 */
import { writeFileSync } from "fs";
import { createClient } from "@libsql/client";
import { buildMilestoneReport } from "../src/lib/seo-migration-tracking";
import { buildSeoMigrationReportEmail } from "../src/lib/seo-migration-report-email";

const unq = (s: string | undefined) => (s || "").trim().replace(/^["']|["']$/g, "");

async function main() {
  const client = createClient({
    url: unq(process.env.DATABASE_URL),
    authToken: unq(process.env.DATABASE_AUTH_TOKEN),
  });
  const res = await client.execute(
    "SELECT title, site_url, cutover_date, overall_score, tracking_snapshots, tracking_flags, tracking_issue_report, last_email_milestone_day FROM seo_migration_checks WHERE id=1",
  );
  const row = res.rows[0] as Record<string, unknown>;
  const snapshots = JSON.parse((row.tracking_snapshots as string) || "[]");
  const flags = JSON.parse((row.tracking_flags as string) || "[]");
  const issueReport = JSON.parse((row.tracking_issue_report as string) || "{}");
  const milestoneDay = Number(row.last_email_milestone_day) || 21;

  const report = buildMilestoneReport({ milestoneDay, snapshots, flags, issueReport, performance: null });
  const email = buildSeoMigrationReportEmail({
    clientName: "We Can Quit",
    siteUrl: String(row.site_url),
    cutoverDate: String(row.cutover_date),
    overallScore: row.overall_score == null ? null : Number(row.overall_score),
    milestoneDay,
    adminUrl: "https://cms.optimisedigital.online/admin/collections/seo-migration-checks/1",
    trackingNotes: "Preview render from live We Can Quit tracking data.",
    report,
  });

  const out = ".gg/seo-migration-we-can-quit-email-preview.html";
  writeFileSync(out, email.html);
  console.log(`Wrote ${out} (${snapshots.length} snapshots, milestone day ${milestoneDay})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
