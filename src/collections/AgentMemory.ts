import type { CollectionConfig } from "payload";

/**
 * Agent Memory.
 *
 * Lazy-loaded facts the agent has learned about clients (or the agency
 * globally). Modelled on Pocket Agent's `facts` table — most rows are
 * search-only via the `memory_search` tool, never injected wholesale into
 * the system prompt. Only "pinned" rows (importance ≥ 80) are auto-injected
 * for the active client when chat starts.
 *
 * The `subject` field acts as a stable de-dupe key within a (scope,
 * clientId) pair: writing a fact with the same subject upserts rather than
 * creating a duplicate. This keeps memory tight as the agent learns.
 *
 * NOT to be confused with:
 *   - `agent-soul`: lessons about how to *talk to* the user (formatting,
 *     tone). Always loaded into every prompt because it's small.
 *   - `activity-log` / `agent-approval-queue`: per-run audit trail and
 *     pending changes. Operational, not knowledge.
 */
export const AgentMemory: CollectionConfig = {
  slug: "agent-memory" as any,
  labels: {
    singular: "Agent Memory",
    plural: "Agent Memory",
  },
  admin: {
    group: "Agent",
    useAsTitle: "subject",
    defaultColumns: ["scope", "client", "category", "subject", "importance", "status", "useCount", "lastAccessedAt"],
    description:
      "Facts the agent has learned, scoped per-client or globally. Most rows stay search-only; only importance ≥ 80 active rows auto-load into the prompt.",
  },
  access: {
    // Admin-only — facts contain client business intelligence.
    read: ({ req }) => (req.user as { role?: string } | null)?.role === "admin",
    create: ({ req }) => (req.user as { role?: string } | null)?.role === "admin",
    update: ({ req }) => (req.user as { role?: string } | null)?.role === "admin",
    delete: ({ req }) => (req.user as { role?: string } | null)?.role === "admin",
  },
  fields: [
    {
      name: "scope",
      type: "select",
      required: true,
      defaultValue: "client",
      options: [
        { label: "Client", value: "client" },
        { label: "Global", value: "global" },
      ],
      admin: {
        description:
          "Client = applies to one client account only. Global = applies in every chat.",
      },
    },
    {
      name: "client",
      type: "relationship",
      relationTo: "clients",
      admin: {
        description: "Required when scope = client.",
        condition: (data) => data?.scope === "client",
      },
    },
    {
      name: "category",
      type: "text",
      required: true,
      admin: {
        description:
          "Free-form bucket. Examples: preference, history, constraint, policy, decision.",
      },
    },
    {
      name: "subject",
      type: "text",
      required: true,
      admin: {
        description:
          "Short label, 3–5 words. Acts as a de-dupe key within (scope, client). Example: 'PMax stance', 'approved Sept negatives'.",
      },
    },
    {
      name: "content",
      type: "textarea",
      required: true,
      admin: {
        description: "The fact itself, 1–3 sentences. Past tense for events, present tense for preferences.",
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
    {
      name: "importance",
      type: "number",
      defaultValue: 50,
      min: 0,
      max: 100,
      admin: {
        description:
          "0–100. Pinned facts (≥ 80) auto-load into the system prompt for the active client. Most stay at 50 = search-only.",
      },
    },
    {
      name: "status",
      type: "select",
      defaultValue: "active",
      options: [
        { label: "Active", value: "active" },
        { label: "Needs Review", value: "needs_review" },
        { label: "Archived", value: "archived" },
      ],
      admin: {
        description:
          "Archived memories are ignored by memory_search and are never auto-loaded. Use Needs Review for facts that may be stale or duplicated.",
      },
    },
    {
      name: "confidence",
      type: "number",
      defaultValue: 80,
      min: 0,
      max: 100,
      admin: {
        description: "0-100 confidence that this memory is accurate. Low-confidence rows should be reviewed before pinning.",
      },
    },
    {
      name: "source",
      type: "select",
      defaultValue: "agent-inferred",
      options: [
        { label: "User Saved", value: "user-saved" },
        { label: "Agent Inferred", value: "agent-inferred" },
        { label: "Admin Created", value: "admin-created" },
      ],
      admin: {
        description: "How this memory was created, for review and trust decisions.",
      },
    },
    {
      name: "useCount",
      type: "number",
      defaultValue: 0,
      min: 0,
      admin: {
        description: "Incremented whenever memory_search returns this row.",
        readOnly: true,
      },
    },
    {
      name: "lastAccessedAt",
      type: "date",
      admin: {
        description:
          "Stamped by memory_search every time this row is returned. Lets us prune stale rows.",
        readOnly: true,
      },
    },
    {
      name: "lastMatchedQuery",
      type: "text",
      admin: {
        description: "Last memory_search query that returned this row.",
        readOnly: true,
      },
    },
    {
      name: "reviewAfter",
      type: "date",
      admin: {
        description: "Optional date when this memory should be reviewed for freshness.",
      },
    },
    {
      name: "expiresAt",
      type: "date",
      admin: {
        description: "Optional expiry. Expired memories are ignored by memory_search and pinned-memory loading.",
      },
    },
    {
      name: "createdBy",
      type: "relationship",
      relationTo: "users",
      admin: {
        description: "Who or which run created this fact.",
        readOnly: true,
      },
    },
    {
      name: "agentRunId",
      type: "text",
      admin: {
        description: "Run id when the agent created this fact via remember.",
        readOnly: true,
      },
    },
  ],
  timestamps: true,
};
