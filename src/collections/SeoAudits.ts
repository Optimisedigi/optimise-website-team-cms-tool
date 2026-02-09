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
  labels: {
    singular: "SEO Audit",
    plural: "SEO Audits",
  },
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
      type: "tabs",
      tabs: [
        {
          label: "Overview",
          fields: [
            {
              name: "websiteUrl",
              label: "Website URL",
              type: "text",
              required: true,
              admin: {
                description: "The URL that was audited",
              },
            },
            {
              type: "row",
              fields: [
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
                  name: "pagesAnalyzed",
                  type: "number",
                  admin: {
                    description: "Number of pages crawled",
                  },
                },
              ],
            },
            {
              name: "customerEmail",
              type: "email",
              admin: {
                description: "Email captured from gated form (if provided)",
              },
            },
          ],
        },
        {
          label: "Category Scores",
          fields: [
            {
              name: "categoryScores",
              type: "json",
              required: true,
              admin: {
                description:
                  "Scores per category (metaData, headingStructure, structuredData, internalLinking, imageOptimization, urlStructure, coreWebVitals, navigationUx, eeat, faqImplementation, contentStructure, serviceCoverage)",
              },
            },
          ],
        },
        {
          label: "Page Results",
          fields: [
            {
              name: "pageResults",
              type: "json",
              admin: {
                description:
                  "Per-page breakdown — each entry has url, pageType, scores, and findings",
              },
            },
          ],
        },
        {
          label: "Findings",
          fields: [
            {
              name: "siteWideFindings",
              type: "json",
              admin: {
                description:
                  "Cross-page findings — each entry has category, score, status (good/warning/critical), and message",
              },
            },
          ],
        },
        {
          label: "Recommendations",
          fields: [
            {
              name: "recommendations",
              type: "json",
              admin: {
                description:
                  "Prioritised action list — each entry has priority, title, description, impact, and estimatedLift",
              },
            },
          ],
        },
        {
          label: "Technical Data",
          fields: [
            {
              name: "extractedData",
              type: "json",
              admin: {
                description:
                  "Technical data — sitemapFound, robotsTxtFound, schemaTypes, totalInternalLinks, totalImages, imagesWithoutAlt",
              },
            },
          ],
        },
      ],
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
