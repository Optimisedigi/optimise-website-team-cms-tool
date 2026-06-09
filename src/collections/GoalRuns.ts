import type { CollectionConfig } from "payload";

/**
 * goal-runs
 *
 * The parent record for one execution of a goal agent against one client.
 * Tracks the overall state machine (awaiting_data → analysing → ... → complete),
 * the highest risk tier seen in the run, and any top-level error.
 *
 * Individual decisions are stored as `goal-run-snapshots` rows linked here.
 * Phase 3 goal runtime reads/writes this collection; Phase 3 approval UI
 * surfaces it for human review.
 *
 * @see {@link https://docs/goal-agents-architecture-and-build-plan.md §New: Goal Run Audit Trail}
 */
export const GoalRuns: CollectionConfig = {
  slug: "goal-runs",
  labels: {
    singular: "Goal Run",
    plural: "Goal Runs",
  },
  admin: {
    hidden: true,
    useAsTitle: "goal",
    defaultColumns: ["client", "goal", "status", "tier", "createdAt"],
    description:
      "One execution of a goal agent against a client — individual decisions stored in goal-run-snapshots.",
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
      name: "client",
      type: "relationship",
      relationTo: "clients",
      required: true,
      index: true,
      admin: {
        description: "Client this goal run is targeting",
      },
    },
    {
      name: "goal",
      type: "text",
      required: true,
      index: true,
      admin: {
        description:
          'Goal identifier, e.g. "search-term-waste-reducer", "ad-ctr-improver"',
      },
    },
    {
      name: "status",
      type: "select",
      required: true,
      defaultValue: "awaiting_data",
      index: true,
      options: [
        { label: "Awaiting Data", value: "awaiting_data" },
        { label: "Analysing", value: "analysing" },
        { label: "Pending Approval", value: "pending_approval" },
        { label: "Executing", value: "executing" },
        { label: "Measuring", value: "measuring" },
        { label: "Complete", value: "complete" },
        { label: "Failed", value: "failed" },
        { label: "Blocked", value: "blocked" },
      ],
      admin: {
        description: "Current state in the goal-run lifecycle",
      },
    },
    {
      name: "tier",
      type: "select",
      index: true,
      options: [
        { label: "Green", value: "green" },
        { label: "Yellow", value: "yellow" },
        { label: "Red", value: "red" },
      ],
      admin: {
        description:
          "Highest risk tier encountered in this run — set as decisions are recorded",
      },
    },
    {
      name: "nextCheckAt",
      type: "date",
      index: true,
      admin: {
        description:
          "When the scheduler should next process this run. Null means no scheduled check.",
        date: {
          pickerAppearance: "dayAndTime",
        },
      },
    },
    {
      name: "coolingOffUntil",
      type: "date",
      admin: {
        description:
          "Earliest time the next mutation is allowed after the most recent action. Used by the scheduler to enforce cadence cooldowns.",
        date: {
          pickerAppearance: "dayAndTime",
        },
      },
    },
    {
      name: "iterationsCount",
      type: "number",
      required: true,
      defaultValue: 0,
      min: 0,
      admin: {
        description:
          "How many full observe→act→measure cycles this run has completed.",
      },
    },
    {
      name: "completedAt",
      type: "date",
      admin: {
        description: "When the run reached complete / failed / blocked",
      },
    },
    {
      name: "error",
      type: "textarea",
      admin: {
        description:
          "Populated when status = failed. Top-level error from the goal runtime.",
      },
    },
    {
      name: "parameters",
      type: "json",
      admin: {
        description:
          "Per-run knobs supplied at create time. Read by the goal-type handler each tick; never mutated by the runtime. JSON-serialisable. Account-efficiency prerequisite keys: monthlyBudget (REQUIRED for new runs via OptiMate — on apply it overwrites the client's google-ads-audits.monthlyBudget, the budget-shift anchor), minRecipientConversions (conversions threshold a campaign needs to receive freed budget; default 5), targetImprovementPercent (CPA target; default 15), measurementDays (ad-group staging cycle; default 14), and includedCampaignIds (campaign scope allow-list). Other knobs: bufferTolerancePercent, observationDays, campaignWindowDays, maxDonorReductionPercent, minDailyBudgetFloor, minAdGroupSpend, minKeywordSpend, enabledLevers.",
      },
    },
  ],
  timestamps: true,
};
