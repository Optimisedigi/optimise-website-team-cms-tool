import type { CollectionConfig } from "payload";
import { logActivity } from "../lib/activity-log";

/**
 * ClientProcesses Collection
 *
 * A live, trackable instance of a ProcessTemplate for a specific client.
 * Created from a template, it copies all phases and steps and adds
 * status tracking, assignments, timeline entries, and notes.
 */
export const ClientProcesses: CollectionConfig = {
  slug: "client-processes",
  labels: {
    singular: "Client Process",
    plural: "Client Processes",
  },
  admin: {
    useAsTitle: "processTitle",
    group: "Clients",
    description: "Live client onboarding/management processes",
    defaultColumns: [
      "processTitle",
      "overallStatus",
      "completionPercentage",
      "retainerType",
      "assignedTo",
      "updatedAt",
    ],
    components: {
      beforeListTable: ["./components/CreateProcessFromTemplate"],
    },
  },
  access: {
    read: ({ req }) => !!req.user,
    create: ({ req }) => !!req.user,
    update: ({ req }) => !!req.user,
    delete: ({ req }) => req.user?.role === "admin",
  },
  defaultSort: "-updatedAt",
  hooks: {
    afterChange: [
      async ({ doc, operation, req }) => {
        if (operation === "create") {
          logActivity(req.payload, {
            type: "process_started",
            title: `Process started: ${doc.processTitle}`,
            user: req.user?.id,
            client:
              typeof doc.client === "object" ? doc.client?.id : doc.client,
          }).catch(() => {});
        }
      },
    ],
  },
  fields: [
    {
      name: "completionPercentage",
      label: "Progress",
      type: "number",
      virtual: true,
      admin: {
        hidden: true,
        components: {
          Cell: "./components/ProcessTrackerCell",
        },
      },
    },
    {
      type: "tabs",
      tabs: [
        {
          label: "Progress",
          fields: [
            {
              name: "processTracker",
              type: "ui",
              admin: {
                components: {
                  Field: "./components/ProcessTracker",
                },
              },
            },
          ],
        },
        {
          label: "Process Info",
          fields: [
            {
              name: "processTitle",
              type: "text",
              required: true,
              admin: {
                description:
                  'e.g. "Acme Corp - Full Integration"',
              },
            },
            {
              type: "row",
              fields: [
                {
                  name: "template",
                  type: "relationship",
                  relationTo: "process-templates" as any,
                  admin: {
                    description: "Template this process was created from",
                    readOnly: true,
                  },
                },
                {
                  name: "retainerType",
                  type: "select",
                  admin: {
                    description: "Retainer type for this process",
                  },
                  options: [
                    { label: "Google Ads Only", value: "google_ads_only" },
                    { label: "Meta Ads Only", value: "meta_ads_only" },
                    { label: "SEO Only", value: "seo_only" },
                    {
                      label: "Website Build Only",
                      value: "website_build_only",
                    },
                    { label: "Website + SEO", value: "website_seo" },
                    {
                      label: "Website + SEO + Google Ads",
                      value: "website_seo_google_ads",
                    },
                    { label: "Full Integration", value: "full_integration" },
                    { label: "AI Automations", value: "ai_automations" },
                    { label: "Custom", value: "custom" },
                  ],
                },
              ],
            },
            {
              type: "row",
              fields: [
                {
                  name: "client",
                  type: "relationship",
                  relationTo: "clients",
                  admin: {
                    description: "Linked client (if converted)",
                  },
                },
                {
                  name: "salesLead",
                  type: "relationship",
                  relationTo: "sales-leads" as any,
                  admin: {
                    description: "Linked sales lead",
                  },
                },
                {
                  name: "proposal",
                  type: "relationship",
                  relationTo: "client-proposals",
                  admin: {
                    description: "Linked proposal",
                  },
                },
              ],
            },
            {
              name: "assignedTo",
              type: "relationship",
              relationTo: "users",
              admin: {
                description: "Primary person responsible for this process",
              },
            },
          ],
        },
        {
          label: "Phases & Steps",
          fields: [
            {
              name: "phases",
              type: "array",
              admin: {
                description: "Phases copied from the template with live status tracking",
                components: {
                  Field: "./components/ClientProcessWorksheet",
                },
              },
              fields: [
                {
                  name: "phaseName",
                  type: "text",
                  required: true,
                },
                {
                  name: "phaseOrder",
                  type: "number",
                  required: true,
                  min: 1,
                },
                {
                  name: "phaseDescription",
                  type: "textarea",
                },
                {
                  name: "phaseStatus",
                  type: "select",
                  defaultValue: "not_started",
                  options: [
                    { label: "Not Started", value: "not_started" },
                    { label: "In Progress", value: "in_progress" },
                    { label: "Completed", value: "completed" },
                    { label: "Skipped", value: "skipped" },
                  ],
                },
                {
                  name: "steps",
                  type: "array",
                  fields: [
                    {
                      name: "stepName",
                      type: "text",
                      required: true,
                    },
                    {
                      name: "stepOrder",
                      type: "number",
                      required: true,
                      min: 1,
                    },
                    {
                      name: "stepDescription",
                      type: "textarea",
                    },
                    {
                      name: "stepType",
                      type: "select",
                      options: [
                        { label: "Action", value: "action" },
                        { label: "Communication", value: "communication" },
                        { label: "Decision", value: "decision" },
                        { label: "Automated", value: "automated" },
                        { label: "Milestone", value: "milestone" },
                      ],
                    },
                    {
                      name: "stepStatus",
                      type: "select",
                      defaultValue: "not_started",
                      options: [
                        { label: "Not Started", value: "not_started" },
                        { label: "In Progress", value: "in_progress" },
                        { label: "Completed", value: "completed" },
                        { label: "Skipped", value: "skipped" },
                      ],
                    },
                    {
                      name: "completedAt",
                      type: "date",
                      admin: {
                        description: "When this step was completed",
                      },
                    },
                    {
                      name: "defaultAssignee",
                      type: "select",
                      options: [
                        { label: "Account Manager", value: "account_manager" },
                        { label: "Strategist", value: "strategist" },
                        { label: "Developer", value: "developer" },
                        { label: "Founder", value: "founder" },
                        { label: "Client", value: "client" },
                        { label: "System", value: "system" },
                      ],
                    },
                    {
                      name: "estimatedDuration",
                      type: "text",
                    },
                    {
                      name: "isAutomatable",
                      type: "checkbox",
                      defaultValue: false,
                    },
                    {
                      name: "automationNotes",
                      type: "textarea",
                      admin: {
                        condition: (_data: any, siblingData: any) =>
                          siblingData?.isAutomatable,
                      },
                    },
                    {
                      name: "emailTemplateSubject",
                      type: "text",
                      admin: {
                        condition: (_data: any, siblingData: any) =>
                          siblingData?.stepType === "communication",
                      },
                    },
                    {
                      name: "emailTemplateBody",
                      type: "textarea",
                      admin: {
                        condition: (_data: any, siblingData: any) =>
                          siblingData?.stepType === "communication",
                      },
                    },
                    {
                      name: "reminderDays",
                      type: "number",
                      min: 0,
                    },
                    {
                      name: "requiredBeforeNext",
                      type: "checkbox",
                      defaultValue: false,
                    },
                    {
                      name: "notes",
                      type: "textarea",
                      admin: {
                        description: "Notes specific to this step for this client",
                      },
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          label: "Timeline",
          fields: [
            {
              name: "timeline",
              type: "array",
              admin: {
                description: "Chronological log of process events",
              },
              fields: [
                {
                  name: "action",
                  type: "text",
                  required: true,
                },
                {
                  name: "performedAt",
                  type: "date",
                  required: true,
                },
                {
                  name: "performedBy",
                  type: "relationship",
                  relationTo: "users",
                },
                {
                  name: "notes",
                  type: "textarea",
                },
              ],
            },
          ],
        },
      ],
    },
    // Sidebar fields
    {
      name: "overallStatus",
      type: "select",
      required: true,
      defaultValue: "not_started",
      admin: {
        position: "sidebar",
        description: "Overall process status",
      },
      options: [
        { label: "Not Started", value: "not_started" },
        { label: "In Progress", value: "in_progress" },
        { label: "On Hold", value: "on_hold" },
        { label: "Completed", value: "completed" },
        { label: "Cancelled", value: "cancelled" },
      ],
    },
    {
      name: "startedAt",
      type: "date",
      admin: {
        position: "sidebar",
        description: "When this process was started",
      },
    },
    {
      name: "completedAt",
      type: "date",
      admin: {
        position: "sidebar",
        description: "When this process was completed",
      },
    },
  ],
};
