import type { CollectionConfig } from "payload";
import { hasValidApiKey } from "./api-key-access";

/**
 * Scheduled Agent Tasks.
 *
 * Recurring agent runs created from chat. The cron tick endpoint
 * (`/api/scheduled-tasks/tick`) loads `isActive=true` rows whose `nextRunAt`
 * has elapsed, runs the prompt through the named agent against the linked
 * audit, drops the result into the owner's Gmail Drafts folder, and
 * advances `nextRunAt` based on the cron expression.
 *
 * v1 limit: one audit per task. Multi-account is a follow-up.
 */
export const ScheduledAgentTasks: CollectionConfig = {
  slug: "scheduled-agent-tasks" as any,
  labels: {
    singular: "Scheduled Agent Task",
    plural: "Scheduled Agent Tasks",
  },
  admin: {
    group: "Agent",
    useAsTitle: "title",
    defaultColumns: [
      "title",
      "taskType",
      "agentName",
      "client",
      "createdBy",
      "isActive",
      "nextRunAt",
      "lastRunStatus",
    ],
    listSearchableFields: ["title", "agentName"],
    description:
      "Recurring agent/system runs. Agent email tasks create Gmail drafts; monthly budget tasks queue Agent Approvals for budget pushes.",
  },
  access: {
    read: ({ req }) => {
      if (hasValidApiKey(req)) return true;
      if (!req.user) return false;
      if (req.user.role === "admin") return true;
      return { createdBy: { equals: req.user.id } };
    },
    create: ({ req }) => Boolean(req.user) || hasValidApiKey(req),
    update: ({ req }) => {
      if (hasValidApiKey(req)) return true;
      if (!req.user) return false;
      if (req.user.role === "admin") return true;
      return { createdBy: { equals: req.user.id } };
    },
    delete: ({ req }) => {
      if (!req.user) return false;
      if (req.user.role === "admin") return true;
      return { createdBy: { equals: req.user.id } };
    },
  },
  defaultSort: "nextRunAt",
  fields: [
    {
      name: "title",
      type: "text",
      required: true,
      admin: { description: "Plain-English label, e.g. 'Weekly Acme Ads summary'." },
    },
    {
      name: "taskType",
      type: "select",
      required: true,
      defaultValue: "agent-gmail-draft",
      index: true,
      options: [
        { label: "Agent Gmail draft", value: "agent-gmail-draft" },
        { label: "Monthly Google Ads budget approvals", value: "monthly-budget-recommendations" },
      ],
      admin: {
        description:
          "What the scheduler should run. Monthly budget tasks calculate recommendations and queue Agent Approvals instead of creating Gmail drafts.",
      },
    },
    {
      name: "agentName",
      type: "text",
      required: true,
      defaultValue: "optimate-google-ads",
      admin: {
        description: "Which agent runs this task each tick.",
        condition: (data) => data?.taskType !== "monthly-budget-recommendations",
      },
    },
    {
      name: "prompt",
      type: "textarea",
      required: true,
      defaultValue: "Run the scheduled OptiMate task.",
      admin: {
        description: "The user message replayed to the agent on each run. Not used by monthly budget approval tasks.",
        condition: (data) => data?.taskType !== "monthly-budget-recommendations",
      },
    },
    {
      name: "audit",
      type: "relationship",
      relationTo: "google-ads-audits" as any,
      hasMany: false,
      required: true,
      index: true,
      admin: {
        description:
          "Selected Google Ads account/client. Monthly budget tasks run for this account only.",
      },
    },
    {
      name: "client",
      type: "relationship",
      relationTo: "clients" as any,
      hasMany: false,
      required: true,
      index: true,
      admin: {
        description: "Denormalised from audit.client for fast admin filtering.",
      },
    },
    {
      name: "createdBy",
      type: "relationship",
      relationTo: "users" as any,
      hasMany: false,
      required: true,
      index: true,
      admin: { description: "Owner. Only this user (or an admin) can edit/pause." },
    },
    {
      name: "recipientEmail",
      type: "text",
      required: true,
      defaultValue: "not-used@scheduled-system.local",
      admin: {
        description: "Where the Gmail draft is created (defaults to owner's email). Not used by monthly budget approval tasks.",
        condition: (data) => data?.taskType !== "monthly-budget-recommendations",
      },
    },
    {
      name: "schedule",
      type: "text",
      required: true,
      admin: { description: "Cron expression, e.g. '0 9 * * 1' for Mondays at 9am." },
    },
    {
      name: "timezone",
      type: "text",
      required: true,
      defaultValue: "Australia/Brisbane",
      admin: { description: "IANA timezone used to evaluate the cron expression." },
    },
    {
      name: "nextRunAt",
      type: "date",
      required: true,
      index: true,
      admin: {
        description: "Computed from schedule + timezone. Tick endpoint picks rows where this <= now.",
        date: { pickerAppearance: "dayAndTime" },
      },
    },
    {
      name: "lastRunAt",
      type: "date",
      admin: { date: { pickerAppearance: "dayAndTime" } },
    },
    {
      name: "lastRunStatus",
      type: "select",
      options: [
        { label: "Success", value: "success" },
        { label: "Failed", value: "failed" },
      ],
    },
    {
      name: "lastRunError",
      type: "textarea",
    },
    {
      name: "lastDraftId",
      type: "text",
      admin: { description: "Gmail draft ID for the last successful run." },
    },
    {
      name: "isActive",
      type: "checkbox",
      defaultValue: true,
      index: true,
      admin: { position: "sidebar", description: "Pause this schedule without deleting it." },
    },
  ],
  timestamps: true,
};
