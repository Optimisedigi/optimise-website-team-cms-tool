import type { CollectionConfig } from "payload";
import { adminOnlyDelete, clientBlogTaxonomyAccess } from "../lib/access";

/**
 * Content Map analysis runs from Growth Tools, one row per runId. Routes under
 * /api/content-map write these with overrideAccess; staff who can reach the
 * client's blog settings may read them. Retention: latest 12 completed per
 * client plus running (see src/lib/content-map/snapshots.ts).
 */
export const ContentMapSnapshots: CollectionConfig = {
  slug: "content-map-snapshots",
  // No payload_locked_documents_rels column needed (rows are written by routes, not edited).
  lockDocuments: false,
  labels: { singular: "Content Map Snapshot", plural: "Content Map Snapshots" },
  admin: {
    group: "Growth Tools",
    hidden: true,
    useAsTitle: "runId",
    defaultColumns: ["client", "status", "mode", "generatedAt", "startedAt"],
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
    {
      name: "status",
      type: "select",
      required: true,
      defaultValue: "running",
      options: [
        { label: "Running", value: "running" },
        { label: "Completed", value: "completed" },
        { label: "Failed", value: "failed" },
      ],
    },
    {
      name: "mode",
      type: "select",
      options: [
        { label: "Full", value: "full" },
        { label: "Refresh", value: "refresh" },
      ],
    },
    { name: "phase", type: "text" },
    { name: "pagesCrawled", type: "number" },
    { name: "error", type: "textarea" },
    { name: "pendingRefresh", type: "checkbox", defaultValue: false },
    { name: "startedAt", type: "date", admin: { date: { pickerAppearance: "dayAndTime" } } },
    { name: "generatedAt", type: "date", admin: { date: { pickerAppearance: "dayAndTime" } } },
    { name: "stats", type: "json" },
    { name: "data", type: "json" },
  ],
};
