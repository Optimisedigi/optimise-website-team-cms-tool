/**
 * Typed read-only Google Ads tools for common account questions, all on the
 * selected client's account through existing internal Growth Tools routes.
 * growth_tools_read and google_ads_query can reach the same data; these exist
 * so the model finds the right report quickly. None of them change anything.
 */
import type { CanonicalTool, ToolResultPayload } from "@/lib/agents/_shared/tool";
import { ensureCustomerId, growthToolsRequest, type GrowthToolsMethod } from "./_growth-tools";
import { fitRows } from "./google-ads-query";

/** Result text handed to the model; larger results keep their first items. */
export const ACCOUNT_READ_MAX_CHARS = 60_000;
const CHANGE_HISTORY_MAX_DAYS = 30;
const DAY_MS = 86_400_000;

type JsonObject = Record<string, unknown>;

function asObject(raw: unknown): JsonObject {
  if (raw === undefined || raw === null) return {};
  if (typeof raw !== "object" || Array.isArray(raw)) throw new Error("input must be an object");
  return raw as JsonObject;
}

function optionalNumericId(value: unknown, label: string): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const id = String(value).trim();
  if (!/^\d+$/.test(id)) throw new Error(`${label} must be a numeric ID`);
  return id;
}

/**
 * Trims arrays (top-level, or the largest array fields of an object) until the
 * JSON fits the budget, and says what was cut.
 */
export function fitForModel(data: unknown, maxChars = ACCOUNT_READ_MAX_CHARS): { data: unknown; note?: string } {
  if (JSON.stringify(data ?? null).length <= maxChars) return { data };
  if (Array.isArray(data)) {
    const fitted = fitRows(data, maxChars);
    return { data: fitted.rows, note: `Showing the first ${fitted.rows.length} of ${data.length} items only.` };
  }
  if (data && typeof data === "object") {
    const copy: JsonObject = { ...(data as JsonObject) };
    const arrays = Object.entries(copy)
      .filter((entry): entry is [string, unknown[]] => Array.isArray(entry[1]))
      .sort(([a, x], [b, y]) => JSON.stringify(y).length - JSON.stringify(x).length || a.localeCompare(b));
    const cut: string[] = [];
    for (const [key, items] of arrays) {
      const excess = JSON.stringify(copy).length - maxChars;
      if (excess <= 0) break;
      const fitted = fitRows(items, Math.max(0, JSON.stringify(items).length - excess));
      copy[key] = fitted.rows;
      cut.push(`${key}: first ${fitted.rows.length} of ${items.length}`);
    }
    if (JSON.stringify(copy).length <= maxChars) {
      return { data: copy, note: `Trimmed to fit (${cut.join("; ")}). Do not present these as complete.` };
    }
  }
  return { data: null, note: "The result was too large to show. Use google_ads_query with fewer fields or filters." };
}

