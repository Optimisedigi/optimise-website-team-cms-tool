import type { CollectionConfig } from "payload";
import { canAccess, adminOnlyDelete, hideUnlessFeature } from "../lib/access";

/**
 * One row per (contractor × week). The contractor enters `hours` via the
 * portal; the agency reviews and approves; once paid (linked to a
 * fortnightly payment), the entry flips to `paid` and goes read-only.
 *
 * `totalFee` is computed in beforeChange (hours × contractor.hourlyRate at
 * the moment the entry is saved) so the value sticks even if the rate
 * changes later.
 */
export const ContractorTimeEntries: CollectionConfig = {
  slug: "contractor-time-entries",
  labels: { singular: "Time Entry", plural: "Contractor Time Entries" },
  admin: {
    group: "Finance",
    useAsTitle: "weekCommencing",
    defaultColumns: ["contractor", "weekCommencing", "hours", "totalFee", "status"],
    description: "Weekly hours logged by contractors. Approved entries flow into fortnightly payments.",
    hidden: hideUnlessFeature("contractors"),
  },
  access: {
    read: canAccess("contractors"),
    create: canAccess("contractors"),
    update: canAccess("contractors"),
    delete: adminOnlyDelete,
  },
  hooks: {
    beforeChange: [
      async ({ data, req, originalDoc, operation }) => {
        // Resolve hourly rate from the contractor at save time so the fee
        // sticks even if the contractor's rate is later changed.
        if (data?.contractor && data?.hours != null) {
          try {
            const cid = typeof data.contractor === "object" ? data.contractor.id : data.contractor;
            const c = await req.payload.findByID({
              collection: "contractors",
              id: cid,
              depth: 0,
              overrideAccess: true,
            });
            const rate = Number((c as any)?.hourlyRate || 0);
            data.hourlyRateSnapshot = rate;
            data.totalFee = Math.round(Number(data.hours) * rate * 100) / 100;
          } catch { /* fall through */ }
        }
        // Auto-stamp status timestamps
        const prevStatus = (originalDoc as any)?.status;
        if (operation === "create") {
          if (!data.status) data.status = "draft";
        }
        if (data.status && data.status !== prevStatus) {
          const now = new Date().toISOString();
          if (data.status === "submitted" && !data.submittedAt) data.submittedAt = now;
          if (data.status === "approved" && !data.approvedAt) data.approvedAt = now;
          if (data.status === "paid" && !data.paidAt) data.paidAt = now;
        }
        return data;
      },
    ],
  },
  fields: [
    {
      name: "contractor",
      type: "relationship",
      relationTo: "contractors",
      required: true,
      index: true,
    },
    {
      name: "weekCommencing",
      type: "date",
      required: true,
      index: true,
      admin: {
        description: "Monday of the week being logged.",
        date: { pickerAppearance: "dayOnly" },
      },
    },
    {
      name: "hours",
      type: "number",
      required: true,
      defaultValue: 0,
    },
    {
      name: "status",
      type: "select",
      required: true,
      defaultValue: "draft",
      options: [
        { label: "Draft", value: "draft" },
        { label: "Submitted", value: "submitted" },
        { label: "Approved", value: "approved" },
        { label: "Paid", value: "paid" },
      ],
    },
    {
      name: "hourlyRateSnapshot",
      type: "number",
      admin: { readOnly: true, description: "Rate at the time the entry was saved." },
    },
    {
      name: "totalFee",
      type: "number",
      admin: { readOnly: true, description: "hours × hourlyRateSnapshot, computed automatically." },
    },
    {
      name: "payment",
      type: "relationship",
      relationTo: "contractor-payments" as any,
      admin: {
        position: "sidebar",
        description: "Set when this entry rolls up into a fortnightly payment.",
      },
    },
    {
      name: "submittedAt",
      type: "date",
      admin: { readOnly: true, position: "sidebar" },
    },
    {
      name: "approvedAt",
      type: "date",
      admin: { readOnly: true, position: "sidebar" },
    },
    {
      name: "paidAt",
      type: "date",
      admin: { readOnly: true, position: "sidebar" },
    },
    {
      name: "notes",
      type: "textarea",
      admin: { description: "Optional contractor or admin note." },
    },
  ],
};
