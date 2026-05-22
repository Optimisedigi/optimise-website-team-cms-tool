import type { CollectionConfig } from "payload";

/**
 * goal-run-snapshots
 *
 * One decision step within a goal run. Written by the goal runtime before
 * calling any handler — records what was proposed, what was allowed through
 * guardrails, and the outcome.
 *
 * Sub-table of goal-runs (stored via Payload's `_parent_id` convention).
 *
 * @see {@link https://docs/goal-agents-architecture-and-build-plan.md §New: Goal Run Audit Trail}
 */
export const GoalRunSnapshots: CollectionConfig = {
  slug: "goal-run-snapshots",
  labels: {
    singular: "Goal Run Snapshot",
    plural: "Goal Run Snapshots",
  },
  admin: {
    hidden: true,
    useAsTitle: "action",
    defaultColumns: [
      "goalRun",
      "step",
      "action",
      "status",
      "riskTier",
      "createdAt",
    ],
    description:
      "One decision step within a goal run — proposed, blocked, approved, or applied.",
  },
  access: {
    read: ({ req }) => !!req.user,
    create: ({ req }) => !!req.user,
    update: ({ req }) => !!req.user,
    delete: ({ req }) => {
      if (!req.user) return false;
      return req.user.role === "admin";
    },
  },
  fields: [
    {
      name: "goalRun",
      type: "relationship",
      relationTo: "goal-runs",
      required: true,
      index: true,
      admin: {
        description: "Parent goal run this snapshot belongs to",
      },
    },
    {
      name: "step",
      type: "number",
      required: true,
      admin: {
        description: "1-based sequence number — steps execute in order",
      },
    },
    {
      name: "action",
      type: "text",
      required: true,
      admin: {
        description:
          'Handler key that was (or would be) invoked, e.g. "nkl-push-live", "budget-reallocate"',
      },
    },
    {
      name: "riskTier",
      type: "select",
      required: true,
      options: [
        { label: "Green", value: "green" },
        { label: "Yellow", value: "yellow" },
        { label: "Red", value: "red" },
        { label: "Black", value: "black" },
      ],
      admin: {
        description: "Risk classification of this action",
      },
    },
    {
      name: "status",
      type: "select",
      required: true,
      index: true,
      options: [
        { label: "Proposed", value: "proposed" },
        { label: "Approved", value: "approved" },
        { label: "Blocked by Contract", value: "blocked_by_contract" },
        { label: "Blocked by Pacer", value: "blocked_by_pacer" },
        { label: "Blocked by Scope", value: "blocked_by_scope" },
        { label: "Applied", value: "applied" },
        { label: "Rejected", value: "rejected" },
      ],
      admin: {
        description: "Outcome of this step",
      },
    },
    {
      name: "campaignIds",
      type: "array",
      admin: {
        description: "Campaign IDs this step operates on",
      },
      fields: [
        {
          name: "campaignId",
          type: "text",
          required: true,
        },
      ],
    },
    {
      name: "proposedPayload",
      type: "json",
      required: true,
      admin: {
        description: "What the goal agent proposed — full action payload",
      },
    },
    {
      name: "modifiedPayload",
      type: "json",
      admin: {
        description:
          "What the guardrails actually allowed through. Null if fully blocked.",
      },
    },
    {
      name: "blockReason",
      type: "textarea",
      admin: {
        description:
          "Which guardrail blocked the action, and why. Null unless status begins with blocked_",
      },
    },
    {
      name: "approval",
      type: "relationship",
      relationTo: "agent-approval-queue",
      hasMany: false,
      admin: {
        description:
          "Links to the agent-approval-queue row for yellow/red/black tiers awaiting human sign-off",
      },
    },
    {
      name: "measuredAt",
      type: "date",
      admin: {
        description:
          "When the measurement window closed and results were recorded",
        date: {
          pickerAppearance: "dayAndTime",
        },
      },
    },
    {
      name: "measuredResult",
      type: "json",
      admin: {
        description:
          'Outcome of the action, e.g. { "wastedSpendReduction": -0.31 }',
      },
    },
  ],
  timestamps: true,
};