async function readGrowthTools(
  ctx: Parameters<CanonicalTool<unknown>["execute"]>[1],
  request: (customerId: string) => { method: GrowthToolsMethod; path: string; body?: JsonObject },
): Promise<ToolResultPayload> {
  let customerId: string;
  try {
    customerId = ensureCustomerId(ctx.context.customerId);
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
  const result = await growthToolsRequest<unknown>({ ...request(customerId), timeoutMs: 90_000 });
  if (!result.ok) return { ok: false, error: result.error };
  const fitted = fitForModel(result.data);
  return { ok: true, data: fitted.note ? { result: fitted.data, note: fitted.note } : { result: fitted.data } };
}

const noArgsSchema = { type: "object", properties: {}, additionalProperties: false };

export const getConversionActions: CanonicalTool<JsonObject> = {
  name: "get_conversion_actions",
  description:
    "List the selected client's Google Ads conversion actions: name, category, status, primary or secondary, counting and attribution settings. Use for conversion tracking setup questions.",
  inputSchema: noArgsSchema,
  validate: () => ({}),
  execute: (_args, ctx) =>
    readGrowthTools(ctx, (cid) => ({ method: "GET", path: `/api/google-ads/conversion-actions/${encodeURIComponent(cid)}` })),
};

interface ChangeHistoryArgs {
  startDay: string;
  endDay: string;
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function parseDay(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw new Error(`${label} must be a date in YYYY-MM-DD format`);
  }
  return value;
}

/** Builds the tool with an injectable clock for tests. */
export function createGetChangeHistoryTool(now: () => Date = () => new Date()): CanonicalTool<ChangeHistoryArgs> {
  return {
    name: "get_change_history",
    description:
      "Who changed what in the selected client's Google Ads account, and when (Google's change history: bids, budgets, statuses, keywords, ads, including Google's automated changes). Google keeps only the last 30 days. Pass days (1 to 30, default 7) or startDay/endDay (YYYY-MM-DD).",
    inputSchema: {
      type: "object",
      properties: {
        days: { type: "integer", minimum: 1, maximum: CHANGE_HISTORY_MAX_DAYS },
        startDay: { type: "string", description: "YYYY-MM-DD" },
        endDay: { type: "string", description: "YYYY-MM-DD, default today" },
      },
      additionalProperties: false,
    },
    validate(raw) {
      const input = asObject(raw);
      const today = isoDay(now());
      const earliest = isoDay(new Date(now().getTime() - CHANGE_HISTORY_MAX_DAYS * DAY_MS));
      let startDay: string;
      let endDay: string;
      if (input.startDay !== undefined || input.endDay !== undefined) {
        endDay = input.endDay === undefined ? today : parseDay(input.endDay, "endDay");
        startDay = input.startDay === undefined ? endDay : parseDay(input.startDay, "startDay");
      } else {
        const days = input.days === undefined ? 7 : Number(input.days);
        if (!Number.isInteger(days) || days < 1 || days > CHANGE_HISTORY_MAX_DAYS) {
          throw new Error(`days must be an integer from 1 to ${CHANGE_HISTORY_MAX_DAYS}`);
        }
        endDay = today;
        startDay = isoDay(new Date(now().getTime() - (days - 1) * DAY_MS));
      }
      if (startDay > endDay) throw new Error("startDay must be on or before endDay");
      if (endDay > today) throw new Error("endDay cannot be in the future");
      if (startDay < earliest) throw new Error(`Google keeps only the last ${CHANGE_HISTORY_MAX_DAYS} days of change history; startDay must be ${earliest} or later`);
      return { startDay, endDay };
    },
    execute: (args, ctx) =>
      readGrowthTools(ctx, (cid) => ({
        method: "GET",
        path: `/api/google-ads/change-events?${new URLSearchParams({ customerId: cid, startDay: args.startDay, endDay: args.endDay }).toString()}`,
      })),
  };
}

export const getChangeHistory = createGetChangeHistoryTool();

interface KeywordReportArgs {
  campaignId?: string;
  adGroupId?: string;
}

export const getKeywordReport: CanonicalTool<KeywordReportArgs> = {
  name: "get_keyword_report",
  description:
    "Keyword report for the selected client: each keyword with match type, status, quality score and performance. Optionally narrow to one campaign or ad group (numeric IDs).",
  inputSchema: {
    type: "object",
    properties: { campaignId: { type: "string" }, adGroupId: { type: "string" } },
    additionalProperties: false,
  },
  validate(raw) {
    const input = asObject(raw);
    const campaignId = optionalNumericId(input.campaignId, "campaignId");
    const adGroupId = optionalNumericId(input.adGroupId, "adGroupId");
    return { ...(campaignId ? { campaignId } : {}), ...(adGroupId ? { adGroupId } : {}) };
  },
  execute: (args, ctx) =>
    readGrowthTools(ctx, (cid) => ({ method: "POST", path: "/api/google-ads/report/keywords", body: { customerId: cid, ...args } })),
};

export const getQualitySnapshot: CanonicalTool<JsonObject> = {
  name: "get_quality_snapshot",
  description:
    "Quality score snapshot for the selected client: keyword quality scores and their components (expected CTR, ad relevance, landing page experience).",
  inputSchema: noArgsSchema,
  validate: () => ({}),
  execute: (_args, ctx) =>
    readGrowthTools(ctx, (cid) => ({ method: "POST", path: "/api/google-ads/quality-snapshot", body: { customerId: cid } })),
};

export const getBudgetAudit: CanonicalTool<JsonObject> = {
  name: "get_budget_audit",
  description:
    "Budget audit for the selected client: each campaign's budget, spend and whether it is limited by budget. Read-only; to change budgets use the budget tools.",
  inputSchema: noArgsSchema,
  validate: () => ({}),
  execute: (_args, ctx) =>
    readGrowthTools(ctx, (cid) => ({ method: "POST", path: "/api/google-ads/audit/budget", body: { customerId: cid } })),
};

interface AudienceArgs {
  userListId: string;
}

export const getAudience: CanonicalTool<AudienceArgs> = {
  name: "get_audience",
  description:
    "Details of one audience (user list / remarketing list) in the selected client's account, plus the campaigns and ad groups it is attached to. Find user list IDs with google_ads_query on user_list.",
  inputSchema: {
    type: "object",
    properties: { userListId: { type: "string", description: "Numeric user list ID" } },
    required: ["userListId"],
    additionalProperties: false,
  },
  validate(raw) {
    const userListId = optionalNumericId(asObject(raw).userListId, "userListId");
    if (!userListId) throw new Error("userListId is required");
    return { userListId };
  },
  async execute(args, ctx) {
    const query = (cid: string) => new URLSearchParams({ customerId: cid }).toString();
    const id = encodeURIComponent(args.userListId);
    const details = await readGrowthTools(ctx, (cid) => ({ method: "GET", path: `/api/google-ads/audiences/${id}?${query(cid)}` }));
    if (!details.ok) return details;
    const usage = await readGrowthTools(ctx, (cid) => ({ method: "GET", path: `/api/google-ads/audiences/${id}/usage?${query(cid)}` }));
    return {
      ok: true,
      data: {
        audience: details.data,
        usage: usage.ok ? usage.data : { error: usage.error },
      },
    };
  },
};
