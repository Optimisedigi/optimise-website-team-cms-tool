import type { CollectionConfig } from "payload";
import { hasValidApiKey } from "./api-key-access";

export const GoogleAdsAdExtensions: CollectionConfig = {
  slug: "google-ads-ad-extensions",
  labels: {
    singular: "Ad Extension",
    plural: "Ad Extensions",
  },
  admin: {
    useAsTitle: "extensionType",
    hidden: true,
    defaultColumns: ["extensionType", "extensionData", "level", "status"],
    description: "Ad extensions (sitelinks, structured snippets) management.",
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
        description: "The Google Ads audit this extension belongs to",
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
    // Extension type
    {
      name: "extensionType",
      type: "select",
      required: true,
      options: [
        { label: "Sitelink", value: "sitelink" },
        { label: "Structured Snippet", value: "structured_snippet" },
      ],
    },
    // Sitelink fields
    {
      name: "sitelinkText",
      type: "text",
      admin: {
        description: "Link text (max 25 characters)",
        condition: (data: any) => data?.extensionType === "sitelink",
      },
    },
    {
      name: "sitelinkUrl",
      type: "text",
      admin: {
        description: "Landing page URL",
        condition: (data: any) => data?.extensionType === "sitelink",
      },
    },
    {
      name: "sitelinkDescription1",
      type: "text",
      admin: {
        description: "Description line 1 (max 35 characters, optional)",
        condition: (data: any) => data?.extensionType === "sitelink",
      },
    },
    {
      name: "sitelinkDescription2",
      type: "text",
      admin: {
        description: "Description line 2 (max 35 characters, optional)",
        condition: (data: any) => data?.extensionType === "sitelink",
      },
    },
    // Structured snippet fields
    {
      name: "snippetHeader",
      type: "select",
      options: [
        { label: "Destinations", value: "Destinations" },
        { label: "Services", value: "Services" },
        { label: "Brands", value: "Brands" },
        { label: "Schools", value: "Schools" },
        { label: "Neighborhoods", value: "Neighborhoods" },
        { label: "Types", value: "Types" },
        { label: "Collections", value: "Collections" },
        { label: "Hotels", value: "Hotels" },
        { label: "Insurance Coverage", value: "Insurance Coverage" },
        { label: "Models", value: "Models" },
        { label: "Entertainment", value: "Entertainment" },
        { label: "Activities", value: "Activities" },
        { label: "Featured Items", value: "Featured Items" },
        { label: "Product Types", value: "Product Types" },
        { label: "Services Offered", value: "Services Offered" },
        { label: "Programs", value: "Programs" },
        { label: "Events", value: "Events" },
        { label: "Amenities", value: "Amenities" },
        { label: "Styles", value: "Styles" },
        { label: "Benefits", value: "Benefits" },
        { label: "Menu Items", value: "Menu Items" },
        { label: "Dining Options", value: "Dining Options" },
      ],
      admin: {
        description: "Header (e.g. 'Services', 'Brands')",
        condition: (data: any) => data?.extensionType === "structured_snippet",
      },
    },
    {
      name: "snippetValues",
      type: "textarea",
      admin: {
        description: "Values (one per line, 3-10 values, max 25 chars each)",
        condition: (data: any) => data?.extensionType === "structured_snippet",
      },
    },
    // Level & assignments
    {
      name: "level",
      type: "select",
      required: true,
      defaultValue: "account",
      options: [
        { label: "Account", value: "account" },
        { label: "Campaign", value: "campaign" },
        { label: "Ad Group", value: "ad_group" },
      ],
    },
    // Google Ads IDs
    {
      name: "assetId",
      type: "text",
      admin: {
        readOnly: true,
        description: "Google Ads asset ID (populated after deploy)",
      },
    },
    {
      name: "assetSetId",
      type: "text",
      admin: {
        readOnly: true,
        description: "AssetSet ID after linking to campaigns",
      },
    },
    // Assigned campaigns
    {
      name: "assignedCampaigns",
      type: "array",
      admin: {
        description: "Campaigns this extension is assigned to",
      },
      fields: [
        {
          name: "campaignId",
          type: "text",
          required: true,
        },
        {
          name: "campaignName",
          type: "text",
          required: true,
        },
      ],
    },
    // Assigned ad groups
    {
      name: "assignedAdGroups",
      type: "array",
      admin: {
        description: "Ad groups this extension is assigned to",
      },
      fields: [
        {
          name: "adGroupId",
          type: "text",
          required: true,
        },
        {
          name: "adGroupName",
          type: "text",
          required: true,
        },
        {
          name: "campaignId",
          type: "text",
          required: true,
        },
      ],
    },
    // Status
    {
      name: "status",
      type: "select",
      defaultValue: "draft",
      options: [
        { label: "Draft", value: "draft" },
        { label: "Deployed", value: "deployed" },
        { label: "Paused", value: "paused" },
        { label: "Error", value: "error" },
      ],
    },
    {
      name: "deployedAt",
      type: "date",
      admin: {
        readOnly: true,
        description: "When the extension was deployed to Google Ads",
      },
    },
  ],
};
