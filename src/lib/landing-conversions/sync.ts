/**
 * Server-side Google Ads conversions for landing-page leads.
 *
 * Why: the browser Google Ads tag is blocked for roughly a quarter of ad
 * sessions (GA4 saw 77% of the landing pages' paid sessions, 14 Sep–5 Oct
 * 2026), so leads such as the 4 Oct paid booking reached HubSpot and
 * `landing_events` but never Google Ads. The event log keeps the click ID
 * regardless of blockers, so this job replays accepted leads to Google via
 * the Growth Tools Data Manager route.
 *
 * Contract:
 *   - one conversion per ad click: the transaction ID is derived from the
 *     click ID, and Google dedupes on it, so form + booking + chat from the
 *     same click count once, and re-running the window creates nothing new;
 *   - every attempt is recorded in `landing-conversion-uploads` so a lead is
 *     never sent twice from here, and skips (no click ID) are visible;
 *   - the window overlaps (default 7 days) so a missed run self-heals, bounded
 *     by Google's 90-day click lookback;
 *   - one property's failure never aborts the run.
 *
 * Click IDs only. No email, phone or name leaves this module.
 */

import { createHash } from "node:crypto";
import { getPayload, type Payload } from "payload";
import { sql } from "@payloadcms/db-sqlite";

import config from "@/payload.config";
import { LEAD_SQL_PREDICATE } from "@/lib/landing-experiment-report";

export const WINDOW_DAYS = 7;
export const MAX_LOOKBACK_DAYS = 90;
const UPLOADS = "landing-conversion-uploads";

export type LeadEventRow = {
  eventId: string;
  occurredAt: string;
  sessionId: string;
  gclid: string | null;
  gbraid: string | null;
  wbraid: string | null;
};

export type PropertyTarget = {
  propertyId: number;
  propertyName: string;
  clientId: number;
  customerId: string;
  conversionActionId: string;
};

export type UploadEvent = {
  transactionId: string;
  occurredAt: string;
  gclid?: string | null;
  gbraid?: string | null;
  wbraid?: string | null;
};

export type UploadOutcome =
  | { ok: true; requestId: string | null; accepted: number; warnings: string[]; skipped: Array<{ transactionId: string; reason: string }> }
  | { ok: false; error: string; skipped?: Array<{ transactionId: string; reason: string }> };

export type Uploader = (input: { customerId: string; conversionActionId: string; events: UploadEvent[]; validateOnly?: boolean }) => Promise<UploadOutcome>;

export interface SyncOptions {
  payload?: Payload;
  now?: () => Date;
  windowDays?: number;
  propertyIds?: number[];
  validateOnly?: boolean;
  /** Injected in tests; otherwise read from active landing properties with an action ID. */
  targets?: PropertyTarget[];
  uploader?: Uploader;
  /** Injected in tests. Defaults to reading `landing_events` through Drizzle. */
  readLeads?: (payload: Payload, target: PropertyTarget, startIso: string, endIso: string) => Promise<LeadEventRow[]>;
}

export interface PropertySyncResult {
  propertyId: number;
  propertyName: string;
  leadEvents: number;
  candidates: number;
  alreadySent: number;
  sent: number;
  skipped: number;
  error?: string;
}

export interface SyncSummary {
  startedAt: string;
  finishedAt: string;
  windowStart: string;
  windowEnd: string;
  validateOnly: boolean;
  properties: PropertySyncResult[];
}

/** First click ID wins, in Google's own preference order. */
export function pickClickId(row: { gclid?: string | null; gbraid?: string | null; wbraid?: string | null }): { key: "gclid" | "gbraid" | "wbraid"; value: string } | null {
  for (const key of ["gclid", "gbraid", "wbraid"] as const) {
    const value = typeof row[key] === "string" ? row[key]!.trim() : "";
    if (value) return { key, value };
  }
  return null;
}

/**
 * Deterministic per-click transaction ID. Hashing keeps the click ID itself
 * out of Google's transaction field and bounds the length.
 */
export function transactionIdForClick(clickId: string): string {
  return `lp-qual-${createHash("sha256").update(clickId).digest("hex").slice(0, 32)}`;
}

/**
 * Collapse lead events to one candidate per ad click, keeping the earliest
 * lead moment for that click. Rows without any click ID are returned as
 * skips so the caller can record them.
 */
export function collapseToClicks(rows: LeadEventRow[]): { candidates: Array<UploadEvent & { eventIds: string[] }>; noClickId: LeadEventRow[] } {
  const byClick = new Map<string, UploadEvent & { eventIds: string[] }>();
  const noClickId: LeadEventRow[] = [];
  const sorted = [...rows].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.eventId.localeCompare(b.eventId));
  for (const row of sorted) {
    const click = pickClickId(row);
    if (!click) { noClickId.push(row); continue; }
    const transactionId = transactionIdForClick(click.value);
    const existing = byClick.get(transactionId);
    if (existing) { existing.eventIds.push(row.eventId); continue; }
    byClick.set(transactionId, {
      transactionId,
      occurredAt: row.occurredAt,
      gclid: row.gclid?.trim() || null,
      gbraid: row.gbraid?.trim() || null,
      wbraid: row.wbraid?.trim() || null,
      eventIds: [row.eventId],
    });
  }
  return { candidates: Array.from(byClick.values()), noClickId };
}

