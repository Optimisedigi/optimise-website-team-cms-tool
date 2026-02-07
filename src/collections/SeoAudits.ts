import type { CollectionConfig, CollectionBeforeChangeHook } from "payload";

const autoGenerateSlug: CollectionBeforeChangeHook = ({ data }) => {
  if (data && !data.reportSlug && data.websiteUrl) {
    const domain = data.websiteUrl
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .replace(/[^a-zA-Z0-9.-]/g, "")
      .replace(/\./g, "-");
    const date = new Date().toISOString().slice(0, 10);
    data.reportSlug = `${domain}-${date}`;
  }
  return data;
};

export const SeoAudits: CollectionConfig = {
  slug: "seo-audits",
  admin: {
    useAsTitle: "websiteUrl",
    group: "Audits",
    defaultColumns: ["websiteUrl", "overallScore", "customerEmail", "createdAt"],
    description: "Full SEO audit reports from the growth tools",
  },
  hooks: {
    beforeChange: [autoGenerateSlug],
  },
  access: {
    read: ({ req }) => !!req.user,
    update: ({ req }) => !!req.user,
    delete: ({ req }) => {
      if (!req.user) return false;
      return req.user.role === "admin";
    },
    // Open create — secured by API key header from growth tools
    create: () => true,
  },
  fields: [
    {
      name: "viewReport",
      type: "ui",
      admin: {
        components: {
          Field: "./components/ViewReportLink",
        },
      },
    },
    {
      name: "downloadMarkdown",
      type: "ui",
      admin: {
        components: {
          Field: "./components/DownloadMarkdownButton",
        },
      },
    },
    {
      name: "websiteUrl",
      type: "text",
      required: true,
      admin: {
        description: "The URL that was audited",
      },
    },
    {
      name: "businessType",
      type: "text",
      required: true,
    },
    {
      name: "overallScore",
      type: "number",
      required: true,
      min: 0,
      max: 10,
      admin: {
        description: "Overall SEO score (0-10)",
      },
    },
    {
      name: "categoryScores",
      type: "json",
      required: true,
      admin: {
        description: "12-category scores object",
      },
    },
    {
      name: "pageResults",
      type: "json",
      admin: {
        description: "Full per-page breakdown array",
      },
    },
    {
      name: "siteWideFindings",
      type: "json",
      admin: {
        description: "Cross-page findings array",
      },
    },
    {
      name: "recommendations",
      type: "json",
      admin: {
        description: "Prioritised action list",
      },
    },
    {
      name: "pagesAnalyzed",
      type: "number",
      admin: {
        description: "Number of pages crawled",
      },
    },
    {
      name: "extractedData",
      type: "json",
      admin: {
        description: "Sitemap, robots, schema types, etc.",
      },
    },
    {
      name: "customerEmail",
      type: "email",
      admin: {
        description: "Email captured from gated form (if provided)",
      },
    },
    {
      name: "reportSlug",
      type: "text",
      unique: true,
      admin: {
        position: "sidebar",
        description:
          "Custom URL slug for the report (e.g. 'acme-corp-feb-2026'). Auto-generated from website URL if left blank.",
      },
    },
    {
      name: "reportPassword",
      type: "text",
      admin: {
        position: "sidebar",
        description:
          "Set a password to protect this report. Share it with the client so they can view the report.",
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
      name: "visitorIp",
      type: "text",
      admin: {
        position: "sidebar",
        description: "IP address of the visitor",
      },
    },
    {
      name: "visitorFingerprint",
      type: "text",
      admin: {
        position: "sidebar",
        description: "Browser fingerprint hash",
      },
    },
  ],
};
