import type { Payload } from "payload";
import { buildLedgerSummary } from "./client-value-ledger";

export interface ClientHubPayload {
  client: {
    id: string | number;
    name: string;
    slug: string;
    websiteUrl?: string | null;
  };
  links: Array<Record<string, unknown>>;
  requests: Array<Record<string, unknown>>;
  valueLedger: {
    items: Array<Record<string, unknown>>;
    summary: ReturnType<typeof buildLedgerSummary>;
  };
  forecastScenarios: Array<Record<string, unknown>>;
  organicGrowthSnapshots: Array<Record<string, unknown>>;
  processes: Array<Record<string, unknown>>;
  discoveryBriefings: Array<Record<string, unknown>>;
}

function relationId(value: unknown): string | number | null {
  if (value && typeof value === "object" && "id" in value) return (value as { id: string | number }).id;
  if (typeof value === "string" || typeof value === "number") return value;
  return null;
}

async function findDocs(payload: Payload, collection: string, where: Record<string, unknown>, limit: number): Promise<Array<Record<string, unknown>>> {
  const result = await payload.find({
    collection: collection as any,
    where: where as any,
    limit,
    depth: 1,
    overrideAccess: true,
  });
  return result.docs as Array<Record<string, unknown>>;
}

export async function buildClientHubPayload(payload: Payload, slug: string): Promise<ClientHubPayload | null> {
  const clients = await findDocs(payload, "clients", { slug: { equals: slug } }, 1);
  const client = clients[0];
  if (!client) return null;
  const clientId = client.id as string | number;

  const [requests, ledgerItems, forecastScenarios, organicGrowthSnapshots, processes, discoveryBriefings] = await Promise.all([
    findDocs(payload, "client-portal-requests", { client: { equals: clientId } }, 25),
    findDocs(payload, "client-value-ledger-items", { and: [{ client: { equals: clientId } }, { visibility: { equals: "client_visible" } }] }, 25),
    findDocs(payload, "forecast-scenarios", { and: [{ client: { equals: clientId } }, { status: { equals: "published" } }] }, 10),
    findDocs(payload, "quarterly-organic-growth-snapshots", { client: { equals: clientId } }, 8),
    findDocs(payload, "client-processes", { client: { equals: clientId } }, 5),
    findDocs(payload, "client-discovery-briefings", { client: { equals: clientId } }, 3),
  ]);

  const manualLinks = Array.isArray(client.clientPortalLinks)
    ? (client.clientPortalLinks as Array<Record<string, unknown>>).filter((link) => link.visibility !== "internal")
    : [];
  const dashboardLinks: Array<Record<string, unknown>> = client.googleAdsCustomerId
    ? [{ label: "Google Ads Dashboard", url: `/client/${String(client.slug)}/google-ads`, kind: "dashboard", source: "system", sortOrder: 10 }]
    : [];

  return {
    client: {
      id: clientId,
      name: String(client.name || "Client"),
      slug: String(client.slug || slug),
      websiteUrl: typeof client.websiteUrl === "string" ? client.websiteUrl : null,
    },
    links: [...manualLinks, ...dashboardLinks].sort((a, b) => Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0)),
    requests,
    valueLedger: {
      items: ledgerItems,
      summary: buildLedgerSummary(
        ledgerItems.map((item) => ({
          client: relationId(item.client) ?? clientId,
          occurredAt: String(item.occurredAt || ""),
          category: String(item.category || "other"),
          title: String(item.title || ""),
          summary: String(item.summary || ""),
          impactType: typeof item.impactType === "string" ? item.impactType : null,
          impactValue: typeof item.impactValue === "number" ? item.impactValue : null,
          impactUnit: typeof item.impactUnit === "string" ? item.impactUnit : null,
        })),
      ),
    },
    forecastScenarios,
    organicGrowthSnapshots,
    processes,
    discoveryBriefings,
  };
}
