import type { CollectionConfig } from "payload";
import { hasValidApiKey } from "./api-key-access";

export const GoogleAdsCampaignBudgets: CollectionConfig = {
  slug: "google-ads-campaign-budgets",
  labels: {
    singular: "Campaign Budget",
    plural: "Campaign Budgets",
  },
  admin: {
    useAsTitle: "campaignName",
    hidden: true,
    defaultColumns: ["campaignName", "budgetPercentage", "calculatedDailyBudget", "bidStrategy", "conversions"],
    description: "Campaign budget allocation. Set monthly budget total and percentages, CMS calculates daily budget.",
  },
  access: {
    read: ({ req }) => !!req.user || hasValidApiKey(req),
    update: ({ req }) => !!req.user || hasValidApiKey(req),
    delete: ({ req }) => {
      if (!req.user) return false;
      return req.user.role === "admin";
    },
    create: ({ req }) => !!req.user || hasValidApiKey(req),
  },
  fields: [
    {
      name: "audit",
      type: "relationship",
      relationTo: "google-ads-audits",
      required: true,
      admin: {
        description: "The Google Ads audit this budget belongs to",
      },
    },
    {
      name: "customerId",
      type: "text",
      required: true,
      admin: {
        description: "Google Ads customer ID",
      },
    },
    // Campaign reference
    {
      name: "campaignId",
      type: "text",
      required: true,
      admin: {
        description: "Google Ads campaign ID",
      },
    },
    {
      name: "campaignName",
      type: "text",
      required: true,
      admin: {
        description: "Campaign name from Google Ads",
      },
    },
    // Ad group reference (optional - for ad group level allocation)
    {
      name: "adGroupId",
      type: "text",
      admin: {
        description: "Ad group ID (if ad group level allocation)",
      },
    },
    {
      name: "adGroupName",
      type: "text",
      admin: {
        description: "Ad group name (if ad group level)",
      },
    },
    // Budget allocation settings
    {
      name: "enabled",
      type: "checkbox",
      defaultValue: true,
      admin: {
        description: "Whether this campaign is included in budget allocation",
      },
    },
    {
      name: "standalone",
      type: "checkbox",
      defaultValue: false,
      admin: {
        description: "Has its own dedicated budget. Excluded from % split allocation and from the main monthly budget total.",
      },
    },
    {
      name: "standaloneBudget",
      type: "number",
      admin: {
        description: "Total budget for the standalone period (AUD)",
        condition: (_data, siblingData) => siblingData?.standalone === true,
        step: 1,
      },
    },
    {
      name: "standaloneStartDate",
      type: "date",
      admin: {
        description: "Start of the standalone budget period",
        condition: (_data, siblingData) => siblingData?.standalone === true,
        date: { pickerAppearance: "dayOnly", displayFormat: "yyyy-MM-dd" },
      },
    },
    {
      name: "standaloneEndDate",
      type: "date",
      admin: {
        description: "End of the standalone budget period (inclusive)",
        condition: (_data, siblingData) => siblingData?.standalone === true,
        date: { pickerAppearance: "dayOnly", displayFormat: "yyyy-MM-dd" },
      },
    },
    {
      name: "budgetPercentage",
      type: "number",
      required: true,
      defaultValue: 0,
      min: 0,
      max: 100,
      admin: {
        description: "Percentage of total monthly budget to allocate to this campaign",
        step: 0.5,
      },
    },
    // Calculated daily budget (managed by CMS, based on monthly budget and percentage)
    {
      name: "calculatedDailyBudget",
      type: "number",
      admin: {
        readOnly: true,
        description: "Calculated daily budget (monthly total × % ÷ 30.4)",
      },
    },
    // Actual budget in Google Ads (last pushed)
    {
      name: "actualDailyBudget",
      type: "number",
      admin: {
        description: "Last synced daily budget in Google Ads",
      },
    },
    {
      name: "lastPushedAt",
      type: "date",
      admin: {
        readOnly: true,
        description: "When budget was last pushed to Google Ads",
      },
    },
    {
      name: "lastPushedSource",
      type: "text",
      admin: {
        readOnly: true,
        description: "What triggered the last push (e.g. 'manual', 'cron-monthly-reset', 'cron-mid-month', 'agent'). Used by the Optimate agent to deduplicate work.",
      },
    },
    // Monthly recommendation (advisory only — set by the monthly cron from
    // last month's performance; never auto-applied or auto-pushed).
    {
      name: "recommendedDailyBudget",
      type: "number",
      admin: {
        readOnly: true,
        description:
          "Recommended daily budget from last month's CPA / conversions / spend. Advisory — apply manually then push.",
      },
    },
    {
      name: "recommendationGeneratedAt",
      type: "date",
      admin: {
        readOnly: true,
        description: "When the monthly recommendation was generated",
      },
    },
    {
      name: "recommendationBasis",
      type: "json",
      admin: {
        readOnly: true,
        description:
          "Last-month inputs used for the recommendation (conversions, spend, cpa, score).",
      },
    },
    // Bid strategy
    {
      name: "bidStrategy",
      type: "select",
      required: true,
      defaultValue: "manual_cpc",
      options: [
        { label: "Manual CPC", value: "manual_cpc" },
        { label: "Maximize Conversions", value: "maximize_conversions" },
        { label: "Maximize Conversion Value", value: "maximize_conversion_value" },
        { label: "Target CPA", value: "target_cpa" },
        { label: "Target ROAS", value: "target_roas" },
        { label: "Target Impressions", value: "target_impressions" },
        { label: "Maximize Clicks", value: "maximize_clicks" },
      ],
    },
    {
      name: "bidStrategyId",
      type: "text",
      admin: {
        description: "Bidding strategy ID (for enhanced strategies like Target CPA)",
      },
    },
    {
      name: "manualCpcBid",
      type: "number",
      admin: {
        description: "Manual CPC bid override",
        step: 0.01,
      },
    },
    // Targeting
    {
      name: "locationIds",
      type: "array",
      admin: {
        description: "Geo target IDs",
      },
      fields: [
        {
          name: "locationId",
          type: "text",
          required: true,
        },
      ],
    },
    {
      name: "locationNames",
      type: "array",
      admin: {
        description: "Human-readable location names",
      },
      fields: [
        {
          name: "name",
          type: "text",
          required: true,
        },
      ],
    },
    // Performance metrics
    {
      name: "metricsLastUpdated",
      type: "date",
      admin: {
        readOnly: true,
        description: "When metrics were last refreshed from Google Ads",
      },
    },
    {
      type: "row",
      fields: [
        {
          name: "impressions",
          type: "number",
          admin: {
            description: "30-day impressions",
            width: "50%",
          },
        },
        {
          name: "clicks",
          type: "number",
          admin: {
            description: "30-day clicks",
            width: "50%",
          },
        },
      ],
    },
    {
      type: "row",
      fields: [
        {
          name: "avgCpc",
          type: "number",
          admin: {
            description: "Average CPC ($)",
            width: "50%",
            step: 0.01,
          },
        },
        {
          name: "conversions",
          type: "number",
          admin: {
            description: "30-day conversions",
            width: "50%",
          },
        },
      ],
    },
  ],
};
