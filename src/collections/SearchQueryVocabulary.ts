import type { CollectionConfig } from "payload";
import { adminOnlyDelete } from "../lib/access";

export const SearchQueryVocabulary: CollectionConfig = {
  slug: "search-query-vocabulary",
  dbName: "search_query_vocabulary",
  labels: { singular: "Search Query Vocabulary", plural: "Search Query Vocabulary" },
  admin: { group: "Growth Tools", hidden: true, useAsTitle: "phrase", defaultColumns: ["phrase", "classification", "scope", "client", "enabled"] },
  access: { read: ({ req }) => !!req.user, create: ({ req }) => !!req.user, update: ({ req }) => !!req.user, delete: adminOnlyDelete },
  indexes: [{ fields: ["client", "normalizedPhrase"], unique: true }],
  fields: [
    { name: "client", type: "relationship", relationTo: "clients", required: true, index: true },
    { name: "phrase", type: "text", required: true },
    { name: "normalizedPhrase", type: "text", required: true, index: true, admin: { readOnly: true } },
    { name: "classification", type: "select", required: true, options: ["relevant", "irrelevant"] },
    { name: "scope", type: "select", required: true, options: ["brand", "service", "product", "category", "universal"] },
    { name: "source", type: "select", required: true, options: ["frozen_audit", "client_managed", "team_decision", "universal_rule"] },
    { name: "enabled", type: "checkbox", defaultValue: true },
    { name: "expiresAt", type: "date" },
    { name: "reviewNote", type: "textarea" },
    { name: "auditDecisionTrail", type: "json", defaultValue: [] },
  ],
};
