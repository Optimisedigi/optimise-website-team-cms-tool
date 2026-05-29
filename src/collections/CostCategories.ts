import type { CollectionConfig } from "payload";
import { canAccess, adminOnlyDelete, hideUnlessFeature } from "../lib/access";

export const CostCategories: CollectionConfig = {
  slug: "cost-categories",
  labels: { singular: "Cost Category", plural: "Cost Categories" },
  admin: {
    group: "Finance",
    useAsTitle: "name",
    defaultColumns: ["name", "color", "budget", "isActive"],
    hidden: hideUnlessFeature("cost-categories"),
  },
  access: {
    read: canAccess("cost-categories"),
    create: canAccess("cost-categories"),
    update: canAccess("cost-categories"),
    delete: adminOnlyDelete,
  },
  fields: [
    {
      name: "name",
      type: "text",
      required: true,
      unique: true,
    },
    {
      name: "color",
      type: "text",
      required: true,
      defaultValue: "#4A90D9",
      admin: {
        description: "Hex colour for charts, e.g. #4A90D9",
      },
    },
    {
      name: "budget",
      type: "number",
      admin: {
        description: "Monthly budget in AUD. Enables over-budget alerts when set.",
      },
    },
    {
      name: "isActive",
      type: "checkbox",
      defaultValue: true,
    },
  ],
};
