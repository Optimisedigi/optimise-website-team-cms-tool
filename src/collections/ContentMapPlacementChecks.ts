import type { CollectionConfig } from "payload";
import { adminOnlyDelete, clientBlogTaxonomyAccess } from "../lib/access";

/**
 * Client placement checks from the PIN view, one row per check, used for the 20-per-day limit (src/lib/content-map/placement.ts). Rows older than 2 days are pruned.
 * Written by /api/content-map routes with overrideAccess; staff with access to
 * the client's blog settings may read them.
 */
export const ContentMapPlacementChecks: CollectionConfig = {
  slug: "content-map-placement-checks",
  lockDocuments: false,
  labels: { singular: "Content Map Placement Check", plural: "Content Map Placement Checks" },
  admin: {
    group: "Growth Tools",
    hidden: true,
    useAsTitle: "title",
    defaultColumns: ["client", "title", "createdAt"],
  },
  access: {
    read: clientBlogTaxonomyAccess,
    create: clientBlogTaxonomyAccess,
    update: clientBlogTaxonomyAccess,
    delete: adminOnlyDelete,
  },
  fields: [
    { name: "client", type: "relationship", relationTo: "clients", required: true, index: true },
    { name: "title", type: "text" },
  ],
};
