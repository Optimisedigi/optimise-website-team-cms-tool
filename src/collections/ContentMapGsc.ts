import type { CollectionConfig } from "payload";
import { adminOnlyDelete, clientBlogTaxonomyAccess } from "../lib/access";

/**
 * Weekly Search Console pulls for the Content Map (query×page, last 28 days + previous 28 days by page). Retention: latest 8 per client (src/lib/content-map/gsc.ts).
 * Written by /api/content-map routes with overrideAccess; staff with access to
 * the client's blog settings may read them.
 */
export const ContentMapGsc: CollectionConfig = {
  slug: "content-map-gsc",
  lockDocuments: false,
  labels: { singular: "Content Map Search Console Pull", plural: "Content Map Search Console Pulls" },
  admin: {
    group: "Growth Tools",
    hidden: true,
    useAsTitle: "pulledAt",
    defaultColumns: ["client", "pulledAt", "periodStart", "periodEnd"],
  },
  access: {
    read: clientBlogTaxonomyAccess,
    create: clientBlogTaxonomyAccess,
    update: clientBlogTaxonomyAccess,
    delete: adminOnlyDelete,
  },
  fields: [
    { name: "client", type: "relationship", relationTo: "clients", required: true, index: true },
    { name: "pulledAt", type: "date", admin: { date: { pickerAppearance: "dayAndTime" } } },
    { name: "periodStart", type: "text" },
    { name: "periodEnd", type: "text" },
    { name: "pages", type: "json" },
    { name: "queries", type: "json" },
  ],
};
