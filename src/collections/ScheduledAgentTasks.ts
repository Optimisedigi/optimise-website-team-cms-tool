import type { CollectionConfig } from "payload";
import { buildCronFromFriendlySchedule, computeNextRun } from "../lib/scheduled-task-schedule";
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
  hooks: {
    beforeValidate: [
      ({ data, operation }) => {
        if (!data) return data;
        const cron = buildCronFromFriendlySchedule({
          scheduleMode: data.scheduleMode,
          monthlyDay: data.monthlyDay,
          timeOfDay: data.timeOfDay,
        });
        if (cron) data.schedule = cron;

        const shouldComputeNextRun =
          operation === "create" ||
          data.scheduleMode !== undefined ||
          data.monthlyDay !== undefined ||
          data.timeOfDay !== undefined ||
          data.schedule !== undefined ||
          data.timezone !== undefined;
        if (shouldComputeNextRun && data.schedule) {
          data.nextRunAt = computeNextRun(
            String(data.schedule),
            String(data.timezone || "Australia/Brisbane"),
          ).toISOString();
        }
        return data;
      },
    ],
  },
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
          "Primary Google Ads account/client. Monthly budget tasks run for this plus any additional selected accounts below.",
      },
    },
    {
      name: "audits",
      label: "Additional Google Ads accounts",
      type: "relationship",
      relationTo: "google-ads-audits" as any,
      hasMany: true,
      admin: {
        description:
          "Optional. Add more Google Ads accounts to process in the same scheduled task. Each account still gets its own separate Agent Approval.",
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
      name: "scheduleMode",
      type: "select",
      required: true,
      defaultValue: "monthly",
      options: [
        { label: "Monthly", value: "monthly" },
        { label: "Advanced cron", value: "manual_cron" },
      ],
      admin: {
        description: "Use Monthly for normal tasks. Advanced cron is available for custom schedules.",
      },
    },
    {
      name: "monthlyDay",
      label: "Day of month",
      type: "number",
      min: 1,
      max: 31,
      defaultValue: 1,
      admin: {
        description: "For monthly schedules. Use 1 for the first day of each month.",
        condition: (data) => data?.scheduleMode !== "manual_cron",
      },
    },
    {
      name: "timeOfDay",
      label: "Time of day",
      type: "text",
      defaultValue: "09:00",
      admin: {
        description: "24-hour local time, e.g. 09:00. Converted to cron automatically.",
        condition: (data) => data?.scheduleMode !== "manual_cron",
      },
    },
    {
      name: "schedule",
      type: "text",
      required: true,
      defaultValue: "0 9 1 * *",
      admin: {
        description: "Generated cron expression. Use Advanced cron if you need to edit this manually.",
        condition: (data) => data?.scheduleMode === "manual_cron",
      },
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
        readOnly: true,
        description: "Computed from the friendly schedule + timezone. Tick endpoint picks rows where this <= now.",
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
