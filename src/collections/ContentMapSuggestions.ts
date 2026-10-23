import type { CollectionConfig } from "payload";
import { adminOnlyDelete, clientBlogTaxonomyAccess } from "../lib/access";

/**
 * Content Map topic/article/bridge suggestions from the team, the client (PIN view) or AI. Pending until the team approves.
 * Written by /api/content-map routes with overrideAccess; staff with access to
 * the client's blog settings may read them.
 */
export const ContentMapSuggestions: CollectionConfig = {
  slug: "content-map-suggestions",
  lockDocuments: false,
  labels: { singular: "Content Map Suggestion", plural: "Content Map Suggestions" },
  admin: {
    group: "Growth Tools",
    hidden: true,
    useAsTitle: "title",
    defaultColumns: ["client", "kind", "title", "status", "origin"],
  },
  access: {
    read: clientBlogTaxonomyAccess,
    create: clientBlogTaxonomyAccess,
    update: clientBlogTaxonomyAccess,
    delete: adminOnlyDelete,
  },
  fields: [
    { name: "client", type: "relationship", relationTo: "clients", required: true, index: true },
    { name: "kind", type: "select", required: true, options: ["topic", "bridge", "article"].map((v) => ({ label: v, value: v })) },
    { name: "title", type: "text", required: true },
    { name: "why", type: "textarea" },
    { name: "topic", type: "text" },
    { name: "topicB", type: "text" },
    { name: "status", type: "select", required: true, defaultValue: "pending", options: ["pending", "approved", "dismissed"].map((v) => ({ label: v, value: v })) },
    { name: "origin", type: "select", required: true, options: ["team", "client", "ai"].map((v) => ({ label: v, value: v })) },
    { name: "suggestedBy", type: "text" },
    { name: "suggestedByUser", type: "relationship", relationTo: "users" },
    { name: "decidedBy", type: "text" },
    { name: "decidedAt", type: "date", admin: { date: { pickerAppearance: "dayAndTime" } } },
    { name: "dismissReason", type: "textarea" },
    { name: "brief", type: "json" },
    { name: "recommendationId", type: "text", index: true },
  ],
};
