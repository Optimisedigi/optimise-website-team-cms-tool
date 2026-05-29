import type { CollectionConfig } from "payload";
import { canAccess, adminOnlyDelete, hideUnlessFeature } from "../lib/access";

export const BusinessCosts: CollectionConfig = {
  slug: "business-costs",
  labels: { singular: "Costs Overview", plural: "Costs Overview" },
  admin: {
    group: "Finance",
    defaultColumns: ["date", "description", "amount", "category", "source"],
    components: {
      views: {
        list: {
          Component: "./components/BusinessCostsListView",
        },
      },
    },
    hidden: hideUnlessFeature("business-costs"),
  },
  access: {
    read: canAccess("business-costs"),
    create: canAccess("business-costs"),
    update: canAccess("business-costs"),
    delete: adminOnlyDelete,
  },
  hooks: {
    beforeChange: [
      ({ data }) => {
        if (data?.date) {
          const d = new Date(data.date);
          data.month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
          data.year = d.getFullYear();
        }
        return data;
      },
    ],
  },
  fields: [
    {
      name: "date",
      type: "date",
      required: true,
      admin: { date: { pickerAppearance: "dayOnly", displayFormat: "dd/MM/yyyy" } },
    },
    {
      name: "amount",
      type: "number",
      required: true,
      admin: { description: "Positive = expense (AUD)" },
    },
    {
      name: "description",
      type: "text",
      required: true,
      admin: { description: "Merchant / payee name" },
    },
    {
      name: "category",
      type: "relationship",
      relationTo: "cost-categories",
    },
    {
      name: "notes",
      type: "textarea",
    },
    {
      name: "source",
      type: "select",
      defaultValue: "manual",
      options: [
        { label: "CSV Import", value: "csv_import" },
        { label: "Manual", value: "manual" },
      ],
    },
    {
      name: "month",
      type: "text",
      admin: { readOnly: true, description: "Auto-derived YYYY-MM" },
    },
    {
      name: "year",
      type: "number",
      admin: { readOnly: true, description: "Auto-derived" },
    },
    {
      name: "client",
      type: "relationship",
      relationTo: "clients",
      admin: { description: "Link contractor costs to a client" },
    },
    {
      name: "importBatch",
      type: "text",
      admin: { readOnly: true, description: "Groups CSV imports" },
    },
  ],
};
