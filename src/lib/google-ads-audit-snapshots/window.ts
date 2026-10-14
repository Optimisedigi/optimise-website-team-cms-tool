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

/**
 * Optional fixed window used by milestone audits. `periodEnd` replaces the
 * default "end of last calendar month"; `periodStartFloor` narrows the start
 * to no earlier than this date (e.g. the campaign go-live date).
 */
export interface SnapshotWindowOverride {
  periodEnd?: string;
  periodStartFloor?: string;
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export async function discoverSnapshotWindow(customerId: string, requestedAt = new Date().toISOString(), auditContext: Partial<FrozenAuditContext> = {}, override: SnapshotWindowOverride = {}): Promise<SnapshotWindow> {
  if (override.periodEnd !== undefined && !ISO_DAY.test(override.periodEnd)) throw new Error("periodEnd override must be YYYY-MM-DD");
  if (override.periodStartFloor !== undefined && !ISO_DAY.test(override.periodStartFloor)) throw new Error("periodStartFloor override must be YYYY-MM-DD");
  const normalizedCustomerId = customerId.replace(/-/g, "");
  const account = await fetchMetadata(normalizedCustomerId);
  const periodEnd = override.periodEnd ?? previousCalendarMonthEnd(requestedAt, account.accountTimeZone);
  const activity = await fetchMetadata(normalizedCustomerId, periodEnd);
  const earliest = activity.earliestAvailableActivityDate;
  if (!ISO_DAY.test(earliest) || earliest > periodEnd) throw new Error("No valid Google Ads activity was available before the frozen period end");
  const periodStart = override.periodStartFloor && override.periodStartFloor > earliest ? override.periodStartFloor : earliest;
  if (periodStart > periodEnd) throw new Error("Snapshot window starts after it ends");
  return {
    requestedAt,
    periodStart,
    periodEnd,
    earliestAvailableActivityDate: earliest,
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
