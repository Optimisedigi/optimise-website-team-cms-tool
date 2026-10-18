/**
 * Monthly Sales vs Costs from Xero, read through Growth Tools
 * (`GET /api/xero/finance/monthly`). All figures are ex-GST and use the
 * account each line was coded to in Xero, so nothing needs re-categorising.
 */

import { z } from "zod";
import { isMonthKey, monthKeysBetween } from "@/lib/finance/periods";

/** Inclusive YYYY-MM window, e.g. a financial year. */
export interface MonthRange {
  from: string;
  to: string;
}

const xeroMonthSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
  invoiced: z.number(),
  received: z.number(),
  costs: z.number(),
  costsByAccount: z.array(z.object({ account: z.string(), amount: z.number() })),
});

const xeroSummarySchema = z.object({
  months: z.array(xeroMonthSchema),
  fetchedAt: z.string(),
});

export type XeroFinanceMonth = z.infer<typeof xeroMonthSchema>;
export type XeroFinanceSummary = z.infer<typeof xeroSummarySchema>;

/** Why Xero figures aren't available; the UI explains each case. */
export type XeroUnavailableReason =
  | "not_configured" // GROWTH_TOOLS_URL / INTERNAL_API_KEY missing
  | "not_deployed" // Growth Tools doesn't have the endpoint yet
  | "not_connected" // Xero not authorised in Growth Tools
  | "scope_missing" // Xero must be reconnected for bank transactions/payments
  | "error";

export type XeroFinanceResult =
  | { ok: true; data: XeroFinanceSummary }
  | { ok: false; reason: XeroUnavailableReason };

export async function fetchXeroMonthlyFinance(
  range: MonthRange,
  options: {
    signal?: AbortSignal;
    /** Always applied, also when `signal` is given (default 25s). */
    timeoutMs?: number;
    env?: Record<string, string | undefined>;
    fetchImpl?: typeof fetch;
  } = {},
): Promise<XeroFinanceResult> {
  const env = options.env ?? process.env;
  const baseUrl = env.GROWTH_TOOLS_URL;
  const key = env.INTERNAL_API_KEY;
  if (!baseUrl || !key) return { ok: false, reason: "not_configured" };
  if (!isMonthKey(range.from) || !isMonthKey(range.to) || range.from > range.to) {
    throw new Error(`fetchXeroMonthlyFinance: invalid range ${range.from}..${range.to}`);
  }

  const doFetch = options.fetchImpl ?? fetch;
  const qs = new URLSearchParams({ from: range.from, to: range.to });
  try {
    const res = await doFetch(`${baseUrl}/api/xero/finance/monthly?${qs.toString()}`, {
      headers: { "x-internal-key": key },
      cache: "no-store",
      signal: options.signal
        ? AbortSignal.any([options.signal, AbortSignal.timeout(options.timeoutMs ?? 25_000)])
        : AbortSignal.timeout(options.timeoutMs ?? 25_000),
    });
    if (res.status === 404) return { ok: false, reason: "not_deployed" };
    if (res.status === 409) {
      const body: unknown = await res.json().catch(() => null);
      const code = typeof body === "object" && body !== null ? (body as { code?: unknown }).code : undefined;
      return { ok: false, reason: code === "XERO_SCOPE_MISSING" ? "scope_missing" : "not_connected" };
    }
    if (!res.ok) return { ok: false, reason: "error" };
    // Growth Tools serves its web app (HTML, 200) for unknown paths, so an
    // HTML answer means the finance endpoint isn't deployed yet.
    if (!(res.headers.get("content-type") ?? "").includes("application/json")) {
      return { ok: false, reason: "not_deployed" };
    }

    const parsed = xeroSummarySchema.safeParse(await res.json());
    if (!parsed.success) {
      console.warn("[xero-finance] Unexpected response shape", parsed.error.issues.slice(0, 3));
      return { ok: false, reason: "error" };
    }
    // An older Growth Tools ignores from/to and returns a rolling window:
    // never present those months as the requested period.
    const returned = new Set(parsed.data.months.map((m) => m.month));
    const missing = monthKeysBetween(range.from, range.to).filter((m) => !returned.has(m));
    if (missing.length > 0) {
      console.warn("[xero-finance] Response does not cover the requested range", { range, missing: missing.slice(0, 3) });
      return { ok: false, reason: "not_deployed" };
    }
    const wanted = new Set(monthKeysBetween(range.from, range.to));
    return { ok: true, data: { ...parsed.data, months: parsed.data.months.filter((m) => wanted.has(m.month)) } };
  } catch (error) {
    console.warn("[xero-finance] Request failed", error instanceof Error ? error.message : error);
    return { ok: false, reason: "error" };
  }
}
