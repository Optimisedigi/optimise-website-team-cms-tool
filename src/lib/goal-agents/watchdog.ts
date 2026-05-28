/**
 * Watchdog: independent anomaly detector for Google Ads.
 *
 * Reads the two most recent campaign-level snapshots per client from the
 * `google-ads-snapshots` collection and writes an `activity-log` row when
 * day-over-day deltas trip configured thresholds.
 *
 * Intentionally decoupled from the goal-agents scheduler — runs on its own
 * cron, never mutates goal-runs, never calls Growth Tools. Pure read +
 * activity-log write.
 */

import type { Payload } from "payload";

import type { CampaignSnapshotRow } from "../google-ads-snapshots/types";
import { logActivity } from "../activity-log";

export type WatchdogSeverity = "warning" | "critical";

export interface WatchdogAnomaly {
  clientId: string;
  metric: string;
  deltaPct: number;
  severity: WatchdogSeverity;
}

export interface WatchdogSummary {
  clientsChecked: number;
  anomaliesFound: number;
  details: WatchdogAnomaly[];
}

/** Window used when finding clients that have a recent snapshot. */
const RECENT_SNAPSHOT_DAYS = 7;

/** Spend thresholds: absolute value of deltaPct, in percent. */
const SPEND_WARNING_PCT = 30;
const SPEND_CRITICAL_PCT = 60;

/** Conversions thresholds — only triggered on declines (negative deltaPct). */
const CONV_WARNING_PCT = -40;
const CONV_CRITICAL_PCT = -70;

interface SnapshotDoc {
  id: string | number;
  client: string | number | { id: string | number };
  level: string;
  capturedAt: string;
  customerId: string;
  rows?: unknown;
}

interface ClientDoc {
  id: string | number;
  name?: string | null;
  googleAdsCustomerId?: string | null;
}

function extractClientId(value: SnapshotDoc["client"]): string {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (value && typeof value === "object" && "id" in value) return String(value.id);
  return "";
}

function sumCampaignRows(rows: CampaignSnapshotRow[]): {
  totalSpend: number;
  totalConversions: number;
} {
  let totalSpend = 0;
  let totalConversions = 0;
  for (const row of rows) {
    if (typeof row.spend === "number" && Number.isFinite(row.spend)) {
      totalSpend += row.spend;
    }
    if (typeof row.conversions === "number" && Number.isFinite(row.conversions)) {
      totalConversions += row.conversions;
    }
  }
  return { totalSpend, totalConversions };
}

function narrowCampaignRows(raw: unknown): CampaignSnapshotRow[] {
  if (!Array.isArray(raw)) return [];
  return raw as CampaignSnapshotRow[];
}

/** Percentage change from `previous` to `current`, rounded to 2 decimals. */
function deltaPct(current: number, previous: number): number | null {
  if (previous === 0) return null;
  const raw = ((current - previous) / previous) * 100;
  if (!Number.isFinite(raw)) return null;
  return Math.round(raw * 100) / 100;
}

function classifySpend(delta: number): WatchdogSeverity | null {
  const abs = Math.abs(delta);
  if (abs >= SPEND_CRITICAL_PCT) return "critical";
  if (abs >= SPEND_WARNING_PCT) return "warning";
  return null;
}

function classifyConversions(delta: number): WatchdogSeverity | null {
  if (delta <= CONV_CRITICAL_PCT) return "critical";
  if (delta <= CONV_WARNING_PCT) return "warning";
  return null;
}

