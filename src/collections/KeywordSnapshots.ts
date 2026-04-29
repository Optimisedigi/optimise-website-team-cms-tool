import type { CollectionConfig, CollectionBeforeChangeHook } from "payload";
import crypto from "crypto";
import { hasValidApiKey } from "./api-key-access";
import { logActivity } from "../lib/activity-log";
import { canAccessOrApiKey, adminOnlyDelete, hideUnlessFeature } from "../lib/access";

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
    group: "Growth Tools",
    defaultColumns: ["websiteUrl", "label", "totalKeywords", "createdAt"],
    description: "Keyword ranking snapshots from the growth tools",
    hidden: hideUnlessFeature("keyword-snapshots"),
  },
  hooks: {
    beforeChange: [autoGenerateSlug],
    afterChange: [
      async ({ doc, operation, req }) => {
        if (operation === "create") {
          logActivity(req.payload, {
            type: "keyword_analysis",
            title: `Keyword snapshot: ${doc.websiteUrl}`,
            description: doc.label || `${doc.totalKeywords ?? 0} keywords tracked`,
            user: req.user?.id,
            client: typeof doc.client === "object" ? doc.client?.id : doc.client,
          }).catch(() => {});
        }
      },
    ],
  },
  access: {
    read: canAccessOrApiKey("keyword-snapshots", hasValidApiKey),
    update: canAccessOrApiKey("keyword-snapshots", hasValidApiKey),
    delete: adminOnlyDelete,
    create: canAccessOrApiKey("keyword-snapshots", hasValidApiKey),
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
