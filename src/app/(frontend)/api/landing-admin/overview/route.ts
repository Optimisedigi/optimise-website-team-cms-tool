import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import { sql } from "drizzle-orm";
import config from "@/payload.config";

export const dynamic = "force-dynamic";

/**
 * GET /api/landing-admin/overview
 *
 * Internal at-a-glance list for /landing-pages-dashboard: every landing
 * property grouped by client, with 30-day sessions/conversions and the state
 * of each mapped custom domain.
 *
 * Payload admin session only — this is cross-tenant by design, so the client
 * PIN mechanism must never reach it.
 *
 * Stats come from one grouped query over landing_events rather than a row
 * scan: the result is bounded by properties × event types, not by traffic.
 */

const DAYS = 30;

interface StatRow {
  property_id: unknown;
  event_type: unknown;
  sessions: unknown;
}

export async function GET(req: NextRequest) {
  const payload = await getPayload({ config });

  const { user } = await payload.auth({ headers: req.headers });
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const since = new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000).toISOString();

  const [properties, domains, statResult] = await Promise.all([
    payload.find({
      collection: "landing-properties",
      depth: 1, // resolves client and activeExperiment
      limit: 200,
      overrideAccess: true,
      sort: "name",
    }),
    payload.find({
      collection: "landing-domains",
      depth: 0,
      limit: 500,
      overrideAccess: true,
      sort: "hostname",
    }),
    // `since` is a server-generated ISO string; nothing caller-controlled
    // reaches this statement.
    payload.db.drizzle
      .run(
        sql.raw(`
          SELECT \`property_id\`, \`event_type\`, COUNT(DISTINCT \`session_id\`) AS sessions
          FROM \`landing_events\`
          WHERE \`occurred_at\` >= '${since.replace(/'/g, "''")}'
          GROUP BY \`property_id\`, \`event_type\``),
      )
      .catch((error) => {
        console.error("[landing-admin] overview stats query failed:", error);
        return { rows: [] as StatRow[] };
      }),
  ]);

  const statRows = ((statResult as { rows?: StatRow[] })?.rows ?? []) as StatRow[];
  const sessionsByProperty = new Map<string, Map<string, number>>();
  for (const row of statRows) {
    const propertyId = String(row.property_id ?? "");
    if (!propertyId) continue;
    if (!sessionsByProperty.has(propertyId)) sessionsByProperty.set(propertyId, new Map());
    sessionsByProperty.get(propertyId)!.set(String(row.event_type ?? ""), Number(row.sessions ?? 0));
  }

  const domainsByProperty = new Map<string, unknown[]>();
  for (const domain of domains.docs) {
    const propertyId = String(
      typeof domain.property === "object" && domain.property !== null
        ? (domain.property as { id: unknown }).id
        : domain.property,
    );
    if (!domainsByProperty.has(propertyId)) domainsByProperty.set(propertyId, []);
    domainsByProperty.get(propertyId)!.push({
      id: domain.id,
      hostname: domain.hostname,
      status: domain.status,
      dnsRecordType: domain.dnsRecordType ?? null,
      dnsRecordName: domain.dnsRecordName ?? null,
      dnsRecordValue: domain.dnsRecordValue ?? null,
      verificationTxt: domain.verificationTxt ?? null,
      lastCheckedAt: domain.lastCheckedAt ?? null,
      pathHint: domain.pathHint ?? null,
    });
  }

  interface ClientBucket {
    id: unknown;
    name: string;
    slug: string;
    sessions30d: number;
    conversions30d: number;
    properties: unknown[];
  }
  const clients = new Map<string, ClientBucket>();

  for (const property of properties.docs) {
    const client =
      typeof property.client === "object" && property.client !== null
        ? (property.client as { id: unknown; name?: unknown; slug?: unknown })
        : { id: property.client, name: "", slug: "" };
    const clientKey = String(client.id);

    if (!clients.has(clientKey)) {
      clients.set(clientKey, {
        id: client.id,
        name: String(client.name ?? ""),
        slug: String(client.slug ?? ""),
        sessions30d: 0,
        conversions30d: 0,
        properties: [],
      });
    }
    const bucket = clients.get(clientKey)!;

    const experiment =
      typeof property.activeExperiment === "object" && property.activeExperiment !== null
        ? (property.activeExperiment as { experimentId?: unknown; status?: unknown; primaryGoal?: unknown })
        : null;
    const primaryGoal = String(experiment?.primaryGoal ?? "booking_complete");

    const stats = sessionsByProperty.get(String(property.id));
    // Sessions ≈ sessions that produced a page_view; conversions = sessions
    // that hit the property's primary goal.
    const sessions = stats?.get("page_view") ?? 0;
    const conversions = stats?.get(primaryGoal) ?? 0;
    bucket.sessions30d += sessions;
    bucket.conversions30d += conversions;

    bucket.properties.push({
      id: property.id,
      name: property.name,
      propertyKey: property.propertyKey,
      status: property.status,
      sessions30d: sessions,
      conversions30d: conversions,
      activeExperiment: experiment
        ? { id: experiment.experimentId ?? null, status: experiment.status ?? null, primaryGoal }
        : null,
      allowedOrigins: Array.isArray(property.allowedOrigins)
        ? property.allowedOrigins.map((row) => String((row as { origin?: unknown }).origin ?? "")).filter(Boolean)
        : [],
      domains: domainsByProperty.get(String(property.id)) ?? [],
    });
  }

  return NextResponse.json(
    {
      rangeDays: DAYS,
      clients: [...clients.values()].sort((a, b) => a.name.localeCompare(b.name)),
    },
    { headers: { "cache-control": "no-store" } },
  );
}
