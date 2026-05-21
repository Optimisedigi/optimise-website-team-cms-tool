import type { CollectionConfig } from "payload";

/**
 * google-ads-snapshots
 *
 * Latest Google Ads metrics per (client, level). The daily cron upserts a
 * single row per (client, level) pair — there is a UNIQUE index on
 * (client_id, level) at the DB level. UI surfaces (e.g. OptiMate read tools)
 * pull from here so they don't hammer Growth Tools on every page load.
 *
 * `rows` shape varies per level:
 *   - "campaign":     Array<{ campaignId, campaignName, status, channelType, clicks, impressions, ctr, costMicros, conversions, conversionValue, ... }>
 *   - "ad_group":     Array<{ adGroupId, adGroupName, campaignId, campaignName, status, clicks, impressions, costMicros, conversions, ... }>
 *   - "keyword":      Array<{ criterionId, keyword, matchType, adGroupId, campaignId, clicks, impressions, costMicros, conversions, qualityScore, ... }>
 *   - "search_term":  Array<{ searchTerm, adGroupId, campaignId, clicks, impressions, costMicros, conversions, matchedKeyword, matchType, ... }>
 *
 * Errors during a level's fetch populate `error` and leave previously
 * successful `rows` in place (next successful run overwrites).
 */
export const GoogleAdsSnapshots: CollectionConfig = {
  slug: "google-ads-snapshots",
  labels: {
    singular: "Google Ads Snapshot",
    plural: "Google Ads Snapshots",
  },
  admin: {
    hidden: true,
    useAsTitle: "level",
    defaultColumns: ["client", "level", "capturedAt", "rowCount"],
    description:
      "Latest Google Ads metrics snapshot per (client, level) — populated by the daily cron. Unique on (client, level) — cron upserts.",
  },
  access: {
    read: ({ req }) => !!req.user,
    create: ({ req }) => !!req.user,
    update: ({ req }) => !!req.user,
    delete: ({ req }) => {
      if (!req.user) return false;
      return req.user.role === "admin";
    },
  },
  fields: [
    {
      name: "client",
      type: "relationship",
      relationTo: "clients",
      required: true,
      index: true,
      admin: {
        description: "Client this snapshot belongs to",
      },
    },
    {
      name: "level",
      type: "select",
      required: true,
      index: true,
      options: [
        { label: "Campaign", value: "campaign" },
        { label: "Ad Group", value: "ad_group" },
        { label: "Keyword", value: "keyword" },
        { label: "Search Term", value: "search_term" },
      ],
      admin: {
        description: "Reporting granularity for the rows in this snapshot",
      },
    },
    {
      name: "capturedAt",
      type: "date",
      required: true,
      index: true,
      admin: {
        date: {
          pickerAppearance: "dayAndTime",
        },
        description: "When this snapshot was written (ISO timestamp)",
      },
    },
    {
      name: "dateRangeLabel",
      type: "text",
      admin: {
        description:
          'Window the rows cover, e.g. "LAST_7_DAYS", "LAST_30_DAYS", "THIS_MONTH"',
      },
    },
    {
      name: "dateRangeStart",
      type: "text",
      admin: {
        description: "Window start (YYYY-MM-DD), optional",
      },
    },
    {
      name: "dateRangeEnd",
      type: "text",
      admin: {
        description: "Window end (YYYY-MM-DD), optional",
      },
    },
    {
      name: "customerId",
      type: "text",
      required: true,
      admin: {
        description:
          "Google Ads customerId at capture time, undashed (matches the format used by Growth Tools)",
      },
    },
    {
      name: "rowCount",
      type: "number",
      admin: {
        description: "Number of rows in `rows`, for cheap UI display",
      },
    },
    {
      name: "rows",
      type: "json",
      admin: {
        description:
          "Array of typed rows; shape varies per level — see collection-level docs.",
      },
    },
    {
      name: "sourceEndpoint",
      type: "text",
      admin: {
        description:
          'Growth Tools path that produced this snapshot, e.g. "/api/google-ads/campaign-budgets/get-metrics"',
      },
    },
    {
      name: "fetchDurationMs",
      type: "number",
      admin: {
        description: "Time taken by the upstream fetch, for observability",
      },
    },
    {
      name: "error",
      type: "text",
      admin: {
        description:
          "Populated only if this level's fetch failed on the last cron run. Previously successful `rows` are preserved.",
      },
    },
  ],
};
