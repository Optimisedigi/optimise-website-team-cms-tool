import type { CollectionConfig, CollectionBeforeChangeHook } from "payload";
import crypto from "crypto";
import { hasValidApiKey } from "./api-key-access";

const autoGenerateSlug: CollectionBeforeChangeHook = ({ data }) => {
  if (data && !data.reportSlug && data.websiteUrl) {
    const domain = data.websiteUrl
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .replace(/[^a-zA-Z0-9.-]/g, "")
      .replace(/\./g, "-");
    const date = new Date().toISOString().slice(0, 10);
    const rand = crypto.randomBytes(4).toString("hex");
    data.reportSlug = `comp-${domain}-${date}-${rand}`;
  }
  return data;
};

export const CompetitorAnalyses: CollectionConfig = {
  slug: "competitor-analyses",
  labels: {
    singular: "Competitor Analysis",
    plural: "Competitor Analyses",
  },
  admin: {
    useAsTitle: "websiteUrl",
    group: "Audits",
    defaultColumns: ["websiteUrl", "totalCompetitors", "createdAt"],
    description: "Competitor analysis reports",
  },
  hooks: {
    beforeChange: [autoGenerateSlug],
  },
  access: {
    read: ({ req }) => !!req.user || hasValidApiKey(req),
    update: ({ req }) => !!req.user,
    delete: ({ req }) => {
      if (!req.user) return false;
      return req.user.role === "admin";
    },
    create: ({ req }) => !!req.user || hasValidApiKey(req),
  },
  fields: [
    {
      name: "websiteUrl",
      label: "Website URL",
      type: "text",
      required: true,
      admin: {
        description: "The website that was analyzed",
      },
    },
    {
      name: "keywords",
      type: "json",
      admin: {
        description: "Array of keywords used for the analysis",
      },
    },
    {
      name: "location",
      type: "text",
      admin: {
        description: "Location used for the analysis",
      },
    },
    {
      name: "totalCompetitors",
      type: "number",
      admin: {
        description: "Number of competitors found",
      },
    },
    {
      name: "yourProfile",
      type: "json",
      admin: {
        description:
          "Your site's competitor profile — domain, avgPosition, keywordsFound, traffic",
      },
    },
    {
      name: "competitors",
      type: "json",
      admin: {
        description: "Array of competitor profile objects",
      },
    },
    {
      name: "reportSlug",
      type: "text",
      unique: true,
      admin: {
        position: "sidebar",
        description:
          "Unique URL slug for this report. Auto-generated if left blank.",
      },
    },
    {
      name: "client",
      type: "relationship",
      relationTo: "clients",
      admin: {
        position: "sidebar",
        description: "Link to existing client (optional)",
      },
    },
    {
      name: "proposal",
      type: "relationship",
      relationTo: "client-proposals",
      admin: {
        position: "sidebar",
        description: "Link to client proposal (optional)",
      },
    },
  ],
};
