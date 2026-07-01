import { getPayload } from "payload";
import config from "@/payload.config";
import type { CanonicalTool } from "@/lib/agents/_shared/tool";
import {
  GOOGLE_ADS_EMAIL_COMPONENT_KEYS,
  renderGoogleAdsEmailComponentsHtml,
  type GoogleAdsEmailComponentKey,
  type GoogleAdsEmailComponentsData,
} from "@/lib/google-ads-email-components";
import { buildMonthlyWasteRelevancyResponse, warmMonthlyWasteRelevancyForClient } from "@/lib/monthly-waste-relevancy-warmer";
import { ensureCustomerId, growthToolsGet, parseConversionActions } from "./_growth-tools";
import { customerKey, loadPortfolioAccounts, type PortfolioAccount } from "./_portfolio-accounts";

export interface DashboardEmailComponentsArgs {
  components: GoogleAdsEmailComponentKey[];
  months?: number;
  endMonth?: string;
  range?: string;
  auditId?: number | string;
}

interface QualityTrendRaw {
  month?: string;
  qualityScore?: number | null;
  creativeQuality?: number | null;
  searchPredictedCtr?: number | null;
  landingPageQuality?: number | null;
}

interface QualityScoresEnvelope {
  qualityTrend?: QualityTrendRaw[];
}

interface MetricRaw {
  cost?: number;
  spend?: number;
  conversions?: number;
}

interface MetricsEnvelope {
  metrics?: MetricRaw[];
}

interface SearchTermRaw {
  searchTerm?: string;
  query?: string;
  campaignName?: string;
  cost?: number;
  spend?: number;
  clicks?: number;
  impressions?: number;
  conversions?: number;
}

interface SearchTermsEnvelope {
  searchTerms?: SearchTermRaw[];
  terms?: SearchTermRaw[];
}

const MAX_MONTHS = 12;
const DEFAULT_MONTHS = 6;
const DEFAULT_RANGE = "LAST_30_DAYS";
const SUPPORTED_COMPONENTS = new Set<GoogleAdsEmailComponentKey>(GOOGLE_ADS_EMAIL_COMPONENT_KEYS);

