import type { CollectionConfig } from "payload";
import { canAccess, adminOnlyDelete, hideUnlessFeature } from "../lib/access";
import { matchesPattern } from "../lib/nkl-routing";
import { parseNegativeKeywords } from "../lib/parse-negative-keywords";

const GROWTH_TOOLS_URL = process.env.GROWTH_TOOLS_URL;
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;

function relationID(value: unknown): string | number | null {
  if (!value) return null;
  if (typeof value === "string" || typeof value === "number") return value;
  if (typeof value === "object" && "id" in value) return (value as { id?: string | number }).id ?? null;
  return null;
}

async function fetchMatchingCampaignNames({
  req,
  clientRef,
  campaignRegex,
}: {
  req: any;
  clientRef: unknown;
  campaignRegex: string;
}): Promise<string[] | null> {
  if (!GROWTH_TOOLS_URL || !INTERNAL_API_KEY) return null;

  const clientId = relationID(clientRef);
  if (!clientId) return null;

  const client =
    typeof clientRef === "object" && clientRef && "googleAdsCustomerId" in clientRef
      ? clientRef
      : await req.payload.findByID({
          collection: "clients",
          id: clientId,
          depth: 0,
          overrideAccess: true,
        });

  const customerId = String((client as any)?.googleAdsCustomerId ?? "").replace(/\D/g, "");
  if (!customerId) return null;

  try {
    const res = await fetch(`${GROWTH_TOOLS_URL}/api/google-ads/campaigns?customerId=${customerId}`, {
      headers: { "x-internal-key": INTERNAL_API_KEY },
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) return null;

    const data = await res.json();
    const campaigns: Array<{ name?: string }> = Array.isArray(data?.campaigns) ? data.campaigns : [];
    return campaigns
      .map((campaign) => campaign.name)
      .filter((name): name is string => Boolean(name))
      .filter((name) => matchesPattern(name, campaignRegex));
  } catch (err) {
    req.payload.logger?.warn?.(`[NegativeKeywordLists] campaign count refresh failed: ${err}`);
    return null;
  }
}

export const NegativeKeywordLists: CollectionConfig = {
  slug: "negative-keyword-lists",
  labels: { singular: "Negative Keyword List", plural: "Negative Keyword Lists" },
  admin: {
    // Sidebar entry is hidden via CSS in src/app/(payload)/custom.scss so
    // the collection still has working edit routes (Payload's `hidden: true`
    // excludes it from routes too, which would break the deep-link flow).
    // Non-admins without the feature key are blocked the standard way.
    hidden: hideUnlessFeature("negative-keyword-lists"),
    // Grouped under Growth Tools alongside the other Google Ads collections.
    // Without a group set, Payload renders the entry in an orphan top-level
    // "Collections" section above the sidebar groups.
    group: "Growth Tools",
    useAsTitle: "name",
    defaultColumns: ["client", "name", "scope", "keywordCount", "campaignCount", "isActive"],
  },
  defaultSort: "client",
  access: {
    read: canAccess("negative-keyword-lists"),
    create: canAccess("negative-keyword-lists"),
    update: canAccess("negative-keyword-lists"),
    delete: adminOnlyDelete,
  },
  hooks: {
    afterRead: [
      ({ doc }) => {
        const count = Number(doc?.campaignCount);
        if (Number.isFinite(count) && doc?.campaignCount !== null && doc?.campaignCount !== "") {
          doc.campaignCount = count;
          return doc;
        }

        const hasRegex = String(doc?.campaignRegex ?? "").trim().length > 0;
        doc.campaignCount = hasRegex && Array.isArray(doc?.campaigns) ? doc.campaigns.length : 0;
        return doc;
      },
    ],
    beforeChange: [
      async ({ data, originalDoc, operation, req }) => {
        if (typeof data?.createKeywordPaste === "string" && data.createKeywordPaste.trim()) {
          const existingKeywords = Array.isArray(data.keywords) ? data.keywords : [];
          const existingSet = new Set(
            existingKeywords.map((kw: any) => `${kw.keyword?.toLowerCase()}|${kw.matchType}`),
          );
          const pastedKeywords = parseNegativeKeywords(data.createKeywordPaste)
            .filter((kw) => !existingSet.has(`${kw.keyword.toLowerCase()}|${kw.matchType}`))
            .map((kw) => ({
              keyword: kw.keyword,
              matchType: kw.matchType,
              flaggedForRemoval: false,
            }));

          data.keywords = [...existingKeywords, ...pastedKeywords];
          delete data.createKeywordPaste;
        }

        if (data?.keywords) {
          data.keywordCount = Array.isArray(data.keywords) ? data.keywords.length : 0;
          // Stamp negated_at on every new keyword that doesn't have one yet.
          // Existing entries (with a value) are left untouched so we keep the
          // accurate "when was this term added" date for the avoided-spend
          // calculation. Use `now` rather than the parent list's createdAt
          // because individual keywords are added and removed over time.
          const now = new Date().toISOString();
          for (const kw of data.keywords) {
            if (kw && !kw.negatedAt) {
              kw.negatedAt = now;
            }
          }
        }

        const nextRegex = typeof data?.campaignRegex === "string" ? data.campaignRegex : originalDoc?.campaignRegex;
        const nextClient = data?.client ?? originalDoc?.client;
        const regexChanged = operation === "create" || data?.campaignRegex !== undefined;
        const clientChanged = operation === "create" || data?.client !== undefined;
        const hasExplicitCampaigns = Array.isArray(data?.campaigns);
        const trimmedRegex = String(nextRegex ?? "").trim();

        if (!trimmedRegex) {
          data.campaigns = [];
          data.campaignCount = 0;
          return data;
        }

        if (!hasExplicitCampaigns && (regexChanged || clientChanged)) {
          const matchedCampaignNames = await fetchMatchingCampaignNames({
            req,
            clientRef: nextClient,
            campaignRegex: trimmedRegex,
          });

          if (matchedCampaignNames) {
            data.campaigns = matchedCampaignNames.map((campaignName) => ({ campaignName }));
            data.campaignCount = matchedCampaignNames.length;
            return data;
          }
        }

        const nextCampaigns = hasExplicitCampaigns
          ? data.campaigns
          : Array.isArray(originalDoc?.campaigns)
            ? originalDoc.campaigns
            : [];
        data.campaignCount = nextCampaigns.length;

        return data;
      },
    ],
    afterChange: [
      async ({ doc, previousDoc, req, operation }) => {
        const clientId = typeof doc.client === "object" ? doc.client?.id : doc.client;

        // Any keyword set change (add or remove) shifts what counts as
        // "irrelevant" for the historical Monthly Trend chart. Wipe the
        // per-month relevancy cache so past months get re-credited on the
        // next dashboard view. (Skipped if only metadata fields changed.)
        try {
          const prevKw = Array.isArray(previousDoc?.keywords) ? previousDoc.keywords : [];
          const nextKw = Array.isArray(doc?.keywords) ? doc.keywords : [];
          const keysOf = (arr: any[]) =>
            new Set(arr.map((k: any) => `${(k.keyword || "").toLowerCase()}|${(k.matchType || "").toUpperCase()}`));
          const prevSet = keysOf(prevKw);
          const nextSet = keysOf(nextKw);
          const setsDiffer = prevSet.size !== nextSet.size || [...nextSet].some((k) => !prevSet.has(k));
          // Changing the relevancy-exclusion tag re-buckets this list's spend
          // (normal vs competitor vs brand) without touching keywords, so it
          // must also invalidate the cache.
          const exclusionChanged =
            (previousDoc?.relevancyExclusion ?? "none") !== (doc?.relevancyExclusion ?? "none");
          if (clientId && (setsDiffer || exclusionChanged)) {
            await req.payload.delete({
              collection: "negative-keyword-monthly-waste-relevancy-cache",
              where: { client: { equals: clientId } },
              overrideAccess: true,
            });
          }
        } catch (err) {
          req.payload.logger?.warn?.(`[NegativeKeywordLists] relevancy cache cleanup failed: ${err}`);
        }

        // Diff keywords against the previous version. For any keyword that
        // disappeared (removed), delete its avoided-spend cache rows so the
        // dashboard total drops immediately.
        if (operation !== "update") return;
        try {
          const prev = Array.isArray(previousDoc?.keywords) ? previousDoc.keywords : [];
          const next = Array.isArray(doc?.keywords) ? doc.keywords : [];
          const nextKeys = new Set(
            next.map((k: any) => `${(k.keyword || "").toLowerCase()}|${(k.matchType || "").toUpperCase()}`),
          );
          const removed = prev.filter((k: any) => {
            const key = `${(k.keyword || "").toLowerCase()}|${(k.matchType || "").toUpperCase()}`;
            return !nextKeys.has(key);
          });
          if (removed.length === 0) return;
          if (!clientId) return;
          for (const kw of removed) {
            await req.payload.delete({
              collection: "negative-keyword-avoided-spend-cache",
              where: {
                and: [
                  { client: { equals: clientId } },
                  { keyword: { equals: kw.keyword } },
                  { matchType: { equals: (kw.matchType || "").toUpperCase() } },
                ],
              },
              overrideAccess: true,
            });
          }
        } catch (err) {
          req.payload.logger?.warn?.(`[NegativeKeywordLists] cache cleanup failed: ${err}`);
        }
      },
    ],
    afterDelete: [
      async ({ doc, req }) => {
        // Remove every cache row for this NKL's keywords so deleted lists
        // stop contributing to the avoided-spend total. Also wipe the
        // historical relevancy cache so the chart drops the deleted
        // keywords' contribution from past months.
        try {
          const clientId = typeof doc.client === "object" ? doc.client?.id : doc.client;
          if (!clientId) return;
          const keywords = Array.isArray(doc.keywords) ? doc.keywords : [];
          for (const kw of keywords) {
            await req.payload.delete({
              collection: "negative-keyword-avoided-spend-cache",
              where: {
                and: [
                  { client: { equals: clientId } },
                  { keyword: { equals: kw.keyword } },
                  { matchType: { equals: (kw.matchType || "").toUpperCase() } },
                ],
              },
              overrideAccess: true,
            });
          }
          await req.payload.delete({
            collection: "negative-keyword-monthly-waste-relevancy-cache",
            where: { client: { equals: clientId } },
            overrideAccess: true,
          });
        } catch (err) {
          req.payload.logger?.warn?.(`[NegativeKeywordLists] cache cleanup on delete failed: ${err}`);
        }
      },
    ],
  },
  fields: [
    {
      name: "infoPanel",
      type: "ui",
      admin: {
        // Hidden until save so Payload does not show a custom-field placeholder on create.
        condition: (data) => Boolean(data?.id),
        components: {
          Field: "./components/NegativeKeywordListInfo",
        },
      },
    },
    {
      name: "client",
      type: "relationship",
      relationTo: "clients",
      required: true,
      admin: {
        position: "sidebar",
        description: "The client this negative keyword list belongs to",
      },
    },
    {
      name: "name",
      type: "text",
      required: true,
      admin: {
        description: 'List name (e.g. "Brand Terms", "Competitor Terms")',
      },
    },
    {
      name: "scope",
      type: "select",
      required: true,
      defaultValue: "account",
      options: [
        { label: "Account Level", value: "account" },
        { label: "Campaign Level", value: "campaign" },
        { label: "Ad Group Level", value: "ad_group" },
      ],
      admin: {
        description: "Where this negative keyword list applies",
      },
    },
    {
      name: "campaignSelect",
      type: "ui",
      admin: {
        condition: (data) => Boolean(data?.id),
        components: {
          Field: "./components/NegativeKeywordCampaignSelect",
        },
      },
    },
    {
      name: "campaignName",
      type: "text",
      admin: {
        description: "Primary campaign name (legacy, use campaigns array instead).",
        condition: () => false, // Hidden — replaced by campaigns array
      },
    },
    {
      name: "campaigns",
      type: "array",
      admin: {
        description: "Campaigns this negative keyword list is applied to",
        condition: () => false, // Hidden — managed via the campaign select UI above
      },
      fields: [
        {
          name: "campaignName",
          type: "text",
          required: true,
        },
      ],
    },
    {
      name: "adGroupName",
      type: "text",
      admin: {
        description: "Ad group name (for ad group scope)",
        condition: (data) => data?.scope === "ad_group",
      },
    },
    {
      name: "campaignRegex",
      type: "text",
      label: "Regex",
      admin: {
        description:
          "Controls which campaigns the Google Ads script attaches this list to. Leave blank to sync/create the list only and not auto-attach it. Beginner examples: .* = all campaigns; Brand = campaigns containing Brand; Brand|Generic = campaigns containing Brand or Generic; ^(?!.*Vietnam).* = all campaigns except names containing Vietnam. Case insensitive. Save first, then preview.",
      },
    },
    {
      name: "createKeywordPaste",
      label: "Bulk Add Keywords",
      type: "textarea",
      virtual: true,
      admin: {
        description:
          "Create-screen paste box: one keyword per line. Bare terms become exact match; quoted terms become phrase match. Saved into the hidden keywords list when you create the record.",
        condition: (data) => !data?.id,
        rows: 8,
      },
    },
    {
      name: "bulkAdd",
      type: "ui",
      admin: {
        condition: (data) => Boolean(data?.id),
        components: {
          Field: "./components/NegativeKeywordBulkAdd",
        },
      },
    },
    {
      name: "keywordTable",
      type: "ui",
      admin: {
        condition: (data) => Boolean(data?.id),
        components: {
          Field: "./components/NegativeKeywordTable",
        },
      },
    },
    {
      name: "keywords",
      type: "array",
      admin: {
        description: "Negative keywords in this list",
        condition: () => false, // Hidden — managed via the table UI above
      },
      fields: [
        {
          name: "keyword",
          type: "text",
          required: true,
        },
        {
          name: "matchType",
          type: "select",
          required: true,
          defaultValue: "exact",
          options: [
            { label: "Broad", value: "broad" },
            { label: "Phrase", value: "phrase" },
            { label: "Exact", value: "exact" },
          ],
        },
        {
          name: "flaggedForRemoval",
          type: "checkbox",
          defaultValue: false,
          admin: {
            description: "Flagged by client for removal review",
          },
        },
        {
          name: "negatedAt",
          type: "date",
          admin: {
            description: "When this keyword became a negative. Used for the avoided-spend dashboard so we don't credit spend from before it was blocked.",
            date: {
              pickerAppearance: "dayOnly",
            },
          },
        },
      ],
    },
    {
      name: "keywordCount",
      type: "number",
      defaultValue: 0,
      admin: {
        readOnly: true,
        description: "Auto-calculated keyword count",
        condition: () => false, // Hidden — shown in the table header
      },
    },
    {
      name: "campaignCount",
      label: "Campaigns",
      type: "number",
      defaultValue: 0,
      admin: {
        readOnly: true,
        description: "Snapshot of matching campaigns from the last preview",
        condition: () => false,
      },
    },
    {
      name: "isActive",
      type: "checkbox",
      defaultValue: true,
      admin: {
        description: "Inactive lists are excluded from the Google Ads sync",
      },
    },
    {
      name: "relevancyExclusion",
      type: "select",
      defaultValue: "none",
      options: [
        { label: "Count against relevancy (default)", value: "none" },
        { label: "Exclude as competitor", value: "competitor" },
        { label: "Exclude as brand", value: "brand" },
      ],
      admin: {
        description:
          "Whether this list's keywords count against the dashboard Keyword Relevancy %. Keep 'none' for genuinely irrelevant negatives. Choose 'competitor' or 'brand' for negatives that block non-converting-but-not-irrelevant traffic (e.g. competitor brand terms) — their spend is kept out of the default relevancy % but can be toggled back on per-category in the dashboard. The keywords are still synced to Google Ads regardless.",
      },
    },
    {
      name: "source",
      type: "text",
      defaultValue: "nlb",
      admin: {
        readOnly: true,
        description: "Where this list originated: 'nlb' (Negative List Builder) or 'deep_dive' (Keyword Deep Dive)",
      },
    },
  ],
};
