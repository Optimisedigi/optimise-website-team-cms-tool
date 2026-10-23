import type { CollectionConfig } from "payload";
import { adminOnlyDelete, clientBlogTaxonomyAccess } from "../lib/access";

/**
 * AI citation watch runs from Growth Tools, one row per runId. Retention: latest 12 completed per client (src/lib/content-map/citations.ts).
 * Written by /api/content-map routes with overrideAccess; staff with access to
 * the client's blog settings may read them.
 */
export const ContentMapCitations: CollectionConfig = {
  slug: "content-map-citations",
  lockDocuments: false,
  labels: { singular: "Content Map Citation Run", plural: "Content Map Citation Runs" },
  admin: {
    group: "Growth Tools",
    hidden: true,
    useAsTitle: "runId",
    defaultColumns: ["client", "status", "generatedAt", "startedAt"],
  },
  access: {
    read: clientBlogTaxonomyAccess,
    create: clientBlogTaxonomyAccess,
    update: clientBlogTaxonomyAccess,
    delete: adminOnlyDelete,
  },
  fields: [
    { name: "client", type: "relationship", relationTo: "clients", required: true, index: true },
    { name: "runId", type: "text", required: true, unique: true, index: true },
    { name: "status", type: "select", required: true, defaultValue: "running", options: ["running", "completed", "failed"].map((v) => ({ label: v, value: v })) },
    { name: "phase", type: "text" },
    { name: "error", type: "textarea" },
    { name: "startedAt", type: "date", admin: { date: { pickerAppearance: "dayAndTime" } } },
    { name: "generatedAt", type: "date", admin: { date: { pickerAppearance: "dayAndTime" } } },
    { name: "result", type: "json" },
    { name: "insights", type: "json" },
    { name: "stats", type: "json" },
  ],
};
