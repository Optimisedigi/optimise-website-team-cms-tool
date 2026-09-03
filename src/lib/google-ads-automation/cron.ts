/**
 * Daily poll of Google Ads `change_event` into `google-ads-automation-events`.
 *
 * change_event is only queryable for the trailing ~30 days, so this cron is
 * the feature, not an optimisation: whatever it does not persist is lost.
 *
 * Contract, mirroring src/lib/google-ads-snapshots/cron.ts:
 *   - up to `concurrency` (default 5) clients in parallel;
 *   - one client's failure never aborts the run;
 *   - the window is the last `WINDOW_DAYS` days, not one, so a skipped or
 *     failed run self-heals on the next day;
 *   - dedupe is on `resourceName`, which is stable per event, so re-running
 *     over an overlapping window creates nothing new.
 */

import { getPayload, type Payload, type RequiredDataFromCollectionSlug, type Where } from "payload";

import config from "@/payload.config";

import { fetchChangeEvents, type NormalisedChangeEvent } from "./fetch";
import { computeImpactForClient } from "./impact";
import { isGoogleAutomated, summariseChangeEvent } from "./summarise";

/** Overlapping look-back so one missed run self-heals. */
export const WINDOW_DAYS = 3;
const COLLECTION = "google-ads-automation-events";

export interface RunAutomationCronOptions {
  payload?: Payload;
  concurrency?: number;
  clientIds?: (string | number)[];
  now?: () => Date;
  /** Injected in tests so no network is required. */
  fetchEvents?: typeof fetchChangeEvents;
  /** Set false in tests that only exercise dedupe/window logic. */
  computeImpact?: boolean;
}

export interface AutomationCronClientResult {
  clientId: number;
  customerId: string;
  fetched: number;
  created: number;
  skippedExisting: number;
  impactComputed: number;
  error?: string;
}

export interface AutomationCronSummary {
  startedAt: string;
  finishedAt: string;
  startDay: string;
  endDay: string;
  clientsProcessed: number;
  clientsErrored: number;
  eventsCreated: number;
  perClient: AutomationCronClientResult[];
}

