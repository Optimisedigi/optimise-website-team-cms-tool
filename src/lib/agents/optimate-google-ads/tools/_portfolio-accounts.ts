import { getPayload } from "payload";
import config from "@/payload.config";

export interface PortfolioAccount {
  accountRef?: string | number;
  clientId?: string | number;
  displayName: string;
  customerId: string;
  maskedCustomerId: string;
  source: "audit" | "client";
  active: boolean;
  managed: boolean;
  lastAuditUpdate?: string;
  monthlySpend?: number;
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
  updatedAt?: string | null;
  monthlySpend?: number | null;
}

export function normaliseCustomerId(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function customerKey(customerId: string): string {
  return customerId.replace(/-/g, "");
}

export function maskCustomerId(customerId: string): string {
  const digits = customerKey(customerId);
  if (digits.length <= 4) return "••••";
  return `•••-${digits.slice(-4)}`;
}

export async function loadPortfolioAccounts(): Promise<PortfolioAccount[]> {
  const payload = await getPayload({ config });
  const [auditResult, clientResult] = await Promise.all([
    payload.find({
      collection: "google-ads-audits" as any,
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
        monthlySpend: true,
      } as any,
    }),
    payload.find({
      collection: "clients" as any,
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
    }),
  ]);

  const clientsById = new Map<string, ClientAccountRecord>();
  for (const client of clientResult.docs as unknown as ClientAccountRecord[]) {
    clientsById.set(String(client.id), client);
  }

  const byCustomerId = new Map<string, PortfolioAccount>();
  for (const audit of auditResult.docs as unknown as AuditAccountRecord[]) {
    const customerId = normaliseCustomerId(audit.customerId);
    if (!customerId) continue;
    const linkedClientId =
      typeof audit.client === "object" && audit.client !== null
        ? audit.client.id
        : audit.client ?? undefined;
    const client = linkedClientId !== undefined ? clientsById.get(String(linkedClientId)) : undefined;
    const managed = client?.gadsAuto?.isManagedGoogleAdsAccount !== false && client?.isActive !== false;
    const key = customerKey(customerId);
    if (byCustomerId.has(key)) continue;
    byCustomerId.set(key, {
      accountRef: audit.id,
      clientId: linkedClientId,
      displayName: audit.businessName || client?.name || maskCustomerId(customerId),
      customerId,
      maskedCustomerId: maskCustomerId(customerId),
      source: "audit",
      active: client?.isActive !== false,
      managed,
      ...(typeof audit.updatedAt === "string" ? { lastAuditUpdate: audit.updatedAt } : {}),
      ...(typeof audit.monthlySpend === "number" ? { monthlySpend: audit.monthlySpend } : {}),
    });
  }

  for (const client of clientResult.docs as unknown as ClientAccountRecord[]) {
    const customerId = normaliseCustomerId(client.googleAdsCustomerId);
    if (!customerId) continue;
    const key = customerKey(customerId);
    const existing = byCustomerId.get(key);
    const managed = client.gadsAuto?.isManagedGoogleAdsAccount !== false && client.isActive !== false;
    if (existing) {
      existing.clientId = existing.clientId ?? client.id;
      existing.active = client.isActive !== false;
      existing.managed = managed;
      if (!existing.displayName && client.name) existing.displayName = client.name;
      continue;
    }
    byCustomerId.set(key, {
      clientId: client.id,
      displayName: client.name || maskCustomerId(customerId),
      customerId,
      maskedCustomerId: maskCustomerId(customerId),
      source: "client",
      active: client.isActive !== false,
      managed,
    });
  }

  return Array.from(byCustomerId.values()).sort((a, b) => a.displayName.localeCompare(b.displayName));
}
