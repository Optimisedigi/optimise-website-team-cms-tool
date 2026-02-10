import type { CollectionConfig, CollectionBeforeChangeHook } from "payload";
import crypto from "crypto";

const autoGenerateSlug: CollectionBeforeChangeHook = ({ data }) => {
  if (data && !data.reportSlug && data.websiteUrl) {
    const domain = data.websiteUrl
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .replace(/[^a-zA-Z0-9.-]/g, "")
      .replace(/\./g, "-");
    const date = new Date().toISOString().slice(0, 10);
    const rand = crypto.randomBytes(4).toString("hex");
    data.reportSlug = `kw-${domain}-${date}-${rand}`;
  }
  return data;
};

export const KeywordSnapshots: CollectionConfig = {
  slug: "keyword-snapshots",
  labels: {
    singular: "Keyword Snapshot",
    plural: "Keyword Snapshots",
  },
  admin: {
    useAsTitle: "websiteUrl",
    group: "Audits",
    defaultColumns: ["websiteUrl", "label", "totalKeywords", "createdAt"],
    description: "Keyword ranking snapshots from the growth tools",
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
    create: ({ req }) => {
      if (req.user) return true;
      const apiKey = req.headers.get?.("x-api-key") || (req.headers as any)?.["x-api-key"];
      if (!apiKey || !process.env.AUDIT_API_KEY) return false;
      const expected = Buffer.from(process.env.AUDIT_API_KEY);
      const provided = Buffer.from(String(apiKey));
      if (expected.length !== provided.length) return false;
      return crypto.timingSafeEqual(expected, provided);
    },
  },
  fields: [
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
                description: "The website these keywords were tracked for",
              },
            },
            {
              type: "row",
              fields: [
                {
                  name: "label",
                  type: "text",
                  admin: {
                    description: "Optional label for this snapshot (e.g. 'February 2026')",
                  },
                },
                {
                  name: "totalKeywords",
                  type: "number",
                  admin: { description: "Total keywords tracked" },
                },
              ],
            },
            {
              type: "row",
              fields: [
                {
                  name: "top10",
                  type: "number",
                  admin: { description: "Keywords ranking in top 10" },
                },
                {
                  name: "avgPosition",
                  type: "number",
                  admin: { description: "Average ranking position" },
                },
                {
                  name: "opportunities",
                  type: "number",
                  admin: { description: "Number of keyword opportunities" },
                },
              ],
            },
          ],
        },
        {
          label: "Keywords",
          fields: [
            {
              name: "keywords",
              type: "json",
              required: true,
              admin: {
                description:
                  "Keyword data — each entry has keyword, position, previousPosition, searchVolume, opportunity, location, lastUpdated",
              },
            },
          ],
        },
        {
          label: "Distribution",
          fields: [
            {
              name: "rankingDistribution",
              type: "json",
              admin: {
                description: "Ranking distribution — { top10, top20, top50, notFound }",
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
        description: "Unique URL slug for this keyword snapshot. Auto-generated if left blank.",
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
  ],
};
