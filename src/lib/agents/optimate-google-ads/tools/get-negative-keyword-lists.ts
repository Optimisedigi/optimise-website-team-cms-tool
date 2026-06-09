import { getPayload } from "payload";
import payloadConfig from "@/payload.config";
import type { CanonicalTool } from "@/lib/agents/_shared/tool";

type NklScope = "account" | "campaign" | "ad_group";
type MatchType = "exact" | "phrase" | "broad";

interface GetNegativeKeywordListsArgs {
  nklId?: number;
  includeKeywords?: boolean;
  onlyActive?: boolean;
  limit?: number;
}

interface NegativeKeyword {
  keyword?: string | null;
  matchType?: MatchType | null;
  flaggedForRemoval?: boolean | null;
  negatedAt?: string | null;
}

interface CampaignEntry {
  campaignName?: string | null;
}

interface NegativeKeywordListDoc {
  id: number;
  name?: string | null;
  scope?: NklScope | null;
  campaigns?: CampaignEntry[] | null;
  adGroupName?: string | null;
  keywordCount?: number | null;
  keywords?: NegativeKeyword[] | null;
  isActive?: boolean | null;
  relevancyExclusion?: string | null;
  source?: string | null;
  updatedAt?: string | null;
}

export const getNegativeKeywordLists: CanonicalTool<GetNegativeKeywordListsArgs> = {
  name: "get_negative_keyword_lists",
  description:
    "Read the linked client's CMS Negative Keyword Lists, including list IDs and optionally the full keywords array. Use this before propose_nkl_update whenever the user asks to add keywords to an existing list, because propose_nkl_update requires the target nklId and FULL replacement keyword set.",
  inputSchema: {
    type: "object",
    properties: {
      nklId: {
        type: "integer",
        description: "Optional specific negative-keyword-lists doc id to load.",
      },
      includeKeywords: {
        type: "boolean",
        description:
          "Include each list's keyword array. Default true so existing keywords can be preserved when preparing propose_nkl_update.",
      },
      onlyActive: {
        type: "boolean",
        description: "Only return active lists. Default false.",
      },
      limit: {
        type: "integer",
        description: "Max lists to return when nklId is omitted. Default 20, max 50.",
      },
    },
    additionalProperties: false,
  },
  validate: (raw) => {
    const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const out: GetNegativeKeywordListsArgs = {};

    if (obj.nklId !== undefined) {
      const nklId = Number(obj.nklId);
      if (!Number.isInteger(nklId) || nklId <= 0) throw new Error("nklId must be a positive integer");
      out.nklId = nklId;
    }
    if (typeof obj.includeKeywords === "boolean") out.includeKeywords = obj.includeKeywords;
    if (typeof obj.onlyActive === "boolean") out.onlyActive = obj.onlyActive;
    if (obj.limit !== undefined) {
      const limit = Number(obj.limit);
      if (!Number.isFinite(limit) || limit <= 0) throw new Error("limit must be a positive number");
      out.limit = Math.min(50, Math.floor(limit));
    }

    return out;
  },
  execute: async (args, ctx) => {
    const clientId = ctx.context.clientId as number | string | null | undefined;
    if (clientId === undefined || clientId === null || clientId === "") {
      return { ok: false, error: "No linked client; this tool needs a client-scoped chat." };
    }

    const cfg = await payloadConfig;
    const payload = await getPayload({ config: cfg });
    const includeKeywords = args.includeKeywords ?? true;
    const where: Record<string, unknown> = {
      client: { equals: clientId },
    };

    if (args.nklId !== undefined) where.id = { equals: args.nklId };
    if (args.onlyActive === true) where.isActive = { equals: true };

    try {
      const result = await payload.find({
        collection: "negative-keyword-lists",
        where: where as never,
        limit: args.nklId !== undefined ? 1 : (args.limit ?? 20),
        depth: 0,
        overrideAccess: true,
        sort: "name",
      });

      const lists = (result.docs as unknown as NegativeKeywordListDoc[])
        .slice()
        .sort((a, b) => String(a.name ?? "").localeCompare(String(b.name ?? "")))
        .map((list) => ({
          id: list.id,
          name: list.name ?? null,
          scope: list.scope ?? null,
          campaigns: Array.isArray(list.campaigns)
            ? list.campaigns.map((campaign) => campaign.campaignName).filter((name): name is string => Boolean(name))
            : [],
          adGroupName: list.adGroupName ?? null,
          keywordCount: list.keywordCount ?? (Array.isArray(list.keywords) ? list.keywords.length : 0),
          isActive: list.isActive ?? null,
          relevancyExclusion: list.relevancyExclusion ?? null,
          source: list.source ?? null,
          updatedAt: list.updatedAt ?? null,
          ...(includeKeywords
            ? {
                keywords: Array.isArray(list.keywords)
                  ? list.keywords.map((keyword) => ({
                      keyword: keyword.keyword ?? "",
                      matchType: keyword.matchType ?? "exact",
                      flaggedForRemoval: keyword.flaggedForRemoval ?? false,
                      negatedAt: keyword.negatedAt ?? null,
                    }))
                  : [],
              }
            : {}),
        }));

      return {
        ok: true,
        data: {
          clientId,
          totalDocs: result.totalDocs,
          returned: lists.length,
          includeKeywords,
          lists,
        },
      };
    } catch (err) {
      return { ok: false, error: `Failed to load negative keyword lists: ${(err as Error).message}` };
    }
  },
};
