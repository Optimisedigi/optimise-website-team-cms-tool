import type { CollectionConfig } from "payload";
import { hasValidApiKey } from "./api-key-access";
import { canAccessOrApiKey, adminOnlyDelete, hideUnlessFeature } from "../lib/access";

export const SiteHealthReports: CollectionConfig = {
  slug: "site-health-reports",
  labels: {
    singular: "Site Health Report",
    plural: "Site Health Reports",
  },
  admin: {
    useAsTitle: "siteUrl",
    group: "Growth Tools",
    defaultColumns: ["client", "siteUrl", "healthScore", "reportDate"],
    description: "Monthly Ahrefs-style SEO health audit reports",
    hidden: hideUnlessFeature("site-health-reports"),
  },
  access: {
    read: canAccessOrApiKey("site-health-reports", hasValidApiKey),
    update: canAccessOrApiKey("site-health-reports", hasValidApiKey),
    delete: adminOnlyDelete,
    create: canAccessOrApiKey("site-health-reports", hasValidApiKey),
  },
  fields: [
    {
      type: "row",
      fields: [
        {
          name: "client",
          type: "relationship",
          relationTo: "clients",
          required: true,
          admin: {
            description: "Client this report belongs to",
            width: "25%",
          },
        },
        {
          name: "siteUrl",
          type: "text",
          required: true,
          admin: {
            width: "35%",
          },
        },
        {
          name: "runAudit",
          type: "ui",
          admin: {
            width: "40%",
            components: {
              Field: "./components/RunSiteHealthButton",
            },
          },
        },
      ],
    },
    {
      name: "reportDate",
      type: "date",
      required: true,
      defaultValue: () => new Date().toISOString(),
      admin: {
        hidden: true,
        date: { pickerAppearance: "dayOnly", displayFormat: "d MMM yyyy" },
      },
    },
    {
      name: "reportView",
      type: "ui",
      admin: {
        components: {
          Field: "./components/SiteHealthReportView",
        },
      },
    },
    {
      name: "auditStatus",
      type: "select",
      options: [
        { label: "Pending", value: "pending" },
        { label: "Running", value: "running" },
        { label: "Completed", value: "completed" },
        { label: "Failed", value: "failed" },
      ],
      defaultValue: "pending",
      admin: { hidden: true },
    },
    {
      name: "auditProgress",
      type: "text",
      admin: {
        hidden: true,
        description: "Stage|percentage format",
        readOnly: true,
      },
    },
    {
      name: "auditError",
      type: "text",
      admin: {
        hidden: true,
        readOnly: true,
      },
    },
    {
      type: "tabs",
      admin: { hidden: true },
      tabs: [
        {
          label: "Overview",
          fields: [
            {
              name: "healthScore",
              type: "number",
              min: 0,
              max: 100,
              admin: { description: "% of URLs free of critical issues" },
            },
            {
              name: "crawlStats",
              type: "group",
              fields: [
                {
                  type: "row",
                  fields: [
                    { name: "totalPagesCrawled", type: "number", admin: { width: "33%" } },
                    { name: "totalPagesInSitemap", type: "number", admin: { width: "33%" } },
                    { name: "crawlDurationMs", type: "number", admin: { width: "33%" } },
                  ],
                },
              ],
            },
            {
              name: "issuesSummary",
              type: "group",
              fields: [
                {
                  type: "row",
                  fields: [
                    { name: "critical", type: "number", admin: { width: "25%" } },
                    { name: "warning", type: "number", admin: { width: "25%" } },
                    { name: "notice", type: "number", admin: { width: "25%" } },
                    { name: "total", type: "number", admin: { width: "25%" } },
                  ],
                },
              ],
            },
            {
              name: "issuesByCategory",
              type: "json",
              admin: {
                description: "Issues grouped by category with counts per severity",
              },
            },
            {
              name: "comparison",
              type: "group",
              admin: { description: "Month-over-month comparison (if previous report exists)" },
              fields: [
                {
                  type: "row",
                  fields: [
                    { name: "previousScore", type: "number", admin: { width: "25%" } },
                    { name: "scoreChange", type: "number", admin: { width: "25%" } },
                    { name: "newIssues", type: "number", admin: { width: "25%" } },
                    { name: "fixedIssues", type: "number", admin: { width: "25%" } },
                  ],
                },
                { name: "previousDate", type: "text" },
              ],
            },
          ],
        },
        {
          label: "Issues",
          fields: [
            {
              name: "issues",
              type: "json",
              admin: {
                description: "Full list of SiteHealthIssue objects (severity, category, type, message, url, details)",
              },
            },
          ],
        },
        {
          label: "Pages",
          fields: [
            {
              name: "pages",
              type: "json",
              admin: {
                description: "Per-page summary data (SiteHealthPageSummary objects)",
              },
            },
          ],
        },
        {
          label: "GSC Data",
          fields: [
            {
              name: "gscData",
              type: "group",
              admin: { description: "Google Search Console data (if available)" },
              fields: [
                {
                  type: "row",
                  fields: [
                    { name: "indexedPages", type: "number", admin: { width: "25%" } },
                    { name: "notIndexedPages", type: "number", admin: { width: "25%" } },
                    { name: "totalClicks", type: "number", admin: { width: "25%" } },
                    { name: "totalImpressions", type: "number", admin: { width: "25%" } },
                  ],
                },
                {
                  type: "row",
                  fields: [
                    { name: "averageCtr", type: "number", admin: { width: "50%" } },
                    { name: "averagePosition", type: "number", admin: { width: "50%" } },
                  ],
                },
                {
                  name: "indexingIssues",
                  type: "json",
                  admin: { description: "Array of {url, reason}" },
                },
                {
                  name: "canonicalMismatches",
                  type: "json",
                  admin: { description: "Array of {url, userCanonical, googleCanonical}" },
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};
