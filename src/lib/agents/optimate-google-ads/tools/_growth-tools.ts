/**
 * Tiny shared helper for Growth Tools HTTP calls used by Optimate-Google-Ads
 * tools. Centralises base URL, internal-key header, timeout and error-shape so
 * each tool stays a thin wrapper.
 */

function growthToolsUrl(): string {
  return process.env.GROWTH_TOOLS_URL || "http://localhost:5000";
}

function internalApiKey(): string {
  return process.env.INTERNAL_API_KEY || "";
}

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

export type GrowthToolsMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface GrowthToolsActionMetadata {
  agentRunId?: string;
  clientId?: string | number;
  auditId?: string | number;
  userId?: string | number;
  source?: "optimax";
}

export async function growthToolsGet<T>(
  pathWithQuery: string,
  timeoutMs = 45_000,
): Promise<GrowthToolsResult<T>> {
  return growthToolsRequest<T>({ method: "GET", path: pathWithQuery, timeoutMs });
}

export async function growthToolsPost<T>(
  path: string,
  body: Record<string, unknown>,
  timeoutMs = 45_000,
): Promise<GrowthToolsResult<T>> {
  return growthToolsRequest<T>({ method: "POST", path, body, timeoutMs });
}

export async function growthToolsRequest<T>(options: {
  method: GrowthToolsMethod;
  path: string;
  body?: Record<string, unknown>;
  timeoutMs?: number;
  metadata?: GrowthToolsActionMetadata;
}): Promise<GrowthToolsResult<T>> {
  const { method, path, timeoutMs = 45_000, metadata } = options;
  const body = options.body && metadata
    ? { ...options.body, ...metadata, source: metadata.source ?? "optimax" }
    : options.body;
  const key = internalApiKey();
  if (!key) {
    return { ok: false, error: "INTERNAL_API_KEY is not configured on this CMS instance" };
  }
  const url = `${growthToolsUrl()}${path}`;
  try {
    const r = await fetch(url, {
      method,
      headers: {
        "x-internal-key": key,
        ...(body ? { "content-type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await r.text().catch(() => "");
    if (!r.ok) {
      return { ok: false, error: `Growth Tools ${r.status}: ${text.slice(0, 400)}` };
    }
    if (!text.trim()) {
      return { ok: true, data: undefined as T };
    }
    try {
      return { ok: true, data: JSON.parse(text) as T };
    } catch {
      return { ok: true, data: text as T };
    }
  } catch (err) {
    return { ok: false, error: `Growth Tools request failed: ${(err as Error).message}` };
  }
}

export function parseConversionActions(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  if (typeof value !== "string") return [];
  return value.split(/[\r\n,]+/).map((item) => item.trim()).filter(Boolean);
}

/** Map a tool's `days` arg to the Growth Tools `dateRange` enum it understands. */
export function daysToDateRange(days: number): string {
  if (days <= 7) return "LAST_7_DAYS";
  if (days <= 14) return "LAST_14_DAYS";
  if (days <= 30) return "LAST_30_DAYS";
  if (days <= 60) return "LAST_60_DAYS";
  return "LAST_90_DAYS";
}
