import { NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { headers as nextHeaders } from "next/headers";

interface AccountOption {
  id: string | number;
  businessName?: string;
  customerId: string;
  source: "audit" | "client";
  clientId?: string | number;
}

interface ClientAccountRecord {
  id: string | number;
  name?: string | null;
  googleAdsCustomerId?: string | null;
  isActive?: boolean | null;
}

interface AuditAccountRecord {
  id: string | number;
  businessName?: string | null;
  customerId?: string | null;
  client?: string | number | { id?: string | number } | null;
}

function normaliseCustomerId(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function customerKey(customerId: string): string {
  return customerId.replace(/-/g, "");
}

/**
 * Accounts available to OptiMate Google Ads.
 *
 * Historically the launcher only listed existing google-ads-audits, so clients
 * visible in the Google Ads hub via MCC/client configuration but without an
 * audit row were missing. This endpoint merges latest audit rows with active
 * client Google Ads IDs and creates a lightweight audit row on demand for any
 * client-only account so OptiMate can chat against it immediately.
 */
export async function GET() {
  try {
    const payload = await getPayload({ config });
    const headersList = await nextHeaders();
    const { user } = await payload.auth({ headers: headersList });
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const auditResult = await payload.find({
      collection: "google-ads-audits",
      where: { customerId: { not_equals: "" } },
      limit: 500,
      depth: 0,
      sort: "-updatedAt",
      overrideAccess: true,
      select: {
        id: true,
        businessName: true,
        customerId: true,
        client: true,
        updatedAt: true,
      } as any,
    });

    const clientResult = await payload.find({
      collection: "clients",
      where: {
        and: [
          { googleAdsCustomerId: { not_equals: null } },
          { googleAdsCustomerId: { not_equals: "" } },
        ],
      },
      limit: 500,
      depth: 0,
      sort: "name",
      overrideAccess: true,
      select: {
        id: true,
        name: true,
        googleAdsCustomerId: true,
        isActive: true,
      } as any,
    });

    const rawClientsById = new Map<string, ClientAccountRecord>();
    const managedClientIds = new Set<string>();
    const unmanagedClientIds = new Set<string>();
    const clientDocs = clientResult.docs as unknown as ClientAccountRecord[];
    for (const client of clientDocs) {
      rawClientsById.set(String(client.id), client);
      if (client.isActive !== false) {
        managedClientIds.add(String(client.id));
      } else {
        unmanagedClientIds.add(String(client.id));
      }
    }

    try {
      const managedClientResult = await payload.find({
        collection: "clients",
        where: {
          and: [
            { isActive: { not_equals: false } },
            { googleAdsCustomerId: { not_equals: null } },
            { googleAdsCustomerId: { not_equals: "" } },
            { "gadsAuto.isManagedGoogleAdsAccount": { not_equals: false } },
          ],
        },
        limit: 500,
        depth: 0,
        sort: "name",
        overrideAccess: true,
        select: {
          id: true,
        } as any,
      });

      managedClientIds.clear();
      const managedClientDocs = managedClientResult.docs as unknown as Array<{ id: string | number }>;
      for (const client of managedClientDocs) {
        managedClientIds.add(String(client.id));
      }
      for (const clientId of rawClientsById.keys()) {
        if (!managedClientIds.has(clientId)) {
          unmanagedClientIds.add(clientId);
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!message.includes("gads_auto_is_managed_google_ads_account")) {
        throw err;
      }
    }

    const unmanagedCustomerKeys = new Set<string>();
    for (const clientId of unmanagedClientIds) {
      const customerId = normaliseCustomerId(rawClientsById.get(clientId)?.googleAdsCustomerId);
      if (customerId) {
        unmanagedCustomerKeys.add(customerKey(customerId));
      }
    }

    const byCustomerId = new Map<string, AccountOption>();

    const auditDocs = auditResult.docs as unknown as AuditAccountRecord[];
    for (const audit of auditDocs) {
      const linkedClientId =
        typeof audit.client === "object" && audit.client !== null
          ? ((audit.client as { id?: string | number }).id as string | number | undefined)
          : (audit.client as string | number | undefined);
      const customerId = normaliseCustomerId(audit.customerId);
      if (!customerId) continue;
      const key = customerKey(customerId);
      if (
        (linkedClientId !== undefined && unmanagedClientIds.has(String(linkedClientId))) ||
        unmanagedCustomerKeys.has(key)
      ) {
        continue;
      }
      if (byCustomerId.has(key)) continue;
      byCustomerId.set(key, {
        id: audit.id as string | number,
        businessName: typeof audit.businessName === "string" ? audit.businessName : undefined,
        customerId,
        source: "audit",
        clientId: linkedClientId,
      });
    }

    for (const client of clientDocs) {
      const customerId = normaliseCustomerId(client.googleAdsCustomerId);
      if (!customerId) continue;
      const key = customerKey(customerId);
      const existing = byCustomerId.get(key);
      if (existing) {
        if (!existing.businessName && typeof client.name === "string") {
          existing.businessName = client.name;
        }
        existing.clientId = existing.clientId ?? (client.id as string | number);
        continue;
      }

      if (!managedClientIds.has(String(client.id))) {
        continue;
      }

      const businessName = typeof client.name === "string" && client.name.trim()
        ? client.name.trim()
        : `Google Ads ${customerId}`;
      const audit = await payload.create({
        collection: "google-ads-audits",
        data: {
          businessName,
          customerId,
          client: Number(client.id),
        },
        overrideAccess: true,
      } as any);

      byCustomerId.set(key, {
        id: (audit as { id: string | number }).id,
        businessName,
        customerId,
        source: "client",
        clientId: client.id as string | number,
      });
    }

    const accounts = Array.from(byCustomerId.values()).sort((a, b) => {
      const an = a.businessName ?? a.customerId;
      const bn = b.businessName ?? b.customerId;
      return an.localeCompare(bn);
    });

    return NextResponse.json({ accounts });
  } catch (err) {
    console.error("[optimate/google-ads-accounts] error:", err);
    return NextResponse.json(
      { error: "Failed to load Google Ads accounts" },
      { status: 500 },
    );
  }
}
