import type { CollectionConfig } from "payload";

export const NegativeKeywordLists: CollectionConfig = {
  slug: "negative-keyword-lists",
  labels: { singular: "Negative Keyword List", plural: "Negative Keyword Lists" },
  admin: {
    group: "Growth Tools",
    useAsTitle: "name",
    defaultColumns: ["name", "client", "scope", "keywordCount", "isActive"],
  },
  access: {
    read: ({ req }) => !!req.user,
    create: ({ req }) => !!req.user,
    update: ({ req }) => !!req.user,
    delete: ({ req }) => !!req.user,
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
      name: "campaignName",
      type: "text",
      admin: {
        description: "Campaign name (for campaign or ad group scope)",
        condition: (data) => data?.scope === "campaign" || data?.scope === "ad_group",
      },
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
      admin: {
        description: "Pattern for auto-assigning this list to matching campaigns. Use .* to match anything. Examples: .*Search.* (any campaign with 'Search' in the name), .*Brand.* (any campaign with 'Brand'), .* (all campaigns). Leave blank to skip auto-assignment.",
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
      name: "keywords",
      type: "array",
      admin: {
        description: "Negative keywords in this list",
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
  ],
};
