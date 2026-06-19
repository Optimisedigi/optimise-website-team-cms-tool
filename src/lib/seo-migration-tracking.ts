import { getPayload } from "payload";
import config from "@/payload.config";
import sgMail from "@sendgrid/mail";
import { parseBrandTerms } from "@/lib/brand-terms";
import { fetchDailyBrandedAnalytics, fetchDailySearchAnalytics, refreshAccessToken, type DailySearchAnalyticsRow } from "@/lib/gsc-service";
import { GSC_LAG_DAYS, type CheckPhase, type ChecklistItem, type MigrationAction, type PerformanceDelta } from "@/lib/seo-migration-check";
import { buildSeoMigrationReportEmail } from "@/lib/seo-migration-report-email";

export const POST_MIGRATION_EMAIL_MILESTONES = [1, 2, 3, 7, 10, 14, 21, 30] as const;
export const GSC_DATA_LAG_DAYS = GSC_LAG_DAYS;
export const PRE_MIGRATION_CHART_DAYS = 14;

export type TrackingSeverity = "critical" | "warning" | "advisory" | "healthy";

export interface PostMigrationTrackingSnapshot {
  date: string;
  daysSinceCutover: number;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  brandClicks: number | null;
  brandImpressions: number | null;
  genericClicks: number | null;
  genericImpressions: number | null;
  sourceLagged: boolean;
  dataComplete: boolean;
}

export interface PostMigrationTrackingFlag {
  severity: TrackingSeverity;
  phase: CheckPhase | "tracking";
  metric: string;
  title: string;
  description: string;
  observedDate?: string;
  daysSinceCutover?: number;
  recommendation?: string;
}

export type TrackingIssueReport = Record<CheckPhase, string[]>;

const PHASES: CheckPhase[] = ["redirects", "indexing", "performance", "technical", "process"];

function isValidIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime());
}

