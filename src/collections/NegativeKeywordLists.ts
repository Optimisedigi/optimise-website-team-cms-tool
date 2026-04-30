import type { CollectionConfig } from "payload";
import { canAccess, adminOnlyDelete, hideUnlessFeature } from "../lib/access";

export const NegativeKeywordLists: CollectionConfig = {
  slug: "negative-keyword-lists",
  labels: { singular: "Negative Keyword List", plural: "Negative Keyword Lists" },
  admin: {
    // Sidebar entry is hidden via CSS in src/app/(payload)/custom.scss so
    // the collection still has working edit routes (Payload's `hidden: true`
    // excludes it from routes too, which would break the deep-link flow).
    // Non-admins without the feature key are blocked the standard way.
    hidden: hideUnlessFeature("negative-keyword-lists"),
    useAsTitle: "name",
    defaultColumns: ["client", "name", "scope", "keywordCount", "isActive"],
  },
  defaultSort: "client",
  access: {
    read: canAccess("negative-keyword-lists"),
    create: canAccess("negative-keyword-lists"),
    update: canAccess("negative-keyword-lists"),
    delete: adminOnlyDelete,
  },
  hooks: {
    beforeChange: [
      ({ data }) => {
        if (data?.keywords) {
          data.keywordCount = Array.isArray(data.keywords) ? data.keywords.length : 0;
        }
        return data;
      },
    ],
  },
  fields: [
    {
      name: "infoPanel",
      type: "ui",
      admin: {
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
        description: "Pattern for auto-assigning this list to matching campaigns/ad groups. Type a keyword (e.g. Brand) or use | to match multiple (e.g. Brand|Generic). Examples: Brand (matches 'Brand_Product'), Brand|Generic (matches both), .* (all campaigns). Case insensitive. Save first, then preview.",
      },
    },
    {
      name: "bulkAdd",
      type: "ui",
      admin: {
        components: {
          Field: "./components/NegativeKeywordBulkAdd",
        },
      },
    },
    {
      name: "keywordTable",
      type: "ui",
      admin: {
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
      name: "isActive",
      type: "checkbox",
      defaultValue: true,
      admin: {
        description: "Inactive lists are excluded from the Google Ads sync",
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
