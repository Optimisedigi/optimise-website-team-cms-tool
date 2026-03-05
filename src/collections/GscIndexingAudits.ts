import type { CollectionConfig } from "payload";

export const GscIndexingAudits: CollectionConfig = {
  slug: "gsc-indexing-audits",
  labels: {
    singular: "GSC Indexing Audit",
    plural: "GSC Indexing Audits",
  },
  admin: {
    useAsTitle: "status",
    group: "Growth Tools",
    defaultColumns: ["client", "status", "totalUrls", "inspectedCount", "createdAt"],
    description: "Full indexing audits via the URL Inspection API",
  },
  access: {
    read: ({ req }) => !!req.user,
    update: ({ req }) => !!req.user,
    delete: ({ req }) => {
      if (!req.user) return false;
      return req.user.role === "admin";
    },
    create: ({ req }) => !!req.user,
  },
  fields: [
    {
      type: "tabs",
      tabs: [
        {
          label: "Overview",
          fields: [
            {
              name: "infoPanel",
              type: "ui",
              admin: {
                components: {
                  Field: "./components/GscIndexingAuditInfo",
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
                description: "The client this audit belongs to",
              },
            },
            {
              name: "status",
              type: "select",
              required: true,
              defaultValue: "discovering",
              options: [
                { label: "Discovering URLs", value: "discovering" },
                { label: "Inspecting", value: "inspecting" },
                { label: "Completed", value: "completed" },
                { label: "Failed", value: "failed" },
              ],
              admin: {
                readOnly: true,
              },
            },
            {
              type: "row",
              fields: [
                {
                  name: "totalUrls",
                  type: "number",
                  defaultValue: 0,
                  admin: {
                    readOnly: true,
                    description: "Total URLs discovered",
                  },
                },
                {
                  name: "inspectedCount",
                  type: "number",
                  defaultValue: 0,
                  admin: {
                    readOnly: true,
                    description: "URLs inspected so far",
                  },
                },
              ],
            },
            {
              type: "row",
              fields: [
                {
                  name: "startedAt",
                  type: "date",
                  admin: {
                    readOnly: true,
                    description: "When the audit started",
                  },
                },
                {
                  name: "completedAt",
                  type: "date",
                  admin: {
                    readOnly: true,
                    description: "When the audit completed",
                  },
                },
                {
                  name: "lastBatchDate",
                  type: "date",
                  admin: {
                    readOnly: true,
                    description: "When the last batch was processed",
                  },
                },
              ],
            },
            {
              name: "error",
              type: "textarea",
              admin: {
                readOnly: true,
                description: "Error message if the audit failed",
                condition: (_data, siblingData) => !!siblingData?.error,
              },
            },
          ],
        },
        {
          label: "Summary",
          fields: [
            {
              name: "summaryStats",
              type: "json",
              admin: {
                readOnly: true,
                description: "Summary stats — { indexed, notIndexed, byReason: { [reason]: count } }",
              },
            },
            {
              name: "urlSources",
              type: "json",
              admin: {
                readOnly: true,
                description: "URL discovery sources — { sitemap: string[], searchAnalytics: string[] }",
              },
            },
          ],
        },
        {
          label: "Results",
          fields: [
            {
              name: "resultsView",
              type: "ui",
              admin: {
                components: {
                  Field: "./components/GscIndexingAuditResults",
                },
              },
            },
            {
              name: "discoveredUrls",
              type: "json",
              admin: {
                readOnly: true,
                description: "All discovered URLs — string[]",
              },
            },
            {
              name: "inspectionResults",
              type: "json",
              admin: {
                readOnly: true,
                description: "Inspection results — InspectionResult[]",
              },
            },
          ],
        },
      ],
    },
  ],
};