function minDate(a: string, b: string): string {
  return a <= b ? a : b;
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function dateOnly(value: string | Date): Date {
  const d = value instanceof Date ? new Date(value) : new Date(`${String(value).slice(0, 10)}T00:00:00Z`);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export function addDays(value: string | Date, days: number): string {
  const d = dateOnly(value);
  d.setUTCDate(d.getUTCDate() + days);
  return isoDate(d);
}

export function daysSinceCutover(cutoverDate: string, now: Date = new Date()): number {
  const cutover = dateOnly(cutoverDate).getTime();
  const today = dateOnly(now).getTime();
  const diff = Math.floor((today - cutover) / 86400000);
  return diff >= 0 ? diff + 1 : diff;
}

export function getAvailableGscEndDate(now: Date = new Date()): string {
  return addDays(now, -GSC_DATA_LAG_DAYS);
}

export function getDueMilestoneDay(cutoverDate: string, now: Date = new Date(), alreadySent?: number | null): number | null {
  const elapsed = daysSinceCutover(cutoverDate, now);
  const sent = alreadySent ?? 0;
  const due = POST_MIGRATION_EMAIL_MILESTONES.filter((day) => day <= elapsed && day > sent);
  return due.length ? due[due.length - 1] : null;
}

function rowMap(rows: DailySearchAnalyticsRow[] | null | undefined): Map<string, DailySearchAnalyticsRow> {
  return new Map((rows || []).map((row) => [row.date, row]));
}

export function buildPostMigrationTrackingSnapshots(input: {
  cutoverDate: string;
  startDate?: string;
  availableEndDate: string;
  overall: DailySearchAnalyticsRow[];
  brand?: DailySearchAnalyticsRow[] | null;
  nonBrand?: DailySearchAnalyticsRow[] | null;
  now?: Date;
}): PostMigrationTrackingSnapshot[] {
  const brandByDate = rowMap(input.brand);
  const genericByDate = rowMap(input.nonBrand);
  const overallByDate = rowMap(input.overall);
  const todayLaggedEnd = getAvailableGscEndDate(input.now ?? new Date());
  const startDate = input.startDate || input.cutoverDate;
  if (!isValidIsoDate(input.cutoverDate) || !isValidIsoDate(startDate) || !isValidIsoDate(input.availableEndDate) || input.availableEndDate < startDate) {
    return [];
  }
  const out: PostMigrationTrackingSnapshot[] = [];
  for (let date = startDate; date <= input.availableEndDate; date = addDays(date, 1)) {
    const row = overallByDate.get(date) || { date, clicks: 0, impressions: 0, ctr: 0, position: 0 };
    const brand = brandByDate.get(date);
    const generic = genericByDate.get(date);
    out.push({
      date,
      daysSinceCutover: daysSinceCutover(input.cutoverDate, dateOnly(date)),
      clicks: row.clicks,
      impressions: row.impressions,
      ctr: row.ctr,
      position: row.position,
      brandClicks: brand?.clicks ?? null,
      brandImpressions: brand?.impressions ?? null,
      genericClicks: generic?.clicks ?? null,
      genericImpressions: generic?.impressions ?? null,
      sourceLagged: date > todayLaggedEnd,
      dataComplete: date <= todayLaggedEnd,
    });
  }
  return out;
}

function pctChange(current: number, baseline: number): number | null {
  if (!baseline) return null;
  return Math.round(((current - baseline) / baseline) * 1000) / 10;
}

function cumulative(snapshots: PostMigrationTrackingSnapshot[]) {
  const postMigration = snapshots.filter((row) => row.daysSinceCutover >= 1);
  const clicks = postMigration.reduce((sum, row) => sum + row.clicks, 0);
  const impressions = postMigration.reduce((sum, row) => sum + row.impressions, 0);
  return { clicks, impressions };
}

export function buildPostMigrationFlags(input: {
  snapshots: PostMigrationTrackingSnapshot[];
  performance?: PerformanceDelta | null;
  hasBrandTerms: boolean;
  now?: Date;
}): PostMigrationTrackingFlag[] {
  const flags: PostMigrationTrackingFlag[] = [];
  const latest = input.snapshots[input.snapshots.length - 1];
  const perf = input.performance;
  if (latest && perf?.before?.clicks && perf.windowDays) {
    const postMigration = input.snapshots.filter((row) => row.daysSinceCutover >= 1);
    const comparable = postMigration.slice(0, Math.min(postMigration.length, perf.windowDays));
    const current = cumulative(comparable);
    const clickChange = pctChange(current.clicks, perf.before.clicks);
    const impressionChange = pctChange(current.impressions, perf.before.impressions);
    for (const [metric, change] of [["clicks", clickChange], ["impressions", impressionChange]] as const) {
      if (change == null || change >= -20) continue;
      const severe = change <= -30 && latest.daysSinceCutover >= 7;
      flags.push({
        severity: severe ? "critical" : "warning",
        phase: "performance",
        metric,
        title: `${metric[0].toUpperCase()}${metric.slice(1)} down ${Math.abs(change)}% vs baseline`,
        description: `Post-migration ${metric} are ${Math.abs(change)}% below the matched pre-cutover window using the latest available GSC data.`,
        observedDate: latest.date,
        daysSinceCutover: latest.daysSinceCutover,
        recommendation: "Check redirect mapping, page/query losers, crawl/indexing status, and whether the affected traffic is brand or generic.",
      });
    }
  }
  if (!input.hasBrandTerms) {
    flags.push({
      severity: "advisory",
      phase: "performance",
      metric: "brand-generic",
      title: "Brand/generic split unavailable",
      description: "No client brand keywords are configured, so the report shows total GSC traffic only.",
      recommendation: "Add brand keywords on the client record to enable brand vs generic migration tracking.",
    });
  }
  if (!latest || latest.date < getAvailableGscEndDate(input.now ?? new Date())) {
    flags.push({
      severity: "advisory",
      phase: "tracking",
      metric: "gsc-lag",
      title: "Latest GSC data is still pending",
      description: "Search Console normally finalises data a few days late; fresh milestone emails label the latest available date.",
    });
  }
  return flags;
}

export function buildChecklistIssueReport(input: {
  checklist?: ChecklistItem[] | null;
  actions?: MigrationAction[] | null;
  flags?: PostMigrationTrackingFlag[];
  performance?: PerformanceDelta | null;
}): TrackingIssueReport {
  const report: TrackingIssueReport = { redirects: [], indexing: [], performance: [], technical: [], process: [] };
  for (const item of input.checklist || []) {
    if (!["fail", "warn", "advisory"].includes(item.status)) continue;
    const detail = item.details?.slice(0, 3).join("; ");
    const parts = [`${item.status.toUpperCase()}: ${item.title}`, item.evidence];
    if (item.recommendation) parts.push(`Action: ${item.recommendation}`);
    if (detail) parts.push(`Examples: ${detail}`);
    report[item.phase].push(parts.join(" — "));
  }
  for (const flag of input.flags || []) {
    const phase = flag.phase === "tracking" ? "performance" : flag.phase;
    report[phase].push(`${flag.severity.toUpperCase()}: ${flag.title} — ${flag.description}${flag.recommendation ? ` Action: ${flag.recommendation}` : ""}`);
  }
  if (input.performance?.pageLosers?.length) {
    report.performance.push(`Top page losers: ${input.performance.pageLosers.slice(0, 5).map((p) => `${p.page} (${p.clicksDelta})`).join("; ")}`);
  }
  if (input.performance?.queryLosers?.length) {
    report.performance.push(`Top query losers: ${input.performance.queryLosers.slice(0, 5).map((q) => `${q.query} (${q.clicksDelta})`).join("; ")}`);
  }
  for (const action of input.actions || []) {
    const title = action.title.toLowerCase();
    const phase: CheckPhase = title.includes("redirect")
      ? "redirects"
      : title.includes("404") || title.includes("index") || title.includes("crawl") || title.includes("sitemap") || title.includes("robots")
        ? "indexing"
        : title.includes("click") || title.includes("traffic") || title.includes("query") || title.includes("page")
          ? "performance"
          : title.includes("core web") || title.includes("schema") || title.includes("canonical") || title.includes("metadata")
            ? "technical"
            : "process";
    report[phase].push(`${action.priority.toUpperCase()} action: ${action.title}${action.detail ? ` — ${action.detail}` : ""}`);
  }
  return report;
}

export function buildMilestoneReport(input: {
  milestoneDay: number | null;
  snapshots: PostMigrationTrackingSnapshot[];
  flags: PostMigrationTrackingFlag[];
  issueReport: TrackingIssueReport;
  performance?: PerformanceDelta | null;
}) {
  const latest = input.snapshots[input.snapshots.length - 1] || null;
  const totals = cumulative(input.snapshots);
  const baselineClicksChange = input.performance?.before?.clicks ? pctChange(totals.clicks, input.performance.before.clicks) : null;
  const baselineImpressionsChange = input.performance?.before?.impressions ? pctChange(totals.impressions, input.performance.before.impressions) : null;
  return { ...input, latest, totals, baselineClicksChange, baselineImpressionsChange };
}

function recipientsFrom(value?: string | null): string[] {
  const source = value || process.env.ALERT_EMAIL_TO || "";
  return source.split(/[\n,]+/).map((item) => item.trim()).filter(Boolean);
}

function adminUrl(reviewId: string | number): string {
  const base = process.env.NEXT_PUBLIC_SERVER_URL || process.env.PAYLOAD_PUBLIC_SERVER_URL || "";
  return `${base}/admin/collections/seo-migration-checks/${reviewId}`;
}

export async function processSeoMigrationTracking(options: { reviewId?: string | number; limit?: number; sendEmails?: boolean } = {}) {
  const payload = await getPayload({ config: await config });
  const where: any = options.reviewId
    ? { id: { equals: options.reviewId } }
    : { and: [{ status: { equals: "completed" } }, { trackingEnabled: { not_equals: false } }, { trackingStatus: { not_equals: "paused" } }, { trackingStatus: { not_equals: "complete" } }] };
  const reviews = await payload.find({ collection: "seo-migration-checks", where, limit: options.limit ?? 10, depth: 1, overrideAccess: true });
  const results = [];

  for (const review of reviews.docs as any[]) {
    try {
      const client = typeof review.client === "object" ? review.client : await payload.findByID({ collection: "clients", id: review.client, overrideAccess: true });
      let accessToken = client.gscAccessToken || "";
      if (!accessToken || (client.gscTokenExpiry && new Date(client.gscTokenExpiry) <= new Date())) {
        if (!client.gscRefreshToken) throw new Error("Missing GSC refresh token");
        const refreshed = await refreshAccessToken(client.gscRefreshToken);
        accessToken = refreshed.accessToken;
        await payload.update({ collection: "clients", id: client.id, data: { gscAccessToken: accessToken, gscTokenExpiry: refreshed.expiry }, overrideAccess: true });
      }
      const siteUrl = review.siteUrl || client.gscPropertyUrl;
      if (!siteUrl) throw new Error("Missing GSC property URL");
      const availableEndDate = getAvailableGscEndDate();
      const fetchStartDate = addDays(review.cutoverDate, -PRE_MIGRATION_CHART_DAYS);
      const fetchEndDate = minDate(availableEndDate, addDays(review.cutoverDate, 60));
      const hasAvailableRange = isValidIsoDate(review.cutoverDate) && fetchEndDate >= fetchStartDate;
      const overall = hasAvailableRange ? await fetchDailySearchAnalytics(accessToken, siteUrl, fetchStartDate, fetchEndDate) : [];
      const brandTerms = parseBrandTerms(client.brandKeywords);
      const branded = brandTerms.length && hasAvailableRange
        ? await fetchDailyBrandedAnalytics(accessToken, siteUrl, fetchStartDate, fetchEndDate, brandTerms)
        : { brand: null, nonBrand: null };
      const snapshots = buildPostMigrationTrackingSnapshots({ cutoverDate: review.cutoverDate, startDate: fetchStartDate, availableEndDate: fetchEndDate, overall, brand: branded.brand, nonBrand: branded.nonBrand });
      const flags = buildPostMigrationFlags({ snapshots, performance: review.performance, hasBrandTerms: brandTerms.length > 0 });
      const issueReport = buildChecklistIssueReport({ checklist: review.checklist, actions: review.actions, flags, performance: review.performance });
      const dueMilestone = getDueMilestoneDay(review.cutoverDate, new Date(), review.lastEmailMilestoneDay);
      const nextMilestone = POST_MIGRATION_EMAIL_MILESTONES.find((day) => day > (dueMilestone ?? review.lastEmailMilestoneDay ?? 0)) ?? null;
      const updateData: Record<string, unknown> = {
        trackingSnapshots: snapshots,
        trackingFlags: flags,
        trackingIssueReport: issueReport,
        trackingSchedule: { milestones: POST_MIGRATION_EMAIL_MILESTONES, gscDataLagDays: GSC_DATA_LAG_DAYS, latestAvailableDate: availableEndDate },
        lastTrackingRunAt: new Date().toISOString(),
        nextEmailMilestoneDay: nextMilestone,
      };
      if (!['complete', 'failed'].includes(review.trackingStatus)) {
        updateData.trackingStatus = 'active';
      }

      if (dueMilestone && options.sendEmails === true && process.env.SENDGRID_API_KEY && process.env.ALERT_EMAIL_FROM) {
        const to = recipientsFrom(review.emailRecipients);
        if (to.length) {
          sgMail.setApiKey(process.env.SENDGRID_API_KEY);
          const milestoneReport = buildMilestoneReport({ milestoneDay: dueMilestone, snapshots, flags, issueReport, performance: review.performance });
          const email = buildSeoMigrationReportEmail({
            clientName: client.name || "Client",
            siteUrl,
            cutoverDate: review.cutoverDate,
            overallScore: review.overallScore ?? null,
            milestoneDay: dueMilestone,
            adminUrl: adminUrl(review.id),
            trackingNotes: review.trackingNotes ?? null,
            report: milestoneReport,
          });
          await sgMail.send({ from: process.env.ALERT_EMAIL_FROM, to, subject: email.subject, html: email.html, text: email.text });
          updateData.lastEmailSentAt = new Date().toISOString();
          updateData.lastEmailMilestoneDay = dueMilestone;
          if (dueMilestone === 30) updateData.trackingStatus = "complete";
        }
      }

      await payload.update({ collection: "seo-migration-checks", id: review.id, data: updateData, overrideAccess: true });
      results.push({ id: review.id, ok: true, dueMilestone, snapshots: snapshots.length, flags: flags.length });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Tracking failed";
      await payload.update({ collection: "seo-migration-checks", id: review.id, data: { trackingStatus: "failed", error: message, lastTrackingRunAt: new Date().toISOString() }, overrideAccess: true }).catch(() => {});
      results.push({ id: review.id, ok: false, error: message });
    }
  }
  return results;
}
