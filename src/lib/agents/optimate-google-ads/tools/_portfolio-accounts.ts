import { getPayload } from "payload";
import config from "@/payload.config";

export interface PortfolioAccount {
  accountRef?: string | number;
  clientId?: string | number;
  displayName: string;
  customerId: string;
  maskedCustomerId: string;
  clientSlug?: string;
  source: "audit" | "client";
  active: boolean;
  managed: boolean;
  lastAuditUpdate?: string;
  monthlySpend?: number;
  conversionActions?: string;
  conversionActionCategories?: string;
}

interface ClientAccountRecord {
  id: string | number;
  name?: string | null;
  googleAdsCustomerId?: string | null;
  slug?: string | null;
  isActive?: boolean | null;
  dashboardConversionActions?: string | null;
  phoneCallConversionActions?: string | null;
  formSubmitConversionActions?: string | null;
  conversionActionCategories?: Array<{ label?: string | null; color?: string | null; actions?: string | null }> | null;
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
        slug: true,
        isActive: true,
        dashboardConversionActions: true,
        phoneCallConversionActions: true,
        formSubmitConversionActions: true,
        conversionActionCategories: true,
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
      ...(client?.slug ? { clientSlug: client.slug } : {}),
      source: "audit",
      active: client?.isActive !== false,
      managed,
      ...(typeof audit.updatedAt === "string" ? { lastAuditUpdate: audit.updatedAt } : {}),
      ...(typeof audit.monthlySpend === "number" ? { monthlySpend: audit.monthlySpend } : {}),
      ...conversionSettingsForClient(client),
    });
  }

  for (const client of clientResult.docs as unknown as ClientAccountRecord[]) {
    const customerId = normaliseCustomerId(client.googleAdsCustomerId);
    if (!customerId) continue;
    const key = customerKey(customerId);
    const existing = byCustomerId.get(key);
    const managed = client.gadsAuto?.isManagedGoogleAdsAccount !== false && client.isActive !== false;
    const conversionSettings = conversionSettingsForClient(client);
    if (existing) {
      existing.clientId = existing.clientId ?? client.id;
      existing.active = client.isActive !== false;
      existing.managed = managed;
      if (!existing.clientSlug && client.slug) existing.clientSlug = client.slug;
      if (!existing.displayName && client.name) existing.displayName = client.name;
      if (!existing.conversionActions && conversionSettings.conversionActions) {
        existing.conversionActions = conversionSettings.conversionActions;
      }
      if (!existing.conversionActionCategories && conversionSettings.conversionActionCategories) {
        existing.conversionActionCategories = conversionSettings.conversionActionCategories;
      }
      continue;
    }
    byCustomerId.set(key, {
      clientId: client.id,
      displayName: client.name || maskCustomerId(customerId),
      customerId,
      maskedCustomerId: maskCustomerId(customerId),
      ...(client.slug ? { clientSlug: client.slug } : {}),
      source: "client",
      active: client.isActive !== false,
      managed,
      ...conversionSettings,
    });
  }

  return Array.from(byCustomerId.values()).sort((a, b) => a.displayName.localeCompare(b.displayName));
}

function conversionSettingsForClient(client: ClientAccountRecord | undefined): Pick<PortfolioAccount, "conversionActions" | "conversionActionCategories"> {
  if (!client) return {};
  const categories = conversionActionCategoriesForClient(client);
  const actions = conversionActionsForClient(client);
  return {
    ...(actions ? { conversionActions: actions } : {}),
    ...(categories ? { conversionActionCategories: categories } : {}),
  };
}

function conversionActionsForClient(client: ClientAccountRecord): string {
  const actions = new Set<string>();
  const configured = Array.isArray(client.conversionActionCategories) ? client.conversionActionCategories : [];
  for (const category of configured) {
    addDelimitedActions(actions, category?.actions);
  }
  addDelimitedActions(actions, client.dashboardConversionActions);
  addDelimitedActions(actions, client.phoneCallConversionActions);
  addDelimitedActions(actions, client.formSubmitConversionActions);
  return Array.from(actions).join(",");
}

function conversionActionCategoriesForClient(client: ClientAccountRecord): string {
  const categories: Array<{ label: string; color: string; actions: string[] }> = [];
  const configured = Array.isArray(client.conversionActionCategories) ? client.conversionActionCategories : [];
  for (const category of configured) {
    const label = String(category?.label ?? "").trim();
    const actions = splitActions(category?.actions);
    if (label && actions.length > 0) {
      categories.push({ label, color: String(category?.color ?? "sky"), actions });
    }
  }
  if (categories.length === 0) {
    const phone = splitActions(client.phoneCallConversionActions);
    const form = splitActions(client.formSubmitConversionActions);
    if (phone.length > 0) categories.push({ label: "Phone Calls", color: "sky", actions: phone });
    if (form.length > 0) categories.push({ label: "Form Submits", color: "violet", actions: form });
  }
  return categories.length > 0 ? JSON.stringify(categories) : "";
}

function addDelimitedActions(target: Set<string>, raw: unknown): void {
  for (const action of splitActions(raw)) target.add(action);
}

function splitActions(raw: unknown): string[] {
  return String(raw ?? "")
    .split(/[\r\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}
