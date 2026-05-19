import type { CollectionConfig } from "payload";
import { hasValidApiKey } from "./api-key-access";

/**
 * Agent Approval Queue.
 *
 * Every Optimate agent that produces a draft (proposal, recommendation,
 * client-facing email) writes it here with status='pending'. A human reviews
 * in the admin UI, approves or rejects, and the originating agent's
 * follow-up tool reads the approval state to act on it.
 *
 * Collection is shared across all agents in the fleet (per the build plan).
 */
export const AgentApprovalQueue: CollectionConfig = {
  slug: "agent-approval-queue" as any,
  labels: {
    singular: "Agent Approval",
    plural: "Agent Approvals",
  },
  admin: {
    group: "Admin",
    useAsTitle: "title",
    defaultColumns: ["agentName", "proposalType", "client", "status", "createdAt"],
    listSearchableFields: ["agentName", "proposalType", "title"],
    description: "Drafts and proposed actions from the Optimate agents awaiting human review.",
  },
  access: {
    read:   ({ req }) => Boolean(req.user) || hasValidApiKey(req),
    create: ({ req }) => Boolean(req.user) || hasValidApiKey(req),
    update: ({ req }) => Boolean(req.user) || hasValidApiKey(req),
    delete: ({ req }) => req.user?.role === "admin",
  },
  defaultSort: "-createdAt",
  fields: [
    {
      name: "title",
      type: "text",
      required: true,
      admin: { description: "One-line summary the human sees in the queue list." },
    },
    {
      name: "agentName",
      type: "text",
      required: true,
      index: true,
      admin: { description: "Which agent produced this draft, e.g. optimate-google-ads." },
    },
    {
      name: "client",
      type: "relationship",
      relationTo: "clients" as any,
      hasMany: false,
      index: true,
    },
    {
      name: "proposalType",
      type: "text",
      required: true,
      index: true,
      admin: {
        description:
          "What kind of action the draft proposes, e.g. phrase-match-additions, budget-reallocation, diagnostic-report.",
      },
    },
    {
      name: "agentRunId",
      type: "text",
      required: true,
      index: true,
      admin: { description: "Run ID this proposal was produced by; matches activity-log entries." },
    },
    {
      name: "proposalPayload",
      type: "json",
      required: true,
      admin: { description: "Structured payload the apply-side tool will read on approval." },
    },
    {
      name: "rendered",
      type: "group",
      admin: { description: "Pre-rendered presentation of the proposal for human review." },
      fields: [
        { name: "clientHtml", type: "code", admin: { language: "html", description: "Brand-toned client-facing HTML." } },
        { name: "internalMarkdown", type: "code", admin: { language: "markdown", description: "Terse internal-team review markdown." } },
      ],
    },
    {
      name: "status",
      type: "select",
      required: true,
      defaultValue: "pending",
      index: true,
      options: [
        { label: "Pending", value: "pending" },
        { label: "Approved", value: "approved" },
        { label: "Rejected", value: "rejected" },
        { label: "Applied", value: "applied" },
        { label: "Failed", value: "failed" },
      ],
    },
    {
      name: "triggeredBy",
      type: "relationship",
      relationTo: "users" as any,
      hasMany: false,
      index: true,
      admin: {
        description:
          "CMS user whose chat turn / scheduled action triggered the agent run that produced this proposal. Null for background/system runs.",
      },
    },
    {
      name: "reviewedBy",
      type: "relationship",
      relationTo: "users" as any,
      hasMany: false,
    },
    { name: "reviewedAt", type: "date" },
    { name: "appliedAt", type: "date" },
    {
      name: "applyError",
      type: "textarea",
      admin: { description: "If status=failed, the error from the apply-side tool." },
    },
  ],
  timestamps: true,
};