function isoDaysAgo(now: Date, days: number): string {
  const d = new Date(now);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString();
}

async function defaultReadLeads(payload: Payload, target: PropertyTarget, startIso: string, endIso: string): Promise<LeadEventRow[]> {
  const db = (payload.db as unknown as { drizzle: { all: (q: unknown) => Promise<unknown[]> } }).drizzle;
  const rows = (await db.all(sql.raw(`
    SELECT event_id, occurred_at, session_id,
      json_extract(attribution, '$.gclid') AS gclid,
      json_extract(attribution, '$.gbraid') AS gbraid,
      json_extract(attribution, '$.wbraid') AS wbraid
    FROM landing_events
    WHERE property_id = ${Number(target.propertyId)}
      AND client_id = ${Number(target.clientId)}
      AND occurred_at >= '${startIso.replace(/'/g, "")}'
      AND occurred_at < '${endIso.replace(/'/g, "")}'
      AND ${LEAD_SQL_PREDICATE}
    ORDER BY occurred_at ASC
  `))) as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    eventId: String(r.event_id),
    occurredAt: String(r.occurred_at),
    sessionId: String(r.session_id),
    gclid: typeof r.gclid === "string" ? r.gclid : null,
    gbraid: typeof r.gbraid === "string" ? r.gbraid : null,
    wbraid: typeof r.wbraid === "string" ? r.wbraid : null,
  }));
}

