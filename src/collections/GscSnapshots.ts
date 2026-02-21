import type { CollectionConfig } from "payload";
import { hasValidApiKey } from "./api-key-access";

export const GscSnapshots: CollectionConfig = {
  slug: "gsc-snapshots",
  labels: {
    singular: "GSC Snapshot",
    plural: "GSC Snapshots",
  },
  admin: {
    useAsTitle: "snapshotDate",
    group: "Audits",
    defaultColumns: ["client", "snapshotDate", "totalClicks", "totalImpressions", "avgPosition"],
    description: "Monthly Google Search Console data snapshots",
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
      type: "tabs",
      tabs: [
        {
          label: "Overview",
          fields: [
            {
              name: "client",
              type: "relationship",
              relationTo: "clients",
              required: true,
              admin: {
                description: "The client this snapshot belongs to",
              },
            },
            {
              name: "snapshotDate",
              type: "date",
              required: true,
              admin: {
                description: "Date this snapshot was taken",
              },
            },
            {
              type: "row",
              fields: [
                {
                  name: "periodStart",
                  type: "date",
                  required: true,
                  admin: {
                    description: "Start of the reporting period",
                  },
                },
                {
                  name: "periodEnd",
                  type: "date",
                  required: true,
                  admin: {
                    description: "End of the reporting period",
                  },
                },
              ],
            },
          ],
        },
        {
          label: "Search Performance",
          fields: [
            {
              type: "row",
              fields: [
                {
                  name: "totalClicks",
                  type: "number",
                  admin: {
                    description: "Total clicks from search",
                  },
                },
                {
                  name: "totalImpressions",
                  type: "number",
                  admin: {
                    description: "Total search impressions",
                  },
                },
              ],
            },
            {
              type: "row",
              fields: [
                {
                  name: "avgCtr",
                  type: "number",
                  admin: {
                    description: "Average click-through rate (%)",
                  },
                },
                {
                  name: "avgPosition",
                  type: "number",
                  admin: {
                    description: "Average search position",
                  },
                },
              ],
            },
            {
              name: "topKeywords",
              type: "json",
              admin: {
                description:
                  "Top keywords — array of {keyword, clicks, impressions, ctr, position}",
              },
            },
            {
              name: "topPages",
              type: "json",
              admin: {
                description:
                  "Top pages — array of {page, clicks, impressions, ctr, position}",
              },
            },
            {
              name: "brandedData",
              type: "json",
              admin: {
                description:
                  "Brand query metrics — {clicks, impressions, ctr, position}",
              },
            },
            {
              name: "nonBrandedData",
              type: "json",
              admin: {
                description:
                  "Non-brand query metrics — {clicks, impressions, ctr, position, topQueries: [...]}",
              },
            },
          ],
        },
        {
          label: "Indexing",
          fields: [
            {
              type: "row",
              fields: [
                {
                  name: "indexedPages",
                  type: "number",
                  admin: {
                    description: "Number of indexed pages",
                  },
                },
                {
                  name: "notIndexedPages",
                  type: "number",
                  admin: {
                    description: "Number of pages not indexed",
                  },
                },
              ],
            },
            {
              name: "indexingIssues",
              type: "json",
              admin: {
                description:
                  "Indexing issues — array of {reason, count, urls}",
              },
            },
          ],
        },
        {
          label: "Sitemaps",
          fields: [
            {
              name: "sitemaps",
              type: "json",
              admin: {
                description:
                  "Sitemaps — array of {url, lastSubmitted, isPending, warnings, errors}",
              },
            },
          ],
        },
        {
          label: "Core Web Vitals",
          fields: [
            {
              name: "cwvMobile",
              type: "json",
              admin: {
                description:
                  "Mobile CWV — {lcp, fid, cls, status} where status is GOOD/NEEDS_IMPROVEMENT/POOR",
              },
            },
            {
              name: "cwvDesktop",
              type: "json",
              admin: {
                description:
                  "Desktop CWV — {lcp, fid, cls, status}",
              },
            },
          ],
        },
        {
          label: "Comparison",
          fields: [
            {
              type: "row",
              fields: [
                {
                  name: "clicksChange",
                  type: "number",
                  admin: {
                    description: "Clicks change vs previous period (%)",
                  },
                },
                {
                  name: "impressionsChange",
                  type: "number",
                  admin: {
                    description: "Impressions change vs previous period (%)",
                  },
                },
                {
                  name: "positionChange",
                  type: "number",
                  admin: {
                    description:
                      "Position change vs previous period (negative = improved)",
                  },
                },
              ],
            },
            {
              name: "previousSnapshot",
              type: "relationship",
              relationTo: "gsc-snapshots",
              admin: {
                readOnly: true,
                description: "Previous snapshot for comparison",
              },
            },
          ],
        },
      ],
    },
  ],
};
