import type { CollectionConfig } from "payload";

/**
 * Agent Soul.
 *
 * Lessons about *how* the agent should communicate with the agency team:
 * tone, formatting, pacing, what to lead with, what to omit. Modelled on
 * Pocket Agent's `soul` table.
 *
 * Soul is small by design (target <= 20 rows) and scoped into prompts by agent.
 * `aspect` is a stable key for the lesson, and `appliesTo` controls which
 * agent surface receives it. The agent updates these via `soul_set` when the
 * user corrects how it communicates ("be more direct", "stop apologising",
 * "always show the customer ID first").
 *
 * Admin-editable so we can seed initial voice guidelines on day 1 rather
 * than wait for the agent to learn them organically.
 */
export const AgentSoul: CollectionConfig = {
  slug: "agent-soul" as any,
  labels: {
    singular: "Agent Soul Aspect",
    plural: "Agent Soul",
  },
  admin: {
    group: "Agent",
    useAsTitle: "aspect",
    defaultColumns: ["appliesTo", "aspect", "content", "updatedAt"],
    description:
      "How the agent should communicate with the agency team. Scope each row to all agents or one agent surface.",
  },
  access: {
    read: ({ req }) => (req.user as { role?: string } | null)?.role === "admin",
    create: ({ req }) => (req.user as { role?: string } | null)?.role === "admin",
    update: ({ req }) => (req.user as { role?: string } | null)?.role === "admin",
    delete: ({ req }) => (req.user as { role?: string } | null)?.role === "admin",
  },
  fields: [
    {
      name: "appliesTo",
      type: "select",
      required: true,
      defaultValue: "all",
      index: true,
      options: [
        { label: "All agents", value: "all" },
        { label: "Google Ads OptiMate", value: "google-ads" },
        { label: "Email drafting", value: "email" },
        { label: "InvoiceMate / Xero", value: "invoice" },
      ],
      admin: {
        description:
          "Choose which agent should receive this soul rule. General formatting rules usually apply to all agents; campaign-specific tone belongs to Google Ads only.",
      },
    },
    {
      name: "aspect",
      type: "text",
      required: true,
      unique: true,
      index: true,
      admin: {
        description:
          "Stable key, lowercase-kebab. Examples: tone, formatting, pacing-style, brand-voice. Upserted by the agent's soul_set tool.",
      },
    },
    {
      name: "content",
      type: "textarea",
      required: true,
      admin: {
        description:
          "The lesson, 1–3 sentences. Imperative mood. Example: 'Be direct. No apologetic language. State the answer first, then the reasoning.'",
      },
    },
    {
      name: "tokenEstimate",
      type: "ui",
      admin: {
        components: {
          Field: "./components/agent/MemoryTokenCounterField",
        },
      },
    },
  ],
  timestamps: true,
};
