/**
 * Tool: get_keyword_ideas
 *
 * Wraps Growth Tools `POST /api/keyword-planner`, which calls the Google Ads
 * Keyword Planner (`:generateKeywordIdeas`) and then AI-categorises the ideas.
 *
 * Use ONLY when the user explicitly asks to run Keyword Planner / get keyword
 * ideas / search volumes for a set of seed keywords and/or a website URL. This
 * is NOT client-account-scoped: Keyword Planner ideas come from the Growth
 * Tools server's own configured Google Ads account, so the tool does not send
 * the selected client's customerId.
 *
 * At least one of `seedKeywords` or `websiteUrl` is required (upstream rejects
 * a request with neither). `categories` group the returned ideas; when omitted
 * we default to the seed keywords (or "General") so the call still succeeds.
 */

import type { CanonicalTool } from "@/lib/agents/_shared/tool";
import { growthToolsPost } from "./_growth-tools";

interface KeywordIdeasArgs {
  seedKeywords?: string;
  websiteUrl?: string;
  categories?: string;
  location?: string;
  language?: string;
}

interface KeywordIdeaRaw {
  keyword?: string;
  avgMonthlySearches?: number;
  competition?: string;
  competitionIndex?: number;
  lowCpc?: number;
  highCpc?: number;
  category?: string;
}

interface KeywordCategoryRaw {
  name?: string;
  keywords?: KeywordIdeaRaw[];
  totalVolume?: number;
}

interface KeywordPlannerEnvelope {
  categories?: KeywordCategoryRaw[];
  totalKeywords?: number;
  location?: string;
  websiteUrl?: string;
  seedKeywords?: string;
}

/** Accept either a comma/newline string or an array of strings; return a clean comma string. */
function toCommaString(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map(String).map((s) => s.trim()).filter(Boolean).join(", ");
  }
  if (typeof value === "string") {
    return value
      .split(/[\r\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .join(", ");
  }
  return "";
}

const MAX_KEYWORDS_RETURNED = 60;

export const getKeywordIdeas: CanonicalTool<KeywordIdeasArgs> = {
  name: "get_keyword_ideas",
  description:
    "Google Ads Keyword Planner: generate keyword ideas with average monthly search volumes, competition, and top-of-page CPC ranges from seed keywords and/or a website URL. Use ONLY when the user explicitly asks to run Keyword Planner or get keyword ideas / search volumes. Args: seedKeywords (comma-separated seed terms), websiteUrl (optional page to mine ideas from) — at least one is required; categories (optional comma-separated service groups to bucket ideas under; defaults to the seeds); location (optional country/geo, e.g. 'au', 'us', 'United Kingdom'; default 'au'); language (optional, e.g. 'en'). Ideas come from Optimise Digital's own Keyword Planner account, not the selected client's Google Ads account.",
  inputSchema: {
    type: "object",
    properties: {
      seedKeywords: {
        type: "string",
        description: "Comma-separated seed keywords to expand, e.g. 'emergency plumber, blocked drain, hot water repair'. Required unless websiteUrl is given.",
      },
      websiteUrl: {
        type: "string",
        description: "Optional website or landing-page URL to mine keyword ideas from. Required unless seedKeywords is given.",
      },
      categories: {
        type: "string",
        description: "Optional comma-separated service categories to bucket the returned ideas under, e.g. 'plumbing, drainage, hot water'. Defaults to the seed keywords when omitted.",
      },
      location: {
        type: "string",
        description: "Target location for search volumes: a country code ('au','us','gb') or name ('Australia'). Default 'au'.",
      },
      language: {
        type: "string",
        description: "Optional language code, e.g. 'en'.",
      },
    },
    additionalProperties: false,
  },
  validate(raw) {
    const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const seedKeywords = toCommaString(obj.seedKeywords);
    const websiteUrl = typeof obj.websiteUrl === "string" ? obj.websiteUrl.trim() : "";
    if (!seedKeywords && !websiteUrl) {
      throw new Error("Provide seedKeywords and/or websiteUrl to run Keyword Planner.");
    }
    const out: KeywordIdeasArgs = {};
    if (seedKeywords) out.seedKeywords = seedKeywords;
    if (websiteUrl) out.websiteUrl = websiteUrl;
    const categories = toCommaString(obj.categories);
    if (categories) out.categories = categories;
    if (typeof obj.location === "string" && obj.location.trim()) out.location = obj.location.trim();
    if (typeof obj.language === "string" && obj.language.trim()) out.language = obj.language.trim();
    return out;
  },
  async execute(args) {
    // Upstream requires at least one non-empty category; default to the seeds
    // (or a generic bucket) so the agent doesn't have to think about it.
    const categories = args.categories || args.seedKeywords || "General";

    const body: Record<string, unknown> = {
      categories,
      location: args.location || "au",
    };
    if (args.seedKeywords) body.seedKeywords = args.seedKeywords;
    if (args.websiteUrl) body.websiteUrl = args.websiteUrl;
    if (args.language) body.language = args.language;

    // Keyword Planner + Haiku categorisation can take a while; give it room.
    const res = await growthToolsPost<KeywordPlannerEnvelope>(
      "/api/keyword-planner",
      body,
      90_000,
    );
    if (!res.ok) return { ok: false, error: res.error };

    const rawCategories = res.data?.categories ?? [];
    const categoriesOut = rawCategories.map((c) => ({
      name: String(c.name ?? "").trim() || "Other/General",
      totalVolume: Number(c.totalVolume ?? 0),
      keywords: (c.keywords ?? []).map(normaliseIdea),
    }));

    // Flat, volume-sorted view so the model gets the useful rows without
    // walking the whole category tree.
    const topKeywords = categoriesOut
      .flatMap((c) => c.keywords.map((k) => ({ ...k, category: k.category || c.name })))
      .sort((a, b) => b.avgMonthlySearches - a.avgMonthlySearches)
      .slice(0, MAX_KEYWORDS_RETURNED);

    return {
      ok: true,
      data: {
        source: "Google Ads Keyword Planner (via Growth Tools /api/keyword-planner)",
        note: "Ideas come from Optimise Digital's Keyword Planner account, not the selected client's Google Ads account.",
        location: res.data?.location ?? args.location ?? "au",
        seedKeywords: args.seedKeywords ?? null,
        websiteUrl: args.websiteUrl ?? null,
        totalKeywords: Number(res.data?.totalKeywords ?? 0),
        returnedKeywords: topKeywords.length,
        topKeywords,
        categories: categoriesOut,
      },
    };
  },
};

function normaliseIdea(idea: KeywordIdeaRaw): {
  keyword: string;
  avgMonthlySearches: number;
  competition: string;
  competitionIndex: number;
  lowCpc: number;
  highCpc: number;
  category: string;
} {
  return {
    keyword: String(idea.keyword ?? "").trim(),
    avgMonthlySearches: Number(idea.avgMonthlySearches ?? 0),
    competition: String(idea.competition ?? "").trim(),
    competitionIndex: Number(idea.competitionIndex ?? 0),
    // Growth Tools returns top-of-page CPC as Google Ads bid *micros*
    // (e.g. 13074256 = $13.07). Convert to dollars before returning.
    lowCpc: microsToDollars(idea.lowCpc),
    highCpc: microsToDollars(idea.highCpc),
    category: String(idea.category ?? "").trim(),
  };
}

function microsToDollars(micros: unknown): number {
  return round2(Number(micros ?? 0) / 1_000_000);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
