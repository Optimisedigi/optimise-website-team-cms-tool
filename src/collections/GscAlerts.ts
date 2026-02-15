import type { CollectionConfig } from "payload";
import { hasValidApiKey } from "./api-key-access";

export const GscAlerts: CollectionConfig = {
  slug: "gsc-alerts",
  labels: {
    singular: "GSC Alert",
    plural: "GSC Alerts",
  },
  admin: {
    useAsTitle: "title",
    group: "Audits",
    defaultColumns: ["client", "severity", "category", "title", "resolved", "createdAt"],
    description: "Alerts triggered by GSC snapshot comparisons",
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
      name: "client",
      type: "relationship",
      relationTo: "clients",
      required: true,
      admin: {
        description: "The client this alert belongs to",
      },
    },
    {
      name: "snapshot",
      type: "relationship",
      relationTo: "gsc-snapshots",
      required: true,
      admin: {
        description: "The snapshot that triggered this alert",
      },
    },
    {
      type: "row",
      fields: [
        {
          name: "severity",
          type: "select",
          required: true,
          options: [
            { label: "Critical", value: "critical" },
            { label: "Warning", value: "warning" },
            { label: "Info", value: "info" },
          ],
          admin: {
            description: "Alert severity level",
          },
        },
        {
          name: "category",
          type: "select",
          required: true,
          options: [
            { label: "Indexing", value: "indexing" },
            { label: "Performance", value: "performance" },
            { label: "Core Web Vitals", value: "cwv" },
            { label: "Keyword", value: "keyword" },
            { label: "Sitemap", value: "sitemap" },
          ],
          admin: {
            description: "Alert category",
          },
        },
      ],
    },
    {
      name: "title",
      type: "text",
      required: true,
      admin: {
        description: 'Short alert title (e.g., "Indexing dropped 15%")',
      },
    },
    {
      name: "description",
      type: "textarea",
      admin: {
        description: "Detailed explanation of the issue",
      },
    },
    {
      name: "actionable",
      type: "checkbox",
      defaultValue: false,
      admin: {
        description:
          'Whether we can directly fix this (true for "built by us" clients)',
      },
    },
    {
      name: "recommendation",
      type: "textarea",
      admin: {
        description: "Recommended action to resolve the issue",
      },
    },
    {
      type: "row",
      fields: [
        {
          name: "resolved",
          type: "checkbox",
          defaultValue: false,
          admin: {
            description: "Whether this alert has been resolved",
          },
        },
        {
          name: "resolvedAt",
          type: "date",
          admin: {
            description: "When the alert was resolved",
            condition: (_data, siblingData) => siblingData?.resolved,
          },
        },
      ],
    },
  ],
};
