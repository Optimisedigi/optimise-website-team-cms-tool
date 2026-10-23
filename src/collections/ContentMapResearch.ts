import type { CollectionConfig } from "payload";
import { adminOnlyDelete, clientBlogTaxonomyAccess } from "../lib/access";

/**
 * Research runs from Growth Tools (keyword volumes, questions, competitor pages), one row per runId. `insights` holds the CMS placement output (ideas, plan briefs, in-progress checks). Retention: latest 12 completed per client (src/lib/content-map/research.ts).
 * Written by /api/content-map routes with overrideAccess; staff with access to
 * the client's blog settings may read them.
 */
export const ContentMapResearch: CollectionConfig = {
  slug: "content-map-research",
  lockDocuments: false,
  labels: { singular: "Content Map Research Run", plural: "Content Map Research Runs" },
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
