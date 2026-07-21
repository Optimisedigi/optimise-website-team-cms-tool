import type { CollectionConfig } from "payload";
import { adminOnlyDelete } from "../lib/access";

export const SearchQueryReviewGroups: CollectionConfig = {
  slug: "search-query-review-groups",
  dbName: "search_query_review_groups",
  labels: { singular: "Search Query Review Group", plural: "Search Query Review Groups" },
  admin: { group: "Growth Tools", useAsTitle: "fingerprint", defaultColumns: ["fingerprint", "classificationState", "client", "updatedAt"] },
  access: { read: ({ req }) => !!req.user, create: ({ req }) => !!req.user, update: ({ req }) => !!req.user, delete: adminOnlyDelete },
  indexes: [{ fields: ["snapshot", "fingerprint"], unique: true }, { fields: ["client", "classificationState"] }],
  fields: [
    { name: "snapshot", type: "relationship", relationTo: "google-ads-audit-snapshots", required: true, index: true },
    { name: "client", type: "relationship", relationTo: "clients", required: true, index: true },
    { name: "fingerprint", type: "text", required: true },
    { name: "classificationState", type: "select", required: true, defaultValue: "review", options: ["relevant", "irrelevant", "review", "split"] },
    { name: "representativeTerms", type: "json", required: true },
    { name: "metrics", type: "json", required: true },
    { name: "sourceRows", type: "json", required: true },
    { name: "contexts", type: "json" },
    { name: "rationale", type: "json" },
    { name: "reviewerDecision", type: "json" },
    { name: "vocabulary", type: "relationship", relationTo: "search-query-vocabulary" as any },
    { name: "negativeCandidates", type: "relationship", relationTo: "negative-sweep-candidates", hasMany: true },
  ],
};
