import type { CollectionConfig } from "payload";

/**
 * Optimate Chat Turns.
 *
 * One row per chat message (user OR assistant), keyed by `sessionId`. This is
 * the persistence layer for the OptiMate chat panel: when a user reloads an
 * audit page or revisits later, the previous conversation can be re-loaded
 * via `/api/optimate-chat-history?sessionId=...`.
 *
 * Why a dedicated collection and not activity-log:
 *   - activity-log captures tool calls and agent reasoning for debugging,
 *     not the user's prompts. Chat history needs both sides of the dialog.
 *   - Chat queries should be cheap. activity-log is high-volume and serves a
 *     different purpose.
 *   - Per-user ownership filters keep one team-mate from reading another's
 *     thread.
 *
 * Writes happen best-effort from the chat route — a persistence failure must
 * never block the reply.
 */
export const OptimateChatTurns: CollectionConfig = {
  slug: "optimate-chat-turns" as any,
  labels: {
    singular: "OptiMate Chat Turn",
    plural: "OptiMate Chat Turns",
  },
  admin: {
    group: "Admin",
    hidden: true,
    useAsTitle: "preview",
    defaultColumns: ["sessionId", "role", "audit", "user", "createdAt"],
    description:
      "Persistent OptiMate chat history. One row per user or assistant message.",
  },
  access: {
    // Logged-in users only. Non-admins can only read their own turns.
    read: ({ req }) => {
      const user = req.user as { id?: string | number; role?: string } | null;
      if (!user) return false;
      if (user.role === "admin") return true;
      return { user: { equals: user.id } };
    },
    create: ({ req }) => Boolean(req.user),
    update: () => false,
    delete: ({ req }) => (req.user as { role?: string } | null)?.role === "admin",
  },
  fields: [
    {
      name: "sessionId",
      type: "text",
      required: true,
      index: true,
      admin: {
        description:
          "Stable UUID identifying the chat thread. Matches `sessionIdRef.current` in OptiMateChatCore.",
      },
    },
    {
      name: "audit",
      type: "relationship",
      relationTo: "google-ads-audits" as any,
      required: true,
      index: true,
    },
    {
      name: "user",
      type: "relationship",
      relationTo: "users",
      required: true,
      index: true,
      admin: {
        description: "The human team-member who owns this thread.",
      },
    },
    {
      name: "client",
      type: "relationship",
      relationTo: "clients",
      index: true,
      admin: {
        description:
          "Snapshot of audit.linkedClient at write time. Lets us filter by client without joining through audits.",
      },
    },
    {
      name: "role",
      type: "select",
      required: true,
      options: [
        { label: "User", value: "user" },
        { label: "Assistant", value: "assistant" },
      ],
    },
    {
      name: "content",
      type: "textarea",
      required: true,
    },
    {
      name: "preview",
      type: "text",
      admin: {
        readOnly: true,
        description: "First 80 chars of content. Used as the admin title.",
      },
    },
    {
      name: "runId",
      type: "text",
      admin: {
        description: "Assistant-only. Ties back to activity-log.agentRunId.",
      },
    },
    {
      name: "modelUsed",
      type: "text",
      admin: {
        description: "Assistant-only.",
      },
    },
    {
      name: "proposalIds",
      type: "json",
      admin: {
        description:
          "Assistant-only. Array of agent-approval-queue ids queued this turn.",
      },
    },
  ],
  hooks: {
    beforeChange: [
      ({ data }) => {
        // Populate the preview from content so the admin list view has a
        // human-readable title without a separate field for the user to fill.
        if (typeof data?.content === "string") {
          const trimmed = data.content.trim();
          data.preview = trimmed.length > 80 ? trimmed.slice(0, 80) : trimmed;
        }
        return data;
      },
    ],
  },
  timestamps: true,
};
