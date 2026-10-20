import type { CanonicalTool } from "@/lib/agents/_shared/tool";
import { ensureCustomerId, growthToolsRequest } from "./_growth-tools";

/** Rows the model may ask for; Growth Tools caps at the same number. */
const MAX_LIMIT = 2000;
const DEFAULT_LIMIT = 200;
/** Result text handed to the model. Larger results keep their first rows and say so. */
export const QUERY_RESULT_MAX_CHARS = 60_000;

interface GoogleAdsQueryArgs {
  query: string;
  limit?: number;
  reason?: string;
}

interface QueryResponse {
  rows?: unknown[];
  rowCount?: number;
  truncated?: boolean;
}

/** Keep leading rows until the JSON fits the model's budget. */
export function fitRows(rows: unknown[], maxChars: number): { rows: unknown[]; trimmed: boolean } {
  if (JSON.stringify(rows).length <= maxChars) return { rows, trimmed: false };
  let low = 0;
  let high = rows.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (JSON.stringify(rows.slice(0, mid)).length <= maxChars) low = mid;
    else high = mid - 1;
  }
  return { rows: rows.slice(0, low), trimmed: true };
}

export const googleAdsQuery: CanonicalTool<GoogleAdsQueryArgs> = {
  name: "google_ads_query",
  description:
    "Run a read-only GAQL SELECT against the selected client's Google Ads account, for any resource or field no other tool covers: bid strategies, audiences, ad schedules, location targets, quality score components, asset settings, change_event history and so on. Always on the selected client; never pass a customer ID. Add a LIMIT and only the fields you need. Returns up to `limit` rows (default 200, max 2000) and says when results were cut.",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "A GAQL SELECT statement, e.g. SELECT campaign.id, campaign.name, campaign.bidding_strategy_type FROM campaign WHERE campaign.status = 'ENABLED'" },
      limit: { type: "integer", minimum: 1, maximum: MAX_LIMIT },
      reason: { type: "string", maxLength: 300, description: "Why this query is needed." },
    },
    required: ["query"],
    additionalProperties: false,
  },
  validate(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("input must be an object");
    const input = raw as Record<string, unknown>;
    const query = typeof input.query === "string" ? input.query.trim() : "";
    if (!/^SELECT\b/i.test(query)) throw new Error("query must be a GAQL SELECT statement");
    if (query.length > 100_000) throw new Error("query must be at most 100,000 characters");
    let limit: number | undefined;
    if (input.limit !== undefined) {
      const n = Number(input.limit);
      if (!Number.isInteger(n) || n < 1 || n > MAX_LIMIT) throw new Error(`limit must be an integer from 1 to ${MAX_LIMIT}`);
      limit = n;
    }
    return {
      query,
      ...(limit !== undefined ? { limit } : {}),
      ...(typeof input.reason === "string" && input.reason.trim() ? { reason: input.reason.trim() } : {}),
    };
  },
  async execute(args, ctx) {
    let customerId: string;
    try {
      customerId = ensureCustomerId(ctx.context.customerId);
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
    const result = await growthToolsRequest<QueryResponse>({
      method: "POST",
      path: "/api/google-ads/query",
      body: { customerId, query: args.query, limit: args.limit ?? DEFAULT_LIMIT },
      timeoutMs: 60_000,
    });
    if (!result.ok) return { ok: false, error: result.error };
    const rows = Array.isArray(result.data?.rows) ? result.data.rows : [];
    const fitted = fitRows(rows, QUERY_RESULT_MAX_CHARS);
    const limitHit = result.data?.truncated === true;
    return {
      ok: true,
      data: {
        rowCount: fitted.rows.length,
        rows: fitted.rows,
        ...(limitHit || fitted.trimmed
          ? {
              note: `Showing the first ${fitted.rows.length} rows only${limitHit ? " (row limit reached)" : ""}${fitted.trimmed ? " (cut to fit; select fewer fields or add filters)" : ""}. Do not present these as complete.`,
            }
          : {}),
      },
    };
  },
};
