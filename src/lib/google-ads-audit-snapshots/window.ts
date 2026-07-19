import type { FrozenAuditContext, SnapshotWindow } from "./types";

const GROWTH_TOOLS_URL = process.env.GROWTH_TOOLS_URL;
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;

function localDateParts(date: Date, timeZone: string): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  return { year: value("year"), month: value("month"), day: value("day") };
}

export function previousCalendarMonthEnd(requestedAt: string, accountTimeZone: string): string {
  const requested = new Date(requestedAt);
  if (Number.isNaN(requested.valueOf())) throw new Error("requestedAt must be an ISO timestamp");
  const { year, month } = localDateParts(requested, accountTimeZone);
  const end = new Date(Date.UTC(year, month - 1, 0));
  return end.toISOString().slice(0, 10);
}

async function fetchMetadata(customerId: string, periodEnd?: string): Promise<Record<string, string>> {
  if (!GROWTH_TOOLS_URL || !INTERNAL_API_KEY) throw new Error("Missing GROWTH_TOOLS_URL or INTERNAL_API_KEY");
  const response = await fetch(`${GROWTH_TOOLS_URL}/api/google-ads/audit-snapshot-metadata`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${INTERNAL_API_KEY}` },
    body: JSON.stringify({ customerId, periodEnd }),
  });
  if (!response.ok) throw new Error(`Google Ads metadata lookup failed (${response.status}): ${await response.text()}`);
  return response.json() as Promise<Record<string, string>>;
}

export async function discoverSnapshotWindow(customerId: string, requestedAt = new Date().toISOString(), auditContext: Partial<FrozenAuditContext> = {}): Promise<SnapshotWindow> {
  const normalizedCustomerId = customerId.replace(/-/g, "");
  const account = await fetchMetadata(normalizedCustomerId);
  const periodEnd = previousCalendarMonthEnd(requestedAt, account.accountTimeZone);
  const activity = await fetchMetadata(normalizedCustomerId, periodEnd);
  const periodStart = activity.earliestAvailableActivityDate;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(periodStart) || periodStart > periodEnd) throw new Error("No valid Google Ads activity was available before the frozen period end");
  return {
    requestedAt,
    periodStart,
    periodEnd,
    earliestAvailableActivityDate: periodStart,
    accountTimeZone: account.accountTimeZone,
    accountName: account.descriptiveName || `Customer ${normalizedCustomerId}`,
    currencyCode: account.currencyCode,
    retentionCaveat: activity.retentionCaveat,
    captureContext: {
      websiteUrl: auditContext.websiteUrl,
      businessName: auditContext.businessName || account.descriptiveName || `Customer ${normalizedCustomerId}`,
      businessType: auditContext.businessType,
      brandTerms: auditContext.brandTerms ?? [],
      conversionObjectives: auditContext.conversionObjectives ?? [],
      searchLocation: auditContext.searchLocation ?? "",
      searchLanguage: auditContext.searchLanguage ?? "",
      competitorSeedQueries: auditContext.competitorSeedQueries ?? [],
      schemaVersion: auditContext.schemaVersion ?? 3,
      rubricVersion: auditContext.rubricVersion ?? "2026-07-complete-evidence-v2",
    },
  };
}
