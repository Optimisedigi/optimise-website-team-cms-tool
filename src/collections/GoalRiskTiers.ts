import type { CollectionConfig } from "payload";

/**
 * goal-risk-tiers
 *
 * Defines the spend/action thresholds for each risk tier.
 * The `checkRiskTier()` helper reads these to classify proposed actions.
 *
 * Required for Phase 2 #9 (Risk Tier Metadata + Preflight Gate).
 *
 * @see docs/goal-agents-architecture-and-build-plan.md §Layer 4
 */
export const GoalRiskTiers: CollectionConfig = {
  slug: "goal-risk-tiers",
  labels: {
    singular: "Goal Risk Tier",
    plural: "Goal Risk Tiers",
  },
  admin: {
    group: "Admin",
    useAsTitle: "name",
    defaultColumns: ["name", "tier", "requiresApproval", "autoExecute", "maxBudgetImpactDollars"],
    description:
      "Defines spend/action thresholds per risk tier. checkRiskTier() reads these at runtime.",
  },
  access: {
    read: ({ req }) => !!req.user,
    create: ({ req }) => !!req.user,
    update: ({ req }) => !!req.user,
    delete: ({ req }) => req.user?.role === "admin",
  },
  fields: [
    {
      name: "name",
      type: "text",
      required: true,
      admin: {
        description: "Human-readable name, e.g. 'Green — Low-Risk, Reversible'",
      },
    },
    {
      name: "tier",
      type: "select",
      required: true,
      index: true,
      options: [
        { label: "Green — Low Risk", value: "green" },
        { label: "Yellow — Medium Risk", value: "yellow" },
        { label: "Red — High Risk", value: "red" },
        { label: "Black — Forbidden", value: "black" },
      ],
      admin: {
        description:
          "Risk classification. Black is forbidden — no handler will execute it.",
      },
    },
    {
      name: "maxBudgetImpactDollars",
      type: "number",
      admin: {
        description:
          "Maximum budget change (absolute $) this tier allows. Null = no limit. Used to gate yellow auto-execute.",
      },
    },
    {
      name: "allowedActionTypes",
      type: "array",
      admin: {
        description:
          "Optional: constrain this tier to specific handler keys. Leave blank (no rows) to apply this tier to all action types. Each row = one permitted handler key, e.g. 'nkl-push-live'. When no rows are added, this tier is skipped (action falls through to the next tier or defaults to red.)",
      },
      fields: [
        {
          name: "actionType",
          type: "text",
          required: true,
        },
      ],
    },
    {
      name: "requiresApproval",
      type: "checkbox",
      defaultValue: true,
      admin: {
        description:
          "When true, this tier always escalates to the approval queue before execution.",
      },
    },
    {
      name: "autoExecute",
      type: "checkbox",
      defaultValue: false,
      admin: {
        description:
          "When true, the goal runtime may auto-execute this tier without waiting for human approval. Only safe for green-tier actions.",
      },
    },
    {
      name: "description",
      type: "textarea",
      admin: {
        description:
          "Internal note: why this tier is classified this way, examples, constraints.",
      },
    },
  ],
  timestamps: true,
};
