import type { CollectionConfig } from "payload";
import { adminOnlyDelete, clientBlogTaxonomyAccess } from "../lib/access";

/**
 * Questions tracked weekly in AI tools: one per published article ("existing",
 * shown first), then up to 2 per topic for planned articles and suggestions
 * ("planned"). Removed questions stay inactive so they are never re-added.
 * Written by /api/content-map routes with overrideAccess; staff with access to
 * the client's blog settings may read them.
 */
export const ContentMapQuestions: CollectionConfig = {
  slug: "content-map-questions",
  lockDocuments: false,
  labels: { singular: "Content Map Question", plural: "Content Map Questions" },
  admin: {
    group: "Growth Tools",
    hidden: true,
    useAsTitle: "question",
    defaultColumns: ["client", "topic", "question", "source", "active"],
  },
  access: {
    read: clientBlogTaxonomyAccess,
    create: clientBlogTaxonomyAccess,
    update: clientBlogTaxonomyAccess,
    delete: adminOnlyDelete,
  },
  fields: [
    { name: "client", type: "relationship", relationTo: "clients", required: true, index: true },
    { name: "topic", type: "text", required: true },
    { name: "question", type: "text", required: true },
    { name: "source", type: "select", required: true, options: ["ai", "team", "client", "recommendation", "article"].map((v) => ({ label: v, value: v })) },
    { name: "active", type: "checkbox", defaultValue: true },
    // "existing": the question a published article answers (one per article, listed first).
    // "planned": planned articles and suggestions, per topic. Empty on rows from before 2026-10-24.
    { name: "questionGroup", type: "select", options: [{ label: "Existing article", value: "existing" }, { label: "Planned or suggested", value: "planned" }], index: true },
    { name: "blogPost", type: "relationship", relationTo: "blog-posts", index: true },
    { name: "pageId", type: "text" },
    { name: "pageTitle", type: "text" },
  ],
};
