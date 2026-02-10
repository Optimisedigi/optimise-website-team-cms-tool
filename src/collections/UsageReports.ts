import type { CollectionConfig } from "payload";
import { hasValidApiKey } from "./api-key-access";

export const UsageReports: CollectionConfig = {
  slug: "usage-reports",
  labels: {
    singular: "Usage Report",
    plural: "Usage Reports",
  },
  admin: {
    useAsTitle: "label",
    group: "Audits",
    defaultColumns: ["label", "seoAudits", "croAudits", "totalEstimatedCost", "createdAt"],
    description: "Monthly usage and estimated API cost reports from the growth tools",
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
  hooks: {
    beforeChange: [
      ({ data }) => {
        if (data && !data.label && data.month && data.year) {
          const months = [
            "January", "February", "March", "April", "May", "June",
            "July", "August", "September", "October", "November", "December",
          ];
          data.label = `${months[data.month - 1] || "Month " + data.month} ${data.year}`;
        }
        return data;
      },
    ],
  },
  fields: [
    {
      type: "tabs",
      tabs: [
        {
          label: "Usage",
          fields: [
            {
              name: "label",
              type: "text",
              admin: {
                description: "Auto-generated from month/year (e.g. 'February 2026')",
              },
            },
            {
              type: "row",
              fields: [
                {
                  name: "month",
                  type: "number",
                  required: true,
                  min: 1,
                  max: 12,
                  admin: { description: "Month (1–12)" },
                },
                {
                  name: "year",
                  type: "number",
                  required: true,
                  admin: { description: "Year (e.g. 2026)" },
                },
              ],
            },
            {
              type: "row",
              fields: [
                {
                  name: "seoAudits",
                  type: "number",
                  defaultValue: 0,
                  admin: { description: "Total SEO audits this month" },
                },
                {
                  name: "croAudits",
                  type: "number",
                  defaultValue: 0,
                  admin: { description: "Total CRO audits this month" },
                },
              ],
            },
            {
              type: "row",
              fields: [
                {
                  name: "keywordSnapshots",
                  type: "number",
                  defaultValue: 0,
                  admin: { description: "Total keyword snapshots this month" },
                },
                {
                  name: "totalKeywordsTracked",
                  type: "number",
                  defaultValue: 0,
                  admin: { description: "Total individual keywords looked up" },
                },
              ],
            },
          ],
        },
        {
          label: "Costs",
          fields: [
            {
              name: "estimatedCosts",
              type: "json",
              admin: {
                description: "Breakdown — { serper, moonshot, postmark, total }",
              },
            },
            {
              name: "totalEstimatedCost",
              type: "number",
              admin: {
                description: "Total estimated cost for the month (AUD)",
              },
            },
          ],
        },
      ],
    },
  ],
};
