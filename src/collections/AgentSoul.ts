import type { CollectionConfig } from "payload";

/**
 * Agent Soul.
 *
 * Lessons about *how* the agent should communicate with the agency team:
 * tone, formatting, pacing, what to lead with, what to omit. Modelled on
 * Pocket Agent's `soul` table.
 *
 * Soul is small by design (target ≤ 20 rows) and ALWAYS loaded wholesale
 * into the system prompt. That's why we keep `aspect` unique — one row per
 * aspect, last-write-wins. The agent updates these via `soul_set` when the
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
    defaultColumns: ["aspect", "content", "updatedAt"],
    description:
      "How the agent should communicate with the agency team. Always loaded into every prompt — keep it tight (≤ 20 rows).",
  },
  access: {
    read: ({ req }) => (req.user as { role?: string } | null)?.role === "admin",
    create: ({ req }) => (req.user as { role?: string } | null)?.role === "admin",
    update: ({ req }) => (req.user as { role?: string } | null)?.role === "admin",
    delete: ({ req }) => (req.user as { role?: string } | null)?.role === "admin",
  },
  fields: [
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
