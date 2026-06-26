import type { CollectionConfig } from "payload";

export const ClientProposalKeywordResearchJobs: CollectionConfig = {
  slug: "client-proposal-keyword-research-jobs",
  labels: {
    singular: "Client Proposal Keyword Research Job",
    plural: "Client Proposal Keyword Research Jobs",
  },
  admin: {
    hidden: true,
    useAsTitle: "id",
    defaultColumns: ["status", "createdAt", "completedAt"],
    description: "Durable background job records for client proposal keyword research polling.",
  },
  access: {
    read: ({ req }) => !!req.user,
    create: ({ req }) => !!req.user,
    update: ({ req }) => !!req.user,
    delete: ({ req }) => req.user?.role === "admin",
  },
  fields: [
    {
      name: "status",
      type: "select",
      required: true,
      defaultValue: "running",
      index: true,
      options: [
        { label: "Running", value: "running" },
        { label: "Completed", value: "completed" },
        { label: "Failed", value: "failed" },
      ],
    },
    {
      name: "completedAt",
      type: "date",
      admin: {
        date: { pickerAppearance: "dayAndTime" },
      },
    },
    {
      name: "result",
      type: "json",
    },
    {
      name: "error",
      type: "textarea",
    },
  ],
  timestamps: true,
};
