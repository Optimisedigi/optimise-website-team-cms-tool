import type { CollectionConfig } from "payload";
import { canAccess, adminOnlyDelete } from "../lib/access";
import { reimbursementForFortnight } from "../lib/contractor-reimbursement";

function fmtShort(d: Date): string {
  return `${String(d.getUTCDate()).padStart(2, "0")}${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
function fmtIso(d: Date): string {
  return d.toISOString().split("T")[0];
}

/**
 * One row per fortnightly payment to a contractor. Auto-rolls the
 * approved time entries inside [fortnightStartDate, fortnightEndDate]
 * into `subtotal`, then adds the contractor's ChatGPT reimbursement and
 * the transfer fee to land at `transferAmount`. The transfer reference
 * is pre-filled from the contractor's template; the agency copies it
 * into Wise.
 */
export const ContractorPayments: CollectionConfig = {
  slug: "contractor-payments",
  labels: { singular: "Payment", plural: "Contractor Payments" },
  admin: {
    group: "Finance",
    useAsTitle: "transferReference",
    defaultColumns: [
      "contractor",
      "fortnightStartDate",
      "fortnightEndDate",
      "transferAmount",
      "transferReference",
      "status",
    ],
    description: "Fortnightly payments. Generated from approved time entries.",
    hidden: true,
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
        if (!data?.contractor) return data;
        const cid = typeof data.contractor === "object" ? data.contractor.id : data.contractor;

        // Auto-set fortnightEndDate = fortnightStartDate + 13 days when missing
        if (data.fortnightStartDate && !data.fortnightEndDate) {
          const start = new Date(data.fortnightStartDate);
          const end = new Date(start);
          end.setUTCDate(end.getUTCDate() + 13);
          data.fortnightEndDate = end.toISOString();
        }

        let contractor: any = null;
        try {
          contractor = await req.payload.findByID({
            collection: "contractors",
            id: cid,
            depth: 0,
            overrideAccess: true,
          });
        } catch { /* fall through */ }

        if (contractor) {
          if (data.chatGptReimbursement == null && data.fortnightStartDate) {
            const start = new Date(data.fortnightStartDate);
            const end = data.fortnightEndDate ? new Date(data.fortnightEndDate) : new Date(start.getTime() + 13 * 24 * 60 * 60 * 1000);
            data.chatGptReimbursement = Math.round(reimbursementForFortnight(contractor, start.getTime(), end.getTime()) * 100) / 100;
          }
          if (data.transferFee == null) {
            data.transferFee = Number(contractor.transferFeeDefault || 4);
          }

          // Auto-fill transfer reference from the contractor template
          if (!data.transferReference && data.fortnightStartDate && data.fortnightEndDate) {
            const start = new Date(data.fortnightStartDate);
            const end = new Date(data.fortnightEndDate);
            const tmpl = String(contractor.transferReferenceTemplate || "{startShort}-{endShort} Optimise");
            data.transferReference = tmpl
              .replace(/\{startShort\}/g, fmtShort(start))
              .replace(/\{endShort\}/g, fmtShort(end))
              .replace(/\{startDate\}/g, fmtIso(start))
              .replace(/\{endDate\}/g, fmtIso(end));
          }
        }

        // Roll up time entries within the fortnight window. Only include
        // entries already linked to this payment OR approved/submitted
        // entries inside the date range that aren't yet linked elsewhere.
        if (data.fortnightStartDate && data.fortnightEndDate) {
          const start = new Date(data.fortnightStartDate);
          const end = new Date(data.fortnightEndDate);
          const paymentId = (originalDoc as any)?.id;
          const entries = await req.payload.find({
            collection: "contractor-time-entries",
            where: {
              and: [
                { contractor: { equals: cid } },
                { weekCommencing: { greater_than_equal: fmtIso(start) } },
                { weekCommencing: { less_than_equal: fmtIso(end) } },
                {
                  or: [
                    paymentId ? { payment: { equals: paymentId } } : { id: { equals: -1 } },
                    {
                      and: [
                        { payment: { exists: false } },
                        { status: { in: ["approved", "submitted"] } },
                      ],
                    },
                  ],
                },
              ],
            },
            limit: 50,
            depth: 0,
            overrideAccess: true,
          });
          const rate = Number((contractor as any)?.hourlyRate || 0);
          const subtotal = (entries.docs as any[]).reduce((s, e) => {
            const stored = Number(e.totalFee);
            return s + (Number.isFinite(stored) && stored > 0 ? stored : Number(e.hours || 0) * rate);
          }, 0);
          data.subtotal = Math.round(subtotal * 100) / 100;
          data.totalHours = (entries.docs as any[]).reduce(
            (s, e) => s + Number(e.hours || 0),
            0,
          );
        }

        const subtotal = Number(data.subtotal || 0);
        const chatGpt = Number(data.chatGptReimbursement || 0);
        const fee = Number(data.transferFee || 0);
        data.transferAmount = Math.round((subtotal + chatGpt + fee) * 100) / 100;

        // Stamp sentAt when status flips to sent
        const prevStatus = (originalDoc as any)?.status;
        if (operation === "create" && !data.status) data.status = "scheduled";
        if (data.status === "sent" && prevStatus !== "sent" && !data.sentAt) {
          data.sentAt = new Date().toISOString();
        }
        return data;
      },
    ],
    afterChange: [
      async ({ doc, req, operation }) => {
        // Link time entries inside the fortnight to this payment, and flip
        // them to paid when the payment is marked sent.
        try {
          const cid = typeof doc.contractor === "object" ? doc.contractor?.id : doc.contractor;
          if (!cid || !doc.fortnightStartDate || !doc.fortnightEndDate) return;
          const start = new Date(doc.fortnightStartDate);
          const end = new Date(doc.fortnightEndDate);

          const entries = await req.payload.find({
            collection: "contractor-time-entries",
            where: {
              and: [
                { contractor: { equals: cid } },
                { weekCommencing: { greater_than_equal: fmtIso(start) } },
                { weekCommencing: { less_than_equal: fmtIso(end) } },
                {
                  or: [
                    { payment: { equals: doc.id } },
                    {
                      and: [
                        { payment: { exists: false } },
                        { status: { in: ["approved", "submitted"] } },
                      ],
                    },
                  ],
                },
              ],
            },
            limit: 50,
            depth: 0,
            overrideAccess: true,
          });

          for (const entry of entries.docs as any[]) {
            const patch: Record<string, any> = {};
            if (entry.payment !== doc.id) patch.payment = doc.id;
            if (doc.status === "sent" && entry.status !== "paid") patch.status = "paid";
            if (Object.keys(patch).length > 0) {
              await req.payload.update({
                collection: "contractor-time-entries",
                id: entry.id,
                data: patch,
                overrideAccess: true,
              });
            }
          }
          void operation;
        } catch (err) {
          req.payload.logger?.warn?.(`[ContractorPayments] entry link failed: ${err}`);
        }
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
      name: "fortnightStartDate",
      type: "date",
      required: true,
      admin: {
        description: "First Monday of the fortnight being paid.",
        date: { pickerAppearance: "dayOnly" },
      },
    },
    {
      name: "fortnightEndDate",
      type: "date",
      admin: {
        description: "Defaults to start + 13 days.",
        date: { pickerAppearance: "dayOnly" },
      },
    },
    {
      name: "totalHours",
      type: "number",
      admin: { readOnly: true, description: "Sum of hours across linked time entries." },
    },
    {
      name: "subtotal",
      type: "number",
      admin: { readOnly: true, description: "Sum of totalFee across linked time entries." },
    },
    {
      name: "chatGptReimbursement",
      type: "number",
      admin: { description: "Pulled from contractor default; override per fortnight if needed." },
    },
    {
      name: "transferFee",
      type: "number",
      admin: { description: "Wise transfer fee. Defaults to contractor.transferFeeDefault." },
    },
    {
      name: "transferAmount",
      type: "number",
      admin: { readOnly: true, description: "subtotal + ChatGPT reimbursement + transfer fee." },
    },
    {
      name: "transferReference",
      type: "text",
      admin: {
        description: "Auto-filled from contractor template — copy/paste into Wise.",
      },
    },
    {
      name: "status",
      type: "select",
      required: true,
      defaultValue: "scheduled",
      options: [
        { label: "Scheduled", value: "scheduled" },
        { label: "Sent", value: "sent" },
      ],
    },
    {
      name: "paymentDate",
      type: "date",
      admin: { description: "Date you actually paid the contractor.", date: { pickerAppearance: "dayOnly" } },
    },
    {
      name: "sentAt",
      type: "date",
      admin: { readOnly: true, position: "sidebar" },
    },
    {
      name: "notes",
      type: "textarea",
    },
  ],
};