export const getDashboardEmailComponents: CanonicalTool<DashboardEmailComponentsArgs> = {
  name: "get_dashboard_email_components",
  description:
    "Returns ordered Gmail-safe OptiMate dashboard component HTML for monthly Google Ads budget emails. Use when the user selects monthly email components/chips: keyword_relevancy, cpa_trend, quality_score, or top_converters. Insert returned html before get_budget_management_email's canonical budget tracker. Missing data returns warnings and never invents metrics.",
  inputSchema: {
    type: "object",
    properties: {
      components: {
        type: "array",
        items: { type: "string", enum: GOOGLE_ADS_EMAIL_COMPONENT_KEYS as unknown as string[] },
        minItems: 1,
        description: "Ordered dashboard component keys to render into Gmail-safe HTML.",
      },
      months: {
        type: "integer",
        minimum: 1,
        maximum: MAX_MONTHS,
        description: "Number of completed calendar months for keyword_relevancy, cpa_trend, and quality_score. Defaults to 6 and is clamped to 1..12.",
      },
      endMonth: {
        type: "string",
        description: "Optional YYYY-MM final month for completed-month trend components. Defaults to previous completed calendar month.",
      },
      range: {
        type: "string",
        description: "Growth Tools date range for KPI/search-term/campaign blocks. Defaults to LAST_30_DAYS.",
      },
      auditId: {
        type: ["string", "number"],
        description: "Optional audit/account ref for portfolio-mode prompts. Audit-mode chats use context.",
      },
    },
    required: ["components"],
    additionalProperties: false,
  },
  validate(raw) {
    const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    if (!Array.isArray(obj.components) || obj.components.length === 0) {
      throw new Error(`components is required and must include one or more of: ${GOOGLE_ADS_EMAIL_COMPONENT_KEYS.join(", ")}`);
    }

    const components: GoogleAdsEmailComponentKey[] = [];
    const seen = new Set<GoogleAdsEmailComponentKey>();
    for (const item of obj.components) {
      if (typeof item !== "string" || !SUPPORTED_COMPONENTS.has(item as GoogleAdsEmailComponentKey)) {
        throw new Error(`Unknown component "${String(item)}". Valid: ${GOOGLE_ADS_EMAIL_COMPONENT_KEYS.join(", ")}`);
      }
      const key = item as GoogleAdsEmailComponentKey;
      if (!seen.has(key)) {
        seen.add(key);
        components.push(key);
      }
    }

    const out: DashboardEmailComponentsArgs = { components };
    if (obj.months !== undefined && obj.months !== null) {
      const months = Number(obj.months);
      if (!Number.isFinite(months) || months < 1) throw new Error("months must be a positive integer");
      out.months = clamp(Math.floor(months), 1, MAX_MONTHS);
    }
    if (obj.endMonth !== undefined && obj.endMonth !== null && String(obj.endMonth).trim()) {
      const endMonth = String(obj.endMonth).trim();
      if (!/^\d{4}-\d{2}$/.test(endMonth)) throw new Error("endMonth must be YYYY-MM when provided");
      out.endMonth = endMonth;
    }
    if (obj.range !== undefined && obj.range !== null && String(obj.range).trim()) {
      out.range = String(obj.range).trim();
    }
    if (obj.auditId !== undefined && obj.auditId !== null && obj.auditId !== "") {
      if (typeof obj.auditId !== "string" && typeof obj.auditId !== "number") throw new Error("auditId must be a string or number when provided");
      out.auditId = obj.auditId;
    }
    return out;
  },
  async execute(args, ctx) {
    const resolvedAccount = await resolveAccountContext(args, ctx.context);
    if (!resolvedAccount.ok) return { ok: false, error: resolvedAccount.error };

    const warnings: string[] = [];
    const data: GoogleAdsEmailComponentsData = { unavailable: {} };
    const range = args.range ?? DEFAULT_RANGE;
    const customerId = resolvedAccount.customerId;
    const conversionActions = resolvedAccount.conversionActions;
    const conversionActionCategories = resolvedAccount.conversionActionCategories;

    if (args.components.includes("keyword_relevancy")) {
      const relevancy = await fetchKeywordRelevancy(resolvedAccount, args.months ?? DEFAULT_MONTHS, args.endMonth);
      if (relevancy.ok) {
        data.keywordRelevancyTrend = relevancy.rows;
      } else {
        warnings.push(relevancy.error);
        data.unavailable!.keyword_relevancy = relevancy.error;
      }
    }

    if (args.components.includes("cpa_trend")) {
      const cpa = await fetchCpaTrend(customerId, args.months ?? DEFAULT_MONTHS, conversionActions, args.endMonth);
      if (cpa.ok) {
        data.cpaTrend = cpa.rows;
      } else {
        warnings.push(cpa.error);
        data.unavailable!.cpa_trend = cpa.error;
      }
    }

    if (args.components.includes("quality_score")) {
      const quality = await fetchQualityScore(resolvedAccount, args.months ?? DEFAULT_MONTHS, args.endMonth);
      if (quality.ok) {
        data.qualityScore = quality.summary;
      } else {
        warnings.push(quality.error);
        data.unavailable!.quality_score = quality.error;
      }
    }

    const needsSearchTerms = args.components.some((key) => key === "top_converters");
    if (needsSearchTerms) {
      const terms = await fetchSearchTerms(customerId, range, conversionActions, conversionActionCategories);
      if (terms.ok) {
        data.topConverters = terms.rows
          .filter((row) => Number(row.conversions ?? 0) > 0)
          .sort((a, b) => Number(b.conversions ?? 0) - Number(a.conversions ?? 0))
          .slice(0, 8);
      } else {
        warnings.push(terms.error);
        data.unavailable!.top_converters = terms.error;
      }
    }

    const html = renderGoogleAdsEmailComponentsHtml(args.components, data);
    return {
      ok: true,
      data: {
        html,
        components: args.components,
        warnings,
        sourceSummary: {
          keywordRelevancy: args.components.includes("keyword_relevancy") ? "CMS monthly waste/relevancy cache" : null,
          cpaTrend: args.components.includes("cpa_trend") ? "Growth Tools campaign-budgets/get-metrics, one request per completed calendar month" : null,
          qualityScore: args.components.includes("quality_score") ? "Growth Tools dashboard quality-scores" : null,
          searchTerms: needsSearchTerms ? `Growth Tools search-terms for ${range}` : null,
          auditId: resolvedAccount.auditId ?? null,
          conversionActionsApplied: conversionActions || null,
        },
      },
    };
  },
};

type ResolvedDashboardAccount = {
  customerId: string;
  auditId?: string | number;
  clientId?: string | number;
  clientSlug?: string;
  conversionActions: string;
  conversionActionCategories: string;
};

