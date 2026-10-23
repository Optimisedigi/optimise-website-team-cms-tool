import type { CollectionConfig } from "payload";
import { adminOnlyDelete, clientBlogTaxonomyAccess } from "../lib/access";

/**
 * Questions tracked weekly in AI tools per topic authority (max 8 active per topic). Removed questions stay inactive so they are never re-added.
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
  ],
};
