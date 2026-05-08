/**
 * Tiny shared helper for Growth Tools HTTP calls used by Optimate-Google-Ads
 * tools. Centralises base URL, internal-key header, timeout and error-shape so
 * each tool stays a thin wrapper.
 */

const GROWTH_TOOLS_URL = process.env.GROWTH_TOOLS_URL || "http://localhost:5000";
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || "";

export interface GrowthToolsResult<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

export function ensureCustomerId(raw: unknown): string {
  if (typeof raw !== "string" || !raw.trim()) {
    throw new Error("customerId not present on agent context");
  }
  // Google Ads API accepts dashed or undashed; we standardise on undashed for
  // the Growth Tools layer (matches how every other CMS caller does it).
  return raw.replace(/-/g, "");
}

export async function growthToolsGet<T>(
  pathWithQuery: string,
  timeoutMs = 45_000,
): Promise<GrowthToolsResult<T>> {
  if (!INTERNAL_API_KEY) {
    return { ok: false, error: "INTERNAL_API_KEY is not configured on this CMS instance" };
  }
  const url = `${GROWTH_TOOLS_URL}${pathWithQuery}`;
  try {
    const r = await fetch(url, {
      headers: { "x-internal-key": INTERNAL_API_KEY },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!r.ok) {
      const text = await r.text().catch(() => "");
      return { ok: false, error: `Growth Tools ${r.status}: ${text.slice(0, 400)}` };
    }
    const json = (await r.json()) as T;
    return { ok: true, data: json };
  } catch (err) {
    return { ok: false, error: `Growth Tools request failed: ${(err as Error).message}` };
  }
}

/** Map a tool's `days` arg to the Growth Tools `dateRange` enum it understands. */
export function daysToDateRange(days: number): string {
  if (days <= 7) return "LAST_7_DAYS";
  if (days <= 14) return "LAST_14_DAYS";
  if (days <= 30) return "LAST_30_DAYS";
  if (days <= 60) return "LAST_60_DAYS";
  return "LAST_90_DAYS";
}
