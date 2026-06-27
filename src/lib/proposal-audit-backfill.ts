// Shared helpers for client proposal audit and targeted backfill routes.

const MULTI_PART_TLDS = new Set([
  "co.uk", "org.uk", "ac.uk", "co.nz", "co.za", "com.au", "org.au", "net.au",
  "co.in", "co.jp", "co.kr", "com.br", "com.mx", "com.sg", "com.hk", "com.tw",
  "co.il", "co.th", "or.jp", "ne.jp", "org.nz", "com.ar", "com.co", "com.vn",
]);

export function normaliseDomain(domain: string): string {
  return domain.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
}

// SimilarWeb only tracks root domains, not subdomains.
// e.g. "my.clevelandclinic.org" → "clevelandclinic.org"
// Handles multi-part TLDs like .org.au, .co.uk, .com.au
export function extractRootDomain(domain: string): string {
  const clean = normaliseDomain(domain);
  const parts = clean.split(".");
  if (parts.length <= 2) return clean;

  const lastTwo = parts.slice(-2).join(".");
  if (MULTI_PART_TLDS.has(lastTwo)) {
    return parts.slice(-3).join(".");
  }

  return parts.slice(-2).join(".");
}

// Traffic endpoint returns monthlyVisits as an array of {month, visits} objects.
// Extract the latest month's visits, or fall back to averageMonthlyVisits.
export function extractMonthlyVisits(td: unknown): number | null {
  if (!td || typeof td !== "object") return null;
  const trafficData = td as any;
  if (typeof trafficData.averageMonthlyVisits === "number") return trafficData.averageMonthlyVisits;
  if (Array.isArray(trafficData.monthlyVisits) && trafficData.monthlyVisits.length > 0) {
    const last = trafficData.monthlyVisits[trafficData.monthlyVisits.length - 1];
    return typeof last === "number" ? last : last?.visits ?? null;
  }
  if (typeof trafficData.monthlyVisits === "number") return trafficData.monthlyVisits;
  if (typeof trafficData.estimatedMonthlyVisits === "number") return trafficData.estimatedMonthlyVisits;
  return null;
}

export function hasValue(value: unknown): boolean {
  if (value == null) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  if (typeof value === "string") return value.trim().length > 0;
  return true;
}

export type TrafficUnavailableReason = "blocked" | "not_enough_data" | "failed" | "timeout" | "invalid_domain";

export type FormattedTraffic = {
  monthlyVisits: number | null;
  globalRank: any;
  categoryRank: any;
  sources: any;
  status?: "available" | "unavailable";
  unavailableReason?: TrafficUnavailableReason | string | null;
  cacheStatus?: "fresh" | "stale" | string | null;
};

export function explicitUnavailableTraffic(reason: TrafficUnavailableReason | string = "failed"): FormattedTraffic {
  return {
    monthlyVisits: null,
    globalRank: null,
    categoryRank: null,
    sources: null,
    status: "unavailable",
    unavailableReason: reason,
  };
}

export function isTrafficUnavailable(profile: unknown): boolean {
  return (profile as any)?.traffic?.status === "unavailable";
}

export function hasTrafficCoverage(profile: unknown): boolean {
  const traffic = (profile as any)?.traffic;
  return typeof traffic?.monthlyVisits === "number" || traffic?.status === "unavailable";
}

export function trafficDisplayValue(raw: unknown): string {
  const traffic = raw as any;
  if (traffic?.status === "unavailable") return "Traffic unavailable";
  if (typeof traffic?.monthlyVisits === "number") return traffic.monthlyVisits.toLocaleString();
  return "Traffic unavailable";
}

export function formatTraffic(trafficData: any): FormattedTraffic {
  if (!trafficData || trafficData?.status === "unavailable") {
    return explicitUnavailableTraffic(trafficData?.unavailableReason ?? "failed");
  }

  const monthlyVisits = extractMonthlyVisits(trafficData);
  if (monthlyVisits === null) {
    return explicitUnavailableTraffic(trafficData?.unavailableReason ?? "failed");
  }

  return {
    monthlyVisits,
    globalRank: trafficData?.globalRank ?? null,
    categoryRank: trafficData?.categoryRank ?? null,
    sources: trafficData?.sources ?? trafficData?.trafficSources ?? null,
    status: "available",
    unavailableReason: trafficData?.unavailableReason ?? null,
    cacheStatus: trafficData?.cacheStatus ?? null,
  };
}
