import type { CollectionConfig } from "payload";
import { canAccess, hideUnlessFeature } from "../lib/access";

/**
 * Manually entered estimated invoices or costs for one month of the Costs
 * page year-end estimate (e.g. a one-off project or a known upcoming bill).
 * Added on top of the Xero/retainer/run-rate estimate for that month only.
 * Kind "retainer" instead replaces one client's monthly retainer in the
 * estimate (amount = the new monthly retainer; the client record is unchanged).
 * Managed from the year-end estimate panel.
 */
export const EstimateAdjustments: CollectionConfig = {
  slug: "estimate-adjustments",
  labels: { singular: "Estimate Adjustment", plural: "Estimate Adjustments" },
  // No payload_locked_documents_rels column needed (see estimate-adjustments schema).
  lockDocuments: false,
  admin: {
    group: "Finance",
    useAsTitle: "description",
    defaultColumns: ["month", "kind", "description", "amount", "account"],
    description: "Manual estimated invoices and costs for the year-end estimate on the Costs page.",
    hidden: hideUnlessFeature("business-costs"),
  },
  access: {
    read: canAccess("business-costs"),
    create: canAccess("business-costs"),
    update: canAccess("business-costs"),
    // Removing an estimate is part of normal use of the panel.
    delete: canAccess("business-costs"),
  },
  defaultSort: "month",
  fields: [
    {
      name: "month",
      type: "text",
      required: true,
      index: true,
      validate: (value: unknown) =>
        typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value) ? true : "Use YYYY-MM",
      admin: { description: "YYYY-MM" },
    },
    {
      name: "kind",
      type: "select",
      required: true,
      options: [
        { label: "Invoice", value: "invoiced" },
        { label: "Cost", value: "cost" },
        { label: "Retainer override", value: "retainer" },
      ],
    },
    {
      name: "amount",
      type: "number",
      required: true,
      admin: { description: "Ex-GST AUD. Negative reduces the month." },
    },
    { name: "description", type: "text", required: true },
    {
      name: "account",
      type: "text",
      admin: { description: "Xero cost category (costs only). Empty = \"Manual estimates\"." },
    },
    {
      name: "clientId",
      type: "number",
      index: true,
      admin: {
        description: "Client whose monthly retainer this replaces in the estimate (retainer overrides only).",
        condition: (data) => data?.kind === "retainer",
      },
    },
  ],
};
