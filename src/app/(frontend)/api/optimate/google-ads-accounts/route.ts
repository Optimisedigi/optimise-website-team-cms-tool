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
  gadsAuto?: { isManagedGoogleAdsAccount?: boolean | null } | null;
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
        gadsAuto: true,
      } as any,
    });

    const rawClientsById = new Map<string, ClientAccountRecord>();
    const managedClientIds = new Set<string>();
    const unmanagedClientIds = new Set<string>();
    const clientDocs = clientResult.docs as unknown as ClientAccountRecord[];
    for (const client of clientDocs) {
      rawClientsById.set(String(client.id), client);
      // A client's Google Ads account is hidden from OptiMate when EITHER the
      // client is inactive OR its "managed Google Ads account" toggle is
      // explicitly off (gadsAuto.isManagedGoogleAdsAccount === false). The
      // toggle lets us keep the customer ID on record for MCC visibility while
      // excluding accounts we can see but do not manage. (The managed-toggle
      // filtering was removed in 1595cae to dodge a schema 500 before the
      // column shipped; restored here now the column exists.)
      const isInactive = client.isActive === false;
      const isUnmanaged = client.gadsAuto?.isManagedGoogleAdsAccount === false;
      if (isInactive || isUnmanaged) {
        unmanagedClientIds.add(String(client.id));
      } else {
        managedClientIds.add(String(client.id));
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
      try {
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
      } catch (err) {
        console.error("[optimate/google-ads-accounts] failed to create lightweight audit", {
          clientId: client.id,
          customerId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
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
