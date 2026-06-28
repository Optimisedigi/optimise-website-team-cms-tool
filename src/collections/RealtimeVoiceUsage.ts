import type { CollectionConfig } from "payload";

export const RealtimeVoiceUsage: CollectionConfig = {
  slug: "realtime-voice-usage",
  labels: {
    singular: "Realtime Voice Usage",
    plural: "Realtime Voice Usage",
  },
  admin: {
    group: "OptiMate",
    hidden: true,
    useAsTitle: "sessionId",
    defaultColumns: ["agent", "model", "durationSeconds", "estimatedCostUsd", "user", "createdAt"],
    description: "Estimated OpenAI Realtime voice cost, calculated from model hourly rates and call duration.",
  },
  access: {
    read: ({ req }) => !!req.user,
    // Log-only collection: records are created by /api/optimate/realtime-usage
    // with overrideAccess, not manually through Payload admin.
    create: () => false,
    update: () => false,
    delete: ({ req }) => (req.user as { role?: string } | null)?.role === "admin",
  },
  fields: [
    {
      name: "sessionId",
      type: "text",
      required: true,
      unique: true,
      index: true,
    },
    {
      name: "agent",
      type: "select",
      required: true,
      index: true,
      options: [
        { label: "Google Ads", value: "google-ads" },
        { label: "Email", value: "email" },
        { label: "InvoiceMate", value: "invoice" },
      ],
    },
    {
      name: "model",
      type: "select",
      required: true,
      index: true,
      options: [
        { label: "GPT Realtime Mini", value: "gpt-realtime-mini" },
        { label: "GPT Realtime 2", value: "gpt-realtime-2" },
      ],
    },
    {
      name: "rateUsdPerHour",
      type: "number",
      required: true,
      admin: { description: "Hourly rate used at the time this call was recorded." },
    },
    {
      name: "durationSeconds",
      type: "number",
      required: true,
      min: 0,
    },
    {
      name: "estimatedCostUsd",
      type: "number",
      required: true,
      min: 0,
    },
    {
      name: "startedAt",
      type: "date",
      required: true,
      index: true,
    },
    {
      name: "endedAt",
      type: "date",
      required: true,
      index: true,
    },
    {
      name: "user",
      type: "relationship",
      relationTo: "users",
      index: true,
    },
    {
      name: "metadata",
      type: "json",
      admin: { description: "Optional call context such as audit/customer id or selected agent mode." },
    },
  ],
  timestamps: true,
};