async function findClientsWithRecentSnapshot(
  payload: Payload,
  now: Date,
): Promise<ClientDoc[]> {
  const since = new Date(now.getTime() - RECENT_SNAPSHOT_DAYS * 24 * 60 * 60 * 1000);

  // Fetch all clients that have a googleAdsCustomerId set.
  const clientsResult = await payload.find({
    collection: "clients",
    where: { googleAdsCustomerId: { exists: true } },
    limit: 1000,
    depth: 0,
    overrideAccess: true,
  });
  const candidates = (clientsResult.docs as unknown as ClientDoc[]).filter(
    (c) => typeof c.googleAdsCustomerId === "string" && c.googleAdsCustomerId.trim().length > 0,
  );

  if (candidates.length === 0) return [];

  // For each candidate, check whether they have a campaign snapshot in the window.
  const eligible: ClientDoc[] = [];
  for (const client of candidates) {
    const snapshotResult = await payload.find({
      collection: "google-ads-snapshots",
      where: {
        and: [
          { client: { equals: client.id } },
          { level: { equals: "campaign" } },
          { capturedAt: { greater_than_equal: since.toISOString() } },
        ],
      },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    });
    if ((snapshotResult.docs as unknown[]).length > 0) {
      eligible.push(client);
    }
  }
  return eligible;
}

async function fetchTwoMostRecentCampaignSnapshots(
  payload: Payload,
  clientId: string | number,
): Promise<SnapshotDoc[]> {
  const result = await payload.find({
    collection: "google-ads-snapshots",
    where: {
      and: [
        { client: { equals: clientId } },
        { level: { equals: "campaign" } },
      ],
    },
    sort: "-capturedAt",
    limit: 2,
    depth: 0,
    overrideAccess: true,
  });
  return result.docs as unknown as SnapshotDoc[];
}

function describeDirection(deltaPctVal: number, metric: string): string {
  const dir = deltaPctVal >= 0 ? "up" : "down";
  return `${metric} ${dir} ${Math.abs(deltaPctVal).toFixed(2)}% day-over-day`;
}

async function checkClient(
  payload: Payload,
  client: ClientDoc,
): Promise<WatchdogAnomaly[]> {
  const snapshots = await fetchTwoMostRecentCampaignSnapshots(payload, client.id);
  if (snapshots.length < 2) return [];

  const [latest, previous] = snapshots;
  const latestSum = sumCampaignRows(narrowCampaignRows(latest.rows));
  const prevSum = sumCampaignRows(narrowCampaignRows(previous.rows));

  const clientIdStr = String(client.id);
  const anomalies: WatchdogAnomaly[] = [];

  const spendDelta = deltaPct(latestSum.totalSpend, prevSum.totalSpend);
  if (spendDelta !== null) {
    const severity = classifySpend(spendDelta);
    if (severity) {
      anomalies.push({
        clientId: clientIdStr,
        metric: "totalSpend",
        deltaPct: spendDelta,
        severity,
      });
    }
  }

  const convDelta = deltaPct(latestSum.totalConversions, prevSum.totalConversions);
  if (convDelta !== null) {
    const severity = classifyConversions(convDelta);
    if (severity) {
      anomalies.push({
        clientId: clientIdStr,
        metric: "totalConversions",
        deltaPct: convDelta,
        severity,
      });
    }
  }

  for (const anomaly of anomalies) {
    const title = `Google Ads anomaly — ${anomaly.metric} (${anomaly.severity})`;
    const description = `${describeDirection(anomaly.deltaPct, anomaly.metric)} (severity=${anomaly.severity}).`;
    await logActivity(payload, {
      type: "google_ads_anomaly_detected",
      title,
      description,
      client: client.id,
    });
  }

  return anomalies;
}

export async function runWatchdog(
  payload: Payload,
  now: Date = new Date(),
): Promise<WatchdogSummary> {
  const clients = await findClientsWithRecentSnapshot(payload, now);
  const details: WatchdogAnomaly[] = [];

  for (const client of clients) {
    try {
      const found = await checkClient(payload, client);
      details.push(...found);
    } catch (err) {
      const message = err instanceof Error ? err.message : "unknown error";
      payload.logger?.warn?.(
        `[goal-agents/watchdog] client ${client.id} check failed: ${message}`,
      );
    }
  }

  return {
    clientsChecked: clients.length,
    anomaliesFound: details.length,
    details,
  };
}
