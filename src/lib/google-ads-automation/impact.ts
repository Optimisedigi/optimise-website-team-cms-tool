/**
 * Spend/conversion impact for a Google-made change: the affected campaign's
 * 7 days before the change vs the 7 days after.
 *
 * The plan called for reading this from `google-ads-snapshots`, but that
 * collection holds one 30-day *total* row per (client, level) — there are no
 * daily rows to slice a before/after window from. So this reads the same
 * per-day campaign metrics endpoint the Google Ads change tracker already
 * uses (`campaign-budgets/get-metrics` with `segment=day`), one request per
 * client per cron run, and slices locally. No per-event API calls.
 *
 * Impact is only computed once a change is at least 7 days old, so the "after"
 * window is complete. The daily cron backfills naturally as events age.
 */

import type { Payload, Where } from "payload";

const COLLECTION = "google-ads-automation-events";
const FETCH_TIMEOUT_MS = 60_000;
export const IMPACT_WINDOW_DAYS = 7;
/** Only look back this far for events still missing an impact figure. */
const MAX_EVENT_AGE_DAYS = 45;

export interface DailyCampaignMetric {
  date: string;
  campaignId: string;
  cost: number;
  conversions: number;
}

function num(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function shiftDays(day: string, delta: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return isoDay(date);
}

/** Flatten the Growth Tools day-segmented campaign metrics response. */
export function normaliseDailyMetrics(payload: unknown): DailyCampaignMetric[] {
  const rows = Array.isArray((payload as { metrics?: unknown })?.metrics)
    ? ((payload as { metrics: unknown[] }).metrics)
    : [];
  const out: DailyCampaignMetric[] = [];
  for (const raw of rows) {
    const row = raw as Record<string, unknown>;
    const segment = (row.segment ?? {}) as Record<string, unknown>;
    const date = String(segment.date ?? segment.day ?? "").slice(0, 10);
    if (!date) continue;
    out.push({
      date,
      campaignId: String(row.campaignId ?? ""),
      cost: num(row.cost ?? row.spend),
      conversions: num(row.conversions),
    });
  }
  return out;
}

/**
 * Sum cost/conversions for one campaign over [startDay, endDay] inclusive.
 * Exported so the windowing is unit-testable without a network.
 */
export function sumWindow(
  metrics: DailyCampaignMetric[],
  campaignId: string,
  startDay: string,
  endDay: string,
): { spend: number; conversions: number } {
  let spend = 0;
  let conversions = 0;
  for (const row of metrics) {
    if (row.campaignId !== campaignId) continue;
    if (row.date < startDay || row.date > endDay) continue;
    spend += row.cost;
    conversions += row.conversions;
  }
  return { spend: Math.round(spend * 100) / 100, conversions: Math.round(conversions * 100) / 100 };
}

async function fetchDailyMetrics(
  customerId: string,
  startDay: string,
  endDay: string,
  fetchImpl: typeof fetch,
): Promise<DailyCampaignMetric[]> {
  const baseUrl = (process.env.GROWTH_TOOLS_URL ?? "").replace(/\/$/, "");
  const apiKey = process.env.INTERNAL_API_KEY ?? "";
  if (!baseUrl || !apiKey) return [];
  const params = new URLSearchParams({
    customerId,
    dateRange: `${startDay},${endDay}`,
    segment: "day",
  });
  const response = await fetchImpl(`${baseUrl}/api/google-ads/campaign-budgets/get-metrics?${params}`, {
    headers: { "x-internal-key": apiKey },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    cache: "no-store",
  });
  if (!response.ok) return [];
  return normaliseDailyMetrics(await response.json());
}

/**
 * Fill in `impact` for this client's events that are old enough to have a
 * complete "after" window and don't have one yet. Returns how many were
 * updated. One upstream request per client, regardless of event count.
 */
export async function computeImpactForClient(
  payload: Payload,
  clientId: number,
  customerId: string,
  opts: { now?: Date; fetchImpl?: typeof fetch } = {},
): Promise<number> {
  const now = opts.now ?? new Date();
  const newestEligibleDay = shiftDays(isoDay(now), -IMPACT_WINDOW_DAYS);
  const oldestEligibleDay = shiftDays(isoDay(now), -MAX_EVENT_AGE_DAYS);

  const pending = await payload.find({
    collection: COLLECTION,
    where: {
      and: [
        { client: { equals: clientId } },
        { "impact.computedAt": { equals: null } },
        { changeDateTime: { less_than: `${newestEligibleDay} 23:59:59` } },
        { changeDateTime: { greater_than: `${oldestEligibleDay} 00:00:00` } },
        { campaignId: { not_equals: null } },
      ],
    } as Where,
    limit: 200,
    depth: 0,
    overrideAccess: true,
  });

  const docs = pending.docs as Array<{ id: number; campaignId?: string | null; changeDateTime?: string | null }>;
  const withCampaign = docs.filter((d) => d.campaignId && d.changeDateTime);
  if (withCampaign.length === 0) return 0;

  const days = withCampaign.map((d) => String(d.changeDateTime).slice(0, 10)).sort();
  const metrics = await fetchDailyMetrics(
    customerId,
    shiftDays(days[0], -IMPACT_WINDOW_DAYS),
    shiftDays(days[days.length - 1], IMPACT_WINDOW_DAYS),
    opts.fetchImpl ?? fetch,
  );
  if (metrics.length === 0) return 0;

  let updated = 0;
  for (const doc of withCampaign) {
    const changeDay = String(doc.changeDateTime).slice(0, 10);
    const before = sumWindow(metrics, doc.campaignId!, shiftDays(changeDay, -IMPACT_WINDOW_DAYS), shiftDays(changeDay, -1));
    const after = sumWindow(metrics, doc.campaignId!, changeDay, shiftDays(changeDay, IMPACT_WINDOW_DAYS - 1));
    try {
      await payload.update({
        collection: COLLECTION,
        id: doc.id,
        data: {
          impact: {
            spendBefore: before.spend,
            spendAfter: after.spend,
            convBefore: before.conversions,
            convAfter: after.conversions,
            computedAt: now.toISOString(),
          },
        },
        overrideAccess: true,
      });
      updated++;
    } catch (err) {
      console.error("[google-ads-automation] impact update failed", doc.id, (err as Error).message);
    }
  }
  return updated;
}
