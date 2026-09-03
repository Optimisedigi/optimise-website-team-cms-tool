/**
 * Daily poll of Google's Search Status Dashboard into
 * `google-search-status-incidents`. Dedupe is on Google's incident id, so
 * re-runs update in place (rollout start → complete) rather than duplicating.
 */

import { getPayload, type Payload } from "payload";

import config from "@/payload.config";

import { isRankingKind } from "./classify";
import { fetchSearchStatusIncidents, type NormalisedSearchIncident } from "./fetch";

const COLLECTION = "google-search-status-incidents" as const;

export interface RunSearchUpdatesCronOptions {
  payload?: Payload;
  fetchIncidents?: typeof fetchSearchStatusIncidents;
  notify?: boolean;
}

export interface SearchUpdatesCronSummary {
  fetched: number;
  created: number;
  updated: number;
  notified: number;
  error?: string;
}

function docFromIncident(incident: NormalisedSearchIncident) {
  return {
    incidentId: incident.incidentId,
    title: incident.title,
    kind: incident.kind,
    begin: incident.begin || undefined,
    end: incident.end || undefined,
    modified: incident.modified || undefined,
    statusImpact: incident.statusImpact || undefined,
    severity: incident.severity || undefined,
    serviceName: incident.serviceName || undefined,
    latestUpdate: incident.latestUpdate || undefined,
    sourceUri: incident.sourceUri || undefined,
    raw: incident.raw,
  };
}

async function notifyAdmins(payload: Payload, incident: NormalisedSearchIncident): Promise<number> {
  if (!isRankingKind(incident.kind)) return 0;
  try {
    const admins = await payload.find({
      collection: "users",
      where: { role: { equals: "admin" } },
      depth: 0,
      limit: 100,
      overrideAccess: true,
    });
    let sent = 0;
    for (const admin of admins.docs) {
      await payload.create({
        collection: "notifications",
        data: {
          recipient: admin.id,
          kind: "google-search-update",
          title: `Google Search: ${incident.title}`,
          body: incident.latestUpdate || `${incident.kind} update began ${incident.begin.slice(0, 10) || "recently"}`,
          url: "/admin/google-ads-automation",
        },
        overrideAccess: true,
      });
      sent++;
    }
    return sent;
  } catch (err) {
    console.error("[google-search-updates] notify failed:", (err as Error).message);
    return 0;
  }
}

export async function runGoogleSearchUpdatesCron(
  opts: RunSearchUpdatesCronOptions = {},
): Promise<SearchUpdatesCronSummary> {
  const payload = opts.payload ?? (await getPayload({ config: await config }));
  const fetcher = opts.fetchIncidents ?? fetchSearchStatusIncidents;
  const fetched = await fetcher();
  if (!fetched.ok) return { fetched: 0, created: 0, updated: 0, notified: 0, error: fetched.error };

  const summary: SearchUpdatesCronSummary = {
    fetched: fetched.incidents.length,
    created: 0,
    updated: 0,
    notified: 0,
  };

  for (const incident of fetched.incidents) {
    const existing = await payload.find({
      collection: COLLECTION,
      where: { incidentId: { equals: incident.incidentId } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    });
    const current = existing.docs[0] as { id: number; notifiedAt?: string | null } | undefined;
    const data = docFromIncident(incident);

    if (current) {
      await payload.update({
        collection: COLLECTION,
        id: current.id,
        data,
        overrideAccess: true,
      });
      summary.updated++;
      if (opts.notify !== false && !current.notifiedAt && isRankingKind(incident.kind)) {
        const sent = await notifyAdmins(payload, incident);
        summary.notified += sent;
        if (sent > 0) {
          await payload.update({
            collection: COLLECTION,
            id: current.id,
            data: { notifiedAt: new Date().toISOString() },
            overrideAccess: true,
          });
        }
      }
      continue;
    }

    const created = await payload.create({
      collection: COLLECTION,
      data,
      overrideAccess: true,
    });
    summary.created++;
    if (opts.notify !== false && isRankingKind(incident.kind)) {
      const sent = await notifyAdmins(payload, incident);
      summary.notified += sent;
      if (sent > 0) {
        await payload.update({
          collection: COLLECTION,
          id: created.id,
          data: { notifiedAt: new Date().toISOString() },
          overrideAccess: true,
        });
      }
    }
  }

  return summary;
}
