import type { CollectionConfig } from "payload";

/**
 * Cache for the dashboard's "Monthly Trend" waste / relevancy chart.
 *
 * One row per (client, yearMonth). Past months are stored as immutable
 * (`isFinal: 1`) and never refetched. The current month is refreshed at
 * most once per hour (see /api/dashboard/monthly-waste-relevancy).
 *
 * Hidden from the sidebar (admins access via direct URL only) — this is a
 * narrow internal cache table, not user-managed data.
 *
 * Trade-off documented in the plan: when the team adds new negatives to
 * the NKL set, historical irrelevant-spend numbers reflect the previous
 * NKL until the next nightly cron run. Refresh is daily, not on every
 * NKL edit, to keep Growth Tools GAQL pulls cheap.
 */
export const NegativeKeywordMonthlyWasteRelevancyCache: CollectionConfig = {
  slug: "negative-keyword-monthly-waste-relevancy-cache",
  labels: {
    singular: "Monthly Waste/Relevancy Cache Row",
    plural: "Monthly Waste/Relevancy Cache Rows",
  },
  admin: {
    hidden: true,
    useAsTitle: "yearMonth",
    defaultColumns: [
      "client",
      "yearMonth",
      "totalSpend",
      "nonConvertingSpend",
      "irrelevantSpend",
      "isFinal",
      "fetchedAt",
    ],
  },
  access: {
    read: ({ req }) => req.user?.role === "admin",
    create: ({ req }) => req.user?.role === "admin",
    update: ({ req }) => req.user?.role === "admin",
    delete: ({ req }) => req.user?.role === "admin",
  },
  fields: [
    {
      name: "client",
      type: "relationship",
      relationTo: "clients",
      required: true,
      index: true,
    },
    {
      name: "yearMonth",
      type: "text",
      required: true,
      index: true,
      admin: {
        description: "YYYY-MM",
      },
    },
    {
      name: "totalSpend",
      type: "number",
      required: true,
      defaultValue: 0,
      admin: {
        description: "Sum of cost across all search terms that month.",
      },
    },
    {
      name: "nonConvertingSpend",
      type: "number",
      required: true,
      defaultValue: 0,
      admin: {
        description: "Cost on terms with 0 conversions that month.",
      },
    },
    {
      name: "irrelevantSpend",
      type: "number",
      required: true,
      defaultValue: 0,
      admin: {
        description: "Cost on terms blocked by NORMAL negatives (counts against relevancy).",
      },
    },
    {
      name: "competitorExcludedSpend",
      type: "number",
      defaultValue: 0,
      admin: {
        description: "Cost on terms blocked only by competitor-tagged NKLs. Excluded from the default relevancy %; foldable in via the dashboard competitor toggle.",
      },
    },
    {
      name: "brandExcludedSpend",
      type: "number",
      defaultValue: 0,
      admin: {
        description: "Cost on terms blocked only by brand-tagged NKLs. Excluded from the default relevancy %; foldable in via the dashboard brand toggle.",
      },
    },
    {
      name: "brandSpend",
      type: "number",
      defaultValue: 0,
      admin: {
        description: "Cost on search terms matching the client's brand keywords (substring match).",
      },
    },
    {
      name: "isFinal",
      type: "checkbox",
      defaultValue: false,
      admin: {
        description: "True once the month is in the past — never refetched.",
      },
    },
    {
      name: "fetchedAt",
      type: "text",
      required: true,
      admin: {
        description: "ISO timestamp of the last fetch from Growth Tools.",
      },
    },
  ],
};
