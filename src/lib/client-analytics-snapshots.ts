import type { Payload } from "payload";
import { ensureValidToken, fetchGa4Report } from "./ga4-service";

const DAY_MS = 24 * 60 * 60 * 1000;
type ClientRecord = { id: string | number; ga4Connected?: boolean; ga4PropertyId?: string; ga4AccessToken?: string; ga4RefreshToken?: string; ga4TokenExpiry?: string | null };

function ymd(value: Date): string { return value.toISOString().slice(0, 10); }
function monthLabel(date: Date): string { return `MONTH_${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`; }

async function snapshotRange(payload: Payload, client: ClientRecord, label: string, start: Date, end: Date): Promise<void> {
  if (!client.ga4PropertyId || !client.ga4RefreshToken) return;
  const token = await ensureValidToken(client.ga4AccessToken ?? "", client.ga4RefreshToken, client.ga4TokenExpiry ?? null);
  if (token.refreshed) await payload.update({ collection: "clients", id: client.id, data: { ga4AccessToken: token.accessToken, ga4TokenExpiry: token.expiry }, overrideAccess: true });
  const report = await fetchGa4Report(token.accessToken, client.ga4PropertyId, ymd(start), ymd(end));
  const clientId = typeof client.id === "number" ? client.id : Number(client.id);
  if (!Number.isInteger(clientId)) throw new Error(`Client ${String(client.id)} has an invalid numeric Payload ID`);
  const existing = await payload.find({ collection: "client-analytics-snapshots", where: { and: [{ client: { equals: clientId } }, { dateRangeLabel: { equals: label } }] }, limit: 1, depth: 0, overrideAccess: true });
  const data = { client: clientId, source: "ga4" as const, dateRangeLabel: label, periodStart: start.toISOString(), periodEnd: end.toISOString(), sessions: report.overview.sessions, keyEvents: report.overview.keyEvents, conversions: report.overview.conversions };
  if (existing.docs[0]) await payload.update({ collection: "client-analytics-snapshots", id: existing.docs[0].id, data, overrideAccess: true });
  else await payload.create({ collection: "client-analytics-snapshots", data, overrideAccess: true });
}

/** Captures twelve complete months plus current and preceding 30-day comparison windows. */
export async function runClientAnalyticsSnapshotsCron(payload: Payload): Promise<{ processed: number; failed: number }> {
  const clients = await payload.find({ collection: "clients", where: { and: [{ ga4Connected: { equals: true } }, { ga4PropertyId: { exists: true } }, { ga4RefreshToken: { exists: true } }] }, limit: 0, pagination: false, depth: 0, overrideAccess: true });
  let processed = 0; let failed = 0;
  for (const client of clients.docs as ClientRecord[]) {
    try {
      const now = new Date();
      for (let offset = 1; offset <= 12; offset++) {
        const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1));
        const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset + 1, 0));
        await snapshotRange(payload, client, monthLabel(start), start, end);
      }
      const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      await snapshotRange(payload, client, "ROLLING_30D_CURRENT", new Date(today.getTime() - 30 * DAY_MS), new Date(today.getTime() - DAY_MS));
      await snapshotRange(payload, client, "ROLLING_30D_PREVIOUS", new Date(today.getTime() - 60 * DAY_MS), new Date(today.getTime() - 31 * DAY_MS));
      processed++;
    } catch (error) { failed++; payload.logger?.warn?.(`[client-analytics-snapshots] client=${client.id} failed: ${error instanceof Error ? error.message : String(error)}`); }
  }
  return { processed, failed };
}
