import type { CollectionConfig } from "payload";
import { canAccess, adminOnlyDelete, hideUnlessFeature } from "../lib/access";

export const CostRules: CollectionConfig = {
  slug: "cost-rules",
  labels: { singular: "Cost Rule", plural: "Cost Rules" },
  admin: {
    group: "Costs Overview",
    useAsTitle: "pattern",
    defaultColumns: ["pattern", "category"],
    hidden: hideUnlessFeature("cost-rules"),
  },
  access: {
    read: canAccess("cost-rules"),
    create: canAccess("cost-rules"),
    update: canAccess("cost-rules"),
    delete: adminOnlyDelete,
  },
  fields: [
    {
      name: "pattern",
      type: "text",
      required: true,
      unique: true,
      admin: {
        description: "Case-insensitive substring to match against transaction descriptions, e.g. VERCEL",
      },
    },
    {
      name: "category",
      type: "relationship",
      relationTo: "cost-categories",
      required: true,
    },
  ],
};