async function defaultUploader(input: Parameters<Uploader>[0]): Promise<UploadOutcome> {
  const baseUrl = (process.env.GROWTH_TOOLS_URL || "").replace(/\/$/, "");
  const apiKey = process.env.INTERNAL_API_KEY;
  if (!baseUrl || !apiKey) return { ok: false, error: "GROWTH_TOOLS_URL or INTERNAL_API_KEY is not configured" };
  const started = Date.now();
  try {
    const response = await fetch(`${baseUrl}/api/google-ads/offline-conversions`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-internal-key": apiKey },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(60_000),
    });
    const body = (await response.json().catch(() => ({}))) as Partial<UploadOutcome> & { message?: string };
    console.log(`[landing-conversions] growth-tools upload customer=${input.customerId} events=${input.events.length} status=${response.status} elapsed=${Date.now() - started}ms`);
    if (!response.ok || body.ok !== true) return { ok: false, error: (body as { error?: string }).error || body.message || `HTTP ${response.status}`, skipped: body.skipped };
    return body as UploadOutcome;
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

async function loadTargets(payload: Payload, propertyIds?: number[]): Promise<PropertyTarget[]> {
  const result = await payload.find({
    collection: "landing-properties",
    where: { and: [{ status: { equals: "active" } }, ...(propertyIds?.length ? [{ id: { in: propertyIds } }] : [])] },
    depth: 1,
    limit: 200,
    overrideAccess: true,
  });
  const targets: PropertyTarget[] = [];
  for (const doc of result.docs as unknown as Array<Record<string, unknown>>) {
    const actionId = String(doc.googleAdsOfflineConversionActionId || "").trim();
    if (!/^\d+$/.test(actionId)) continue;
    const client = doc.client as { id?: number; googleAdsCustomerId?: string | null } | number | null;
    const clientDoc = typeof client === "object" && client ? client : null;
    const customerId = String(clientDoc?.googleAdsCustomerId || "").replace(/-/g, "");
    if (!/^\d{10}$/.test(customerId) || !clientDoc?.id) continue;
    targets.push({ propertyId: Number(doc.id), propertyName: String(doc.name || doc.id), clientId: Number(clientDoc.id), customerId, conversionActionId: actionId });
  }
  return targets;
}

async function alreadySentIds(payload: Payload, propertyId: number, transactionIds: string[]): Promise<Set<string>> {
  if (transactionIds.length === 0) return new Set();
  const sent = new Set<string>();
  for (let i = 0; i < transactionIds.length; i += 100) {
    const chunk = transactionIds.slice(i, i + 100);
    const found = await payload.find({
      collection: UPLOADS as never,
      where: { and: [{ property: { equals: propertyId } }, { transactionId: { in: chunk } }, { status: { in: ["sent", "skipped"] } }] },
      limit: chunk.length,
      depth: 0,
      overrideAccess: true,
    });
    for (const doc of found.docs as Array<{ transactionId: string }>) sent.add(doc.transactionId);
  }
  return sent;
}

async function recordUploads(payload: Payload, target: PropertyTarget, rows: Array<{ transactionId: string; clickIdType: string; leadOccurredAt: string; eventIds: string[]; status: "sent" | "validated" | "skipped" | "failed"; detail?: string; requestId?: string | null }>): Promise<void> {
  for (const row of rows) {
    await payload.create({
      collection: UPLOADS as never,
      data: {
        property: target.propertyId,
        client: target.clientId,
        customerId: target.customerId,
        conversionActionId: target.conversionActionId,
        transactionId: row.transactionId,
        clickIdType: row.clickIdType,
        leadOccurredAt: row.leadOccurredAt,
        eventIds: row.eventIds.join("\n"),
        status: row.status,
        detail: row.detail || null,
        requestId: row.requestId || null,
      } as never,
      overrideAccess: true,
    });
  }
}

export async function runLandingConversionSync(options: SyncOptions = {}): Promise<SyncSummary> {
  const now = options.now ?? (() => new Date());
  const startedAt = now();
  const payload = options.payload ?? (await getPayload({ config }));
  const uploader = options.uploader ?? defaultUploader;
  const readLeads = options.readLeads ?? defaultReadLeads;
  const windowDays = Math.min(MAX_LOOKBACK_DAYS, Math.max(1, options.windowDays ?? WINDOW_DAYS));
  const windowEnd = startedAt.toISOString();
  const windowStart = isoDaysAgo(startedAt, windowDays);
  const validateOnly = Boolean(options.validateOnly);

  const targets = options.targets ?? (await loadTargets(payload, options.propertyIds));
  const properties: PropertySyncResult[] = [];

  for (const target of targets) {
    const result: PropertySyncResult = { propertyId: target.propertyId, propertyName: target.propertyName, leadEvents: 0, candidates: 0, alreadySent: 0, sent: 0, skipped: 0 };
    try {
      const rows = await readLeads(payload, target, windowStart, windowEnd);
      result.leadEvents = rows.length;
      const { candidates, noClickId } = collapseToClicks(rows);
      result.candidates = candidates.length;

      const sent = await alreadySentIds(payload, target.propertyId, candidates.map((c) => c.transactionId));
      const fresh = candidates.filter((c) => !sent.has(c.transactionId));
      result.alreadySent = candidates.length - fresh.length;

      // Rows with no click ID are recorded once per event so they stop
      // reappearing in the summary; nothing can be sent for them.
      const unsentNoClick: LeadEventRow[] = [];
      if (noClickId.length) {
        const ids = noClickId.map((r) => `lp-noclick-${r.eventId}`);
        const seen = await alreadySentIds(payload, target.propertyId, ids);
        for (const r of noClickId) if (!seen.has(`lp-noclick-${r.eventId}`)) unsentNoClick.push(r);
      }

      if (fresh.length) {
        const outcome = await uploader({ customerId: target.customerId, conversionActionId: target.conversionActionId, validateOnly, events: fresh.map(({ eventIds: _ignored, ...event }) => event) });
        if (!outcome.ok) {
          result.error = outcome.error;
          await recordUploads(payload, target, fresh.map((c) => ({ transactionId: c.transactionId, clickIdType: pickClickId(c)!.key, leadOccurredAt: c.occurredAt, eventIds: c.eventIds, status: "failed", detail: outcome.error })));
        } else {
          const skippedById = new Map(outcome.skipped.map((s) => [s.transactionId, s.reason]));
          await recordUploads(payload, target, fresh.map((c) => {
            const skipReason = skippedById.get(c.transactionId);
            return { transactionId: c.transactionId, clickIdType: pickClickId(c)!.key, leadOccurredAt: c.occurredAt, eventIds: c.eventIds, status: skipReason ? "skipped" : (validateOnly ? "validated" : "sent"), detail: skipReason || (outcome.warnings.length ? outcome.warnings.join("; ").slice(0, 500) : undefined), requestId: outcome.requestId };
          }));
          result.sent = fresh.length - skippedById.size;
          result.skipped += skippedById.size;
        }
      }
      if (unsentNoClick.length) {
        await recordUploads(payload, target, unsentNoClick.map((r) => ({ transactionId: `lp-noclick-${r.eventId}`, clickIdType: "none", leadOccurredAt: r.occurredAt, eventIds: [r.eventId], status: "skipped", detail: "no_click_id" })));
        result.skipped += unsentNoClick.length;
      }
    } catch (error) {
      result.error = error instanceof Error ? error.message : String(error);
    }
    console.log(`[landing-conversions] property=${target.propertyId} leads=${result.leadEvents} candidates=${result.candidates} sent=${result.sent} alreadySent=${result.alreadySent} skipped=${result.skipped}${result.error ? ` error=${result.error}` : ""}`);
    properties.push(result);
  }

  return { startedAt: startedAt.toISOString(), finishedAt: now().toISOString(), windowStart, windowEnd, validateOnly, properties };
}
