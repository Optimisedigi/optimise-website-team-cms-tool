import type { CollectionConfig } from "payload";

/**
 * Cache for the "Estimated Avoided Spend" dashboard feature.
 *
 * One row per (client, keyword, matchType, yearMonth). Past months are
 * stored as immutable (`isFinal: 1`) and never refetched. The current month
 * is refreshed at most once per hour (see /api/dashboard/avoided-spend).
 *
 * Hidden from the sidebar (admins access via direct URL only) — this is a
 * narrow internal cache table, not user-managed data.
 */
export const NegativeKeywordAvoidedSpendCache: CollectionConfig = {
  slug: "negative-keyword-avoided-spend-cache",
  labels: {
    singular: "Avoided Spend Cache Row",
    plural: "Avoided Spend Cache Rows",
  },
  admin: {
    hidden: true,
    useAsTitle: "keyword",
    defaultColumns: ["client", "keyword", "matchType", "yearMonth", "spend", "isFinal", "fetchedAt"],
  },
  access: {
    // Admin-only: this is internal cache state.
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
      name: "keyword",
      type: "text",
      required: true,
      index: true,
    },
    {
      name: "matchType",
      type: "select",
      required: true,
      options: [
        { label: "Exact", value: "EXACT" },
        { label: "Phrase", value: "PHRASE" },
        { label: "Broad", value: "BROAD" },
      ],
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
      name: "spend",
      type: "number",
      required: true,
      defaultValue: 0,
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
