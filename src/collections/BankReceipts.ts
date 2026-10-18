import type { CollectionConfig } from "payload";
import { canAccess, adminOnlyDelete, hideUnlessFeature } from "../lib/access";

/**
 * Money received, imported from the credit rows of bank statement CSVs
 * (debits go to `business-costs`). Feeds the "received" column of the
 * Sales vs Costs view. Kept separate from business-costs so every existing
 * cost total stays expense-only.
 */
export const BankReceipts: CollectionConfig = {
  slug: "bank-receipts",
  labels: { singular: "Bank Receipt", plural: "Bank Receipts" },
  // No payload_locked_documents_rels column needed (see bank-receipts schema).
  lockDocuments: false,
  admin: {
    components: { beforeList: ["./components/SectionTabs"] },
    group: "Finance",
    useAsTitle: "description",
    defaultColumns: ["date", "description", "amount", "source"],
    description:
      "Money in from imported bank statements. Delete transfers between your own accounts, refunds or loans so they don't count as sales received.",
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
      admin: { description: "Positive = money received (AUD)" },
    },
    {
      name: "description",
      type: "text",
      required: true,
      admin: { description: "Payer / reference from the bank statement" },
    },
    {
      name: "source",
      type: "select",
      defaultValue: "csv_import",
      options: [
        { label: "CSV Import", value: "csv_import" },
        { label: "Manual", value: "manual" },
      ],
    },
    {
      name: "month",
      type: "text",
      index: true,
      admin: { readOnly: true, description: "Auto-derived YYYY-MM" },
    },
    {
      name: "year",
      type: "number",
      admin: { readOnly: true, description: "Auto-derived" },
    },
    {
      name: "importBatch",
      type: "text",
      admin: { readOnly: true, description: "Groups CSV imports" },
    },
  ],
};
