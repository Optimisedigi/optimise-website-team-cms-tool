import type { CollectionConfig } from "payload";

export const CostRules: CollectionConfig = {
  slug: "cost-rules",
  labels: { singular: "Cost Rule", plural: "Cost Rules" },
  admin: {
    group: "Finance",
    useAsTitle: "pattern",
    defaultColumns: ["pattern", "category"],
  },
  access: {
    read: ({ req }) => !!req.user,
    create: ({ req }) => !!req.user,
    update: ({ req }) => !!req.user,
    delete: ({ req }) => req.user?.role === "admin",
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
