import type { CollectionConfig } from "payload";
import { globalAccess } from "../lib/access";

export const ConsolidationCandidates: CollectionConfig = {
  slug: "consolidation-candidates",
  labels: { singular: "Consolidation Candidate", plural: "Consolidation Candidates" },
  admin: {
    group: "Growth Tools",
    hidden: false,
    useAsTitle: "phraseCandidate",
    description:
      "Proposed phrase negatives to consolidate multiple exact negatives when a negative keyword list approaches the 5,000 limit. Created automatically by the cron; approved/rejected by the team.",
    listSearchableFields: ["phraseCandidate", "nklName"],
    defaultColumns: [
      "phraseCandidate",
      "client",
      "nkl",
      "exactCount",
      "overlapRisk",
      "status",
      "createdAt",
    ],
  },
  access: {
    ...globalAccess("clients"),
    read: ({ req }) => {
      const user = req.user as { role?: string } | null;
      if (user?.role === "admin") return true;
      return false; // internal tool — only admins access
    },
    create: ({ req }) => Boolean(req.user),
    update: ({ req }) => Boolean(req.user),
    delete: ({ req }) => (req.user as { role?: string } | null)?.role === "admin",
  },
  fields: [
    {
      name: "client",
      type: "relationship",
      relationTo: "clients",
      required: true,
      index: true,
      admin: { description: "Client this consolidation belongs to." },
    },
    {
      name: "nkl",
      type: "relationship",
      relationTo: "negative-keyword-lists",
      required: true,
      index: true,
      admin: { description: "Negative keyword list being consolidated." },
    },
    {
      name: "nklName",
      type: "text",
      admin: { description: "Snapshot of the NKL name at time of creation." },
    },
    {
      name: "phraseCandidate",
      type: "text",
      required: true,
      admin: {
        description:
          "Proposed phrase negative. Will be added to the NKL and the exact negatives below will be removed.",
      },
    },
    {
      name: "exactNegativesToRemove",
      type: "array",
      required: true,
      admin: {
        description:
          "Exact negatives that will be removed from the NKL when this consolidation is approved.",
      },
      fields: [
        {
          name: "keyword",
          type: "text",
          required: true,
        },
      ],
    },
    {
      name: "exactCount",
      type: "number",
      admin: { readOnly: true, description: "Number of exact negatives being replaced." },
    },
    {
      name: "overlapRisk",
      type: "checkbox",
      defaultValue: false,
      admin: {
        description:
          "If true, the phrase overlaps with at least one active keyword being bid on in the account. Review overlapDetails before approving.",
      },
    },
    {
      name: "overlapDetails",
      type: "textarea",
      admin: {
        description:
          "Details of active keywords in the account that overlap with the proposed phrase. Present when overlapRisk is true.",
      },
    },
    {
      name: "status",
      type: "select",
      defaultValue: "pending",
      required: true,
      index: true,
      options: [
        { label: "Pending review", value: "pending" },
        { label: "Approved", value: "approved" },
        { label: "Rejected", value: "rejected" },
      ],
    },
    {
      name: "approvedAt",
      type: "date",
      admin: { readOnly: true },
    },
    {
      name: "rejectedAt",
      type: "date",
      admin: { readOnly: true },
    },
    {
      name: "approvedBy",
      type: "relationship",
      relationTo: "users",
      admin: { readOnly: true },
    },
  ],
  timestamps: true,
};