async function fetchKeywordRelevancy(account: ResolvedDashboardAccount, months: number, endMonth?: string): Promise<{ ok: true; rows: NonNullable<GoogleAdsEmailComponentsData["keywordRelevancyTrend"]> } | { ok: false; error: string }> {
  if (!account.clientId || !account.clientSlug) {
    return { ok: false, error: "Keyword relevancy needs a linked CMS client and dashboard slug for this account." };
  }
  const payload = await getPayload({ config });
  const result = await warmMonthlyWasteRelevancyForClient(
    payload,
    Number(account.clientId),
    account.customerId,
    account.clientSlug,
    clamp(months, 1, MAX_MONTHS),
  );
  const built = buildMonthlyWasteRelevancyResponse(result);
  const rows = built.monthly
    .filter((row) => !endMonth || row.month <= endMonth)
    .slice(-clamp(months, 1, MAX_MONTHS))
    .map((row) => {
      const nonBrandSpend = Math.max(0, row.totalSpend - row.brandSpend);
      const denominator = nonBrandSpend > 0 ? nonBrandSpend : row.totalSpend;
      const value = denominator > 0 ? Math.max(0, Math.min(100, 100 - (row.irrelevantSpend / denominator) * 100)) : null;
      return { label: monthLabel(row.month), value: value === null ? null : round2(value) };
    });
  return { ok: true, rows };
}

async function fetchCpaTrend(customerId: string, months: number, conversionActions: string, endMonth?: string): Promise<{ ok: true; rows: NonNullable<GoogleAdsEmailComponentsData["cpaTrend"]> } | { ok: false; error: string }> {
  const monthKeys = completedMonthKeys(clamp(months, 1, MAX_MONTHS), endMonth);
  const rows: NonNullable<GoogleAdsEmailComponentsData["cpaTrend"]> = [];
  for (const month of monthKeys) {
    const res = await fetchMetrics(customerId, `${month}-01,${lastDayOfMonth(month)}`, conversionActions);
    if (!res.ok) return res;
    const totals = sumCpaMetrics(res.rows);
    rows.push({ label: monthLabel(month), value: totals.cpa });
  }
  return { ok: true, rows };
}

async function fetchMetrics(customerId: string, dateRange: string, conversionActions: string): Promise<{ ok: true; rows: MetricRaw[] } | { ok: false; error: string }> {
  const qs = new URLSearchParams({ customerId, dateRange });
  if (conversionActions) qs.set("conversionActions", conversionActions);
  const res = await growthToolsGet<MetricsEnvelope>(`/api/google-ads/campaign-budgets/get-metrics?${qs.toString()}`);
  if (!res.ok) return { ok: false, error: res.error ?? "Growth Tools metrics call failed" };
  return { ok: true, rows: res.data?.metrics ?? [] };
}

function sumCpaMetrics(rows: MetricRaw[]): { cpa: number | null } {
  let spend = 0;
  let conversions = 0;
  for (const row of rows) {
    spend += Number(row.cost ?? row.spend ?? 0);
    conversions += Number(row.conversions ?? 0);
  }
  return { cpa: conversions > 0 ? round2(spend / conversions) : null };
}

async function fetchQualityScore(account: ResolvedDashboardAccount, months: number, endMonth?: string): Promise<{ ok: true; summary: NonNullable<GoogleAdsEmailComponentsData["qualityScore"]> } | { ok: false; error: string }> {
  if (!account.clientSlug) {
    return { ok: false, error: "Quality Score needs a linked CMS client dashboard slug for this account." };
  }
  const qs = new URLSearchParams({ customerId: account.customerId, range: "last_6_months" });
  const res = await growthToolsGet<QualityScoresEnvelope>(`/api/google-ads/dashboard/${encodeURIComponent(account.clientSlug)}/quality-scores?${qs.toString()}`);
  if (!res.ok) return { ok: false, error: res.error ?? "Growth Tools quality score call failed" };
  const completedTrend = (res.data?.qualityTrend ?? []).filter((row) => !endMonth || String(row.month ?? "") <= endMonth);
  const trend = completedTrend
    .slice(-clamp(months, 1, MAX_MONTHS))
    .map((row) => ({ label: monthLabel(String(row.month ?? "")), value: row.qualityScore ?? null }));
  const latest = [...completedTrend].reverse().find((row) => row.qualityScore !== null && row.qualityScore !== undefined) ?? completedTrend.at(-1);
  return {
    ok: true,
    summary: {
      latestQualityScore: latest?.qualityScore ?? null,
      latestMonth: latest?.month ? monthLabel(latest.month) : null,
      creativeQuality: latest?.creativeQuality ?? null,
      searchPredictedCtr: latest?.searchPredictedCtr ?? null,
      landingPageQuality: latest?.landingPageQuality ?? null,
      trend,
    },
  };
}

