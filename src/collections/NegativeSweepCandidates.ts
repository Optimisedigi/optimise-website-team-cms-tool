import type { CollectionConfig } from "payload";

export const NegativeSweepCandidates: CollectionConfig = {
  slug: "negative-sweep-candidates",
  dbName: "negative_sweep_candidates",
  labels: {
    singular: "Negative Sweep Candidate",
    plural: "Negative Sweep Candidates",
  },
  admin: {
    hidden: true,
    group: "Audits",
    defaultColumns: ["searchTerm", "client", "status", "cost", "sweepDate"],
  },
  access: {
    read: ({ req }) => !!req.user,
    create: ({ req }) => !!req.user,
    update: ({ req }) => !!req.user,
    delete: ({ req }) => !!req.user,
  },
  fields: [
    {
      name: "client",
      type: "relationship",
      relationTo: "clients",
      required: true,
      index: true,
    },
    {
      name: "searchTerm",
      type: "text",
      required: true,
    },
    {
      name: "campaignName",
      type: "text",
    },
    {
      name: "adGroupName",
      type: "text",
    },
    {
      type: "row",
      fields: [
        {
          name: "clicks",
          type: "number",
          defaultValue: 0,
          admin: { width: "25%" },
        },
        {
          name: "impressions",
          type: "number",
          defaultValue: 0,
          admin: { width: "25%" },
        },
        {
          name: "cost",
          type: "number",
          defaultValue: 0,
          admin: { width: "25%" },
        },
        {
          name: "conversions",
          type: "number",
          defaultValue: 0,
          admin: { width: "25%" },
        },
      ],
    },
    {
      name: "status",
      type: "select",
      defaultValue: "pending",
      required: true,
      options: [
        { label: "Pending", value: "pending" },
        { label: "Approved", value: "approved" },
        { label: "Rejected", value: "rejected" },
      ],
      index: true,
    },
    {
      name: "suggestedNegative",
      type: "text",
      admin: {
        description:
          "AI-suggested negative keyword (may differ from the search term, e.g. 'salary' instead of 'plumber salary')",
      },
    },
    {
      name: "suggestedList",
      type: "text",
      admin: {
        description: "AI-suggested negative keyword list",
      },
    },
    {
      name: "assignedList",
      type: "text",
      admin: {
        description: "Team-assigned list (overrides AI suggestion)",
      },
    },
    {
      name: "matchType",
      type: "select",
      defaultValue: "exact",
      options: [
        { label: "Exact", value: "exact" },
        { label: "Phrase", value: "phrase" },
        { label: "Broad", value: "broad" },
      ],
    },
    {
      name: "aiReasoning",
      type: "textarea",
      admin: {
        description: "Why the AI flagged this term",
      },
    },
    {
      name: "sweepDate",
      type: "date",
      required: true,
      index: true,
    },
    {
      name: "writtenToSheet",
      type: "checkbox",
      defaultValue: false,
    },
    {
      name: "writtenAt",
      type: "date",
      admin: {
        date: { pickerAppearance: "dayAndTime" },
      },
    },
  ],
};