interface ClientDoc {
  id: number;
  googleAdsCustomerId?: string | null;
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Inclusive [startDay, endDay] covering today and the previous WINDOW_DAYS-1 days. */
export function cronWindow(now: Date, windowDays = WINDOW_DAYS): { startDay: string; endDay: string } {
  const end = new Date(now);
  const start = new Date(now);
  start.setUTCDate(start.getUTCDate() - (Math.max(1, windowDays) - 1));
  return { startDay: isoDay(start), endDay: isoDay(end) };
}

export function normaliseCustomerId(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const digits = raw.trim().replace(/-/g, "");
  return /^\d{10}$/.test(digits) ? digits : null;
}

/** The document body written for one change event. Exported for tests. */
export function buildEventDoc(
  clientId: number,
  customerId: string,
  event: NormalisedChangeEvent,
): RequiredDataFromCollectionSlug<"google-ads-automation-events"> {
  return {
    client: clientId,
    customerId,
    changeDateTime: event.changeDateTime,
    resourceName: event.resourceName,
    changeResourceType: event.changeResourceType,
    resourceChangeOperation: event.resourceChangeOperation,
    clientType: event.clientType,
    userEmail: event.userEmail,
    campaignId: event.campaignId || undefined,
    campaignName: event.campaignName || undefined,
    changedFields: event.changedFields,
    oldValues: event.oldValues,
    newValues: event.newValues,
    isGoogleAutomated: isGoogleAutomated(event.clientType),
    summary: summariseChangeEvent({
      changeResourceType: event.changeResourceType,
      resourceChangeOperation: event.resourceChangeOperation,
      clientType: event.clientType,
      campaignName: event.campaignName,
      changedFields: event.changedFields,
      oldValues: event.oldValues,
      newValues: event.newValues,
    }),
    reviewStatus: "unreviewed",
  };
}

async function processClient(
  payload: Payload,
  client: ClientDoc,
  customerId: string,
  window: { startDay: string; endDay: string },
  opts: RunAutomationCronOptions,
): Promise<AutomationCronClientResult> {
  const result: AutomationCronClientResult = {
    clientId: client.id,
    customerId,
    fetched: 0,
    created: 0,
    skippedExisting: 0,
    impactComputed: 0,
  };

  const fetcher = opts.fetchEvents ?? fetchChangeEvents;
  const fetched = await fetcher(customerId, window.startDay, window.endDay);
  if (!fetched.ok) {
    result.error = fetched.error || "fetch failed";
    return result;
  }
  result.fetched = fetched.events.length;

  if (fetched.events.length > 0) {
    // One query for the whole batch: which resourceNames do we already hold?
    const existing = await payload.find({
      collection: COLLECTION,
      where: { resourceName: { in: fetched.events.map((e) => e.resourceName) } } as Where,
      limit: fetched.events.length,
      depth: 0,
      pagination: false,
      overrideAccess: true,
    });
    const seen = new Set(
      (existing.docs as Array<{ resourceName?: string }>).map((d) => d.resourceName).filter(Boolean) as string[],
    );

    for (const event of fetched.events) {
      if (seen.has(event.resourceName)) {
        result.skippedExisting++;
        continue;
      }
      try {
        await payload.create({
          collection: COLLECTION,
          data: buildEventDoc(client.id, customerId, event),
          overrideAccess: true,
        });
        seen.add(event.resourceName);
        result.created++;
      } catch (err) {
        // A concurrent run can win the unique index race; that is a skip, not
        // a failure. Anything else is worth surfacing on the summary.
        const message = err instanceof Error ? err.message : String(err);
        if (/unique|constraint/i.test(message)) result.skippedExisting++;
        else result.error = message;
      }
    }
  }

  if (opts.computeImpact !== false) {
    try {
      result.impactComputed = await computeImpactForClient(payload, client.id, customerId, {
        now: opts.now?.() ?? new Date(),
      });
    } catch (err) {
      result.error = result.error || `impact: ${(err as Error).message}`;
    }
  }

  return result;
}

/** Run `tasks` with at most `concurrency` in flight, preserving input order. */
async function runPool<T>(tasks: Array<() => Promise<T>>, concurrency: number, onThrow: (err: unknown, index: number) => T): Promise<T[]> {
  const limit = Math.max(1, Math.floor(concurrency));
  const results = new Array<T>(tasks.length);
  let nextIndex = 0;
  async function worker(): Promise<void> {
    for (;;) {
      const i = nextIndex++;
      if (i >= tasks.length) return;
      try {
        results[i] = await tasks[i]();
      } catch (err) {
        results[i] = onThrow(err, i);
      }
    }
  }
  const workers: Promise<void>[] = [];
  for (let i = 0; i < Math.min(limit, tasks.length); i++) workers.push(worker());
  await Promise.all(workers);
  return results;
}

export async function runGoogleAdsAutomationCron(
  opts: RunAutomationCronOptions = {},
): Promise<AutomationCronSummary> {
  const now = opts.now ?? (() => new Date());
  const startedAt = now().toISOString();
  const window = cronWindow(now());

  const payload = opts.payload ?? (await getPayload({ config: await config }));

  const where: Where = { googleAdsCustomerId: { not_equals: null } };
  if (opts.clientIds && opts.clientIds.length > 0) where.id = { in: opts.clientIds };

  const clientsResult = await payload.find({
    collection: "clients",
    where,
    limit: 500,
    depth: 0,
    overrideAccess: true,
  });

  const eligible = (clientsResult.docs as unknown as ClientDoc[])
    .map((client) => ({ client, customerId: normaliseCustomerId(client.googleAdsCustomerId) }))
    .filter((entry): entry is { client: ClientDoc; customerId: string } => entry.customerId !== null);

  const perClient = await runPool(
    eligible.map(({ client, customerId }) => () => processClient(payload, client, customerId, window, opts)),
    opts.concurrency ?? 5,
    (err, index) => ({
      clientId: eligible[index].client.id,
      customerId: eligible[index].customerId,
      fetched: 0,
      created: 0,
      skippedExisting: 0,
      impactComputed: 0,
      error: `client task threw: ${err instanceof Error ? err.message : String(err)}`,
    }),
  );

  return {
    startedAt,
    finishedAt: now().toISOString(),
    startDay: window.startDay,
    endDay: window.endDay,
    clientsProcessed: perClient.length,
    clientsErrored: perClient.filter((r) => r.error).length,
    eventsCreated: perClient.reduce((sum, r) => sum + r.created, 0),
    perClient,
  };
}