async function fetchSearchTerms(customerId: string, dateRange: string, conversionActions: string, conversionActionCategories: string): Promise<{ ok: true; rows: NonNullable<GoogleAdsEmailComponentsData["topConverters"]> } | { ok: false; error: string }> {
  const qs = new URLSearchParams({ customerId, dateRange, limit: "100" });
  if (conversionActions) qs.set("conversionActions", conversionActions);
  if (conversionActionCategories) qs.set("conversionActionCategories", conversionActionCategories);
  const res = await growthToolsGet<SearchTermsEnvelope>(`/api/google-ads/search-terms?${qs.toString()}`);
  if (!res.ok) return { ok: false, error: res.error ?? "Growth Tools search terms call failed" };
  const raw = res.data?.searchTerms ?? res.data?.terms ?? [];
  const rows = raw.map((row) => {
    const spend = Number(row.cost ?? row.spend ?? 0);
    const conversions = Number(row.conversions ?? 0);
    return {
      term: String(row.searchTerm ?? row.query ?? "").trim(),
      campaignName: String(row.campaignName ?? "").trim(),
      spend: round2(spend),
      clicks: Number(row.clicks ?? 0),
      impressions: Number(row.impressions ?? 0),
      conversions: round2(conversions),
      cpa: conversions > 0 ? round2(spend / conversions) : null,
    };
  }).filter((row) => row.term.length > 0);
  return { ok: true, rows };
}

async function resolveAccountContext(
  args: DashboardEmailComponentsArgs,
  context: Record<string, unknown>,
): Promise<
  | { ok: true; customerId: string; auditId?: string | number; clientId?: string | number; clientSlug?: string; conversionActions: string; conversionActionCategories: string }
  | { ok: false; error: string }
> {
  if (typeof context.customerId === "string" && context.customerId.trim()) {
    return {
      ok: true,
      customerId: customerKey(context.customerId),
      auditId: args.auditId ?? (context.auditId as string | number | undefined),
      clientId: context.clientId as string | number | undefined,
      clientSlug: typeof context.clientSlug === "string" ? context.clientSlug : undefined,
      conversionActions: parseConversionActions(context.conversionActions).join(","),
      conversionActionCategories: (context.conversionActionCategories as string | undefined) ?? "",
    };
  }

  const selectedAccountRefs = Array.isArray(context.selectedAccountRefs)
    ? context.selectedAccountRefs.filter((ref): ref is string | number => typeof ref === "string" || typeof ref === "number")
    : [];
  const accountRef = args.auditId ?? (selectedAccountRefs.length === 1 ? selectedAccountRefs[0] : undefined);

  if (accountRef === undefined || accountRef === null || accountRef === "") {
    try {
      return {
        ok: true,
        customerId: ensureCustomerId(context.customerId),
        conversionActions: parseConversionActions(context.conversionActions).join(","),
        conversionActionCategories: (context.conversionActionCategories as string | undefined) ?? "",
      };
    } catch (err) {
      return { ok: false, error: `${(err as Error).message}; pass auditId/accountRef in portfolio mode.` };
    }
  }

  const account = await findPortfolioAccount(accountRef);
  if (!account) return { ok: false, error: `No Google Ads account found for auditId/accountRef ${String(accountRef)}.` };
  return {
    ok: true,
    customerId: customerKey(account.customerId),
    auditId: account.accountRef ?? accountRef,
    clientId: account.clientId,
    clientSlug: account.clientSlug,
    conversionActions: account.conversionActions ?? "",
    conversionActionCategories: account.conversionActionCategories ?? "",
  };

}

async function findPortfolioAccount(ref: string | number): Promise<PortfolioAccount | null> {
  const refText = String(ref);
  const accounts = await loadPortfolioAccounts();
  return accounts.find((account) =>
    (account.accountRef !== undefined && String(account.accountRef) === refText) ||
    (account.clientId !== undefined && String(account.clientId) === refText) ||
    customerKey(account.customerId) === refText.replace(/-/g, ""),
  ) ?? null;
}


function completedMonthKeys(count: number, endMonth?: string): string[] {
  const cursor = endMonth ? new Date(`${endMonth}-01T00:00:00Z`) : new Date();
  cursor.setUTCDate(1);
  if (!endMonth) cursor.setUTCMonth(cursor.getUTCMonth() - 1);
  cursor.setUTCMonth(cursor.getUTCMonth() - count + 1);
  const months: string[] = [];
  for (let i = 0; i < count; i += 1) {
    months.push(`${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, "0")}`);
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return months;
}

function lastDayOfMonth(month: string): string {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year ?? 1970, monthNumber ?? 1, 0));
  return `${month}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function monthLabel(month: string): string {
  const date = new Date(`${month}-01T00:00:00Z`);
  return date.toLocaleDateString("en-AU", { month: "long", year: "numeric", timeZone: "UTC" });
}


function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
