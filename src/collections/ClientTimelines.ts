import type {
  CollectionConfig,
  CollectionBeforeChangeHook,
  CollectionAfterChangeHook,
} from "payload";
import { logActivity } from "../lib/activity-log";
import { buildGoogleAdsTimelinePhases } from "../lib/google-ads-timeline-template";

/* -------------------------------------------------------------------------- */
/* Hooks                                                                     */
/* -------------------------------------------------------------------------- */

const populateFromGoogleAds: CollectionBeforeChangeHook = async ({
  data,
  operation,
}) => {
  if (operation === "create" && data) {
    // Only auto-populate if service type is Google Ads AND phases are empty
    const hasNoPhases = !data.phases || data.phases.length === 0;
    if (hasNoPhases) {
      data.phases = buildGoogleAdsTimelinePhases();
    }
  }
  return data;
};

const normalizeOrders: CollectionBeforeChangeHook = async ({ data }) => {
  if (data?.phases && Array.isArray(data.phases)) {
    data.phases.forEach((phase: any, i: number) => {
      phase.phaseOrder = i + 1;
      if (phase.items && Array.isArray(phase.items)) {
        phase.items.forEach((item: any, j: number) => {
          item.itemOrder = j + 1;
        });
      }
    });
  }
  return data;
};

const logTimelineCreated: CollectionAfterChangeHook = async ({
  doc,
  operation,
  req,
}) => {
  if (operation === "create") {
    await logActivity(req.payload, {
      type: "timeline_created",
      title: `Client timeline started: ${doc.title}`,
      user: req.user?.id,
      client:
        typeof doc.client === "object" ? doc.client?.id : doc.client,
    });
  }
  return doc;
};

/* -------------------------------------------------------------------------- */
/* Collection Config                                                          */
/* -------------------------------------------------------------------------- */

/**
 * ClientTimelines Collection
 *
 * A live, client-facing timeline instance for a specific client.
 * For Google Ads service type, the 90-day onboarding template is embedded
 * by default (auto-populated on creation). Templates tab lets team manage
 * and load reusable template configurations.
 *
 * Clients see a simplified view of the progress — items marked ✅ when done,
 * with a clean email summary generated for periodic sharing.
 */
export const ClientTimelines: CollectionConfig = {
  slug: "client-timelines",
  labels: {
    singular: "Client Timeline",
    plural: "Client Timelines",
  },
  admin: {
    useAsTitle: "title",
    group: "Clients",
    description: "Live client-facing timelines for periodic progress sharing",
    defaultColumns: [
      "title",
      "client",
      "serviceType",
      "overallStatus",
      "startDate",
      "lastSharedAt",
      "updatedAt",
    ],
  },
  access: {
    read: ({ req }) => !!req.user,
    create: ({ req }) => !!req.user,
    update: ({ req }) => !!req.user,
    delete: ({ req }) => req.user?.role === "admin",
  },
  defaultSort: "-updatedAt",
  hooks: {
    beforeChange: [populateFromGoogleAds, normalizeOrders],
    afterChange: [logTimelineCreated],
  },
  fields: [
    {
      type: "tabs",
      tabs: [
        {
          label: "Progress",
          fields: [
            {
              name: "timelineTracker",
              type: "ui",
              admin: {
                components: {
                  Field: "./components/ClientTimelineTracker",
                },
              },
            },
          ],
        },
        {
          label: "Timeline Info",
          fields: [
            {
              name: "title",
              type: "text",
              required: true,
              admin: {
                description:
                  'e.g. "Berenson — Google Ads 90-Day Timeline"',
              },
            },
            {
              type: "row",
              fields: [
                {
                  name: "client",
                  type: "relationship",
                  relationTo: "clients",
                  required: true,
                  admin: {
                    description: "The client this timeline belongs to",
                  },
                },
                {
                  name: "template",
                  type: "relationship",
                  relationTo: "client-timeline-templates" as any,
                  admin: {
                    description: "Template used to create this timeline",
                    readOnly: true,
                  },
                },
              ],
            },
            {
              type: "row",
              fields: [
                {
                  name: "serviceType",
                  type: "select",
                  required: true,
                  options: [
                    { label: "Google Ads", value: "google_ads" },
                    { label: "SEO", value: "seo" },
                    { label: "Meta Ads", value: "meta_ads" },
                    { label: "CRO", value: "cro" },
                    { label: "General", value: "general" },
                  ],
                },
                {
                  name: "overallStatus",
                  type: "select",
                  defaultValue: "not_started",
                  options: [
                    { label: "Not Started", value: "not_started" },
                    { label: "In Progress", value: "in_progress" },
                    { label: "Completed", value: "completed" },
                    { label: "On Hold", value: "on_hold" },
                  ],
                },
              ],
            },
            {
              type: "row",
              fields: [
                {
                  name: "startDate",
                  type: "date",
                  admin: {
                    description: "When this timeline started",
                  },
                },
                {
                  name: "endDate",
                  type: "date",
                  admin: {
                    description: "When this timeline is expected to end",
                  },
                },
              ],
            },
            {
              name: "notes",
              type: "textarea",
              admin: {
                description: "General notes for this timeline",
              },
            },
          ],
        },
        {
          label: "Templates",
          fields: [
            {
              name: "templateManager",
              type: "ui",
              admin: {
                components: {
                  Field: "./components/ClientTimelineTemplateManager",
                },
              },
            },
          ],
        },
        {
          label: "Phases & Items",
          fields: [
            {
              name: "phases",
              type: "array",
              admin: {
                description:
                  "Edit phases and items in the table below — inline editing, add/remove, reorder",
                components: {
                  Field: "./components/ClientTimelineWorksheet",
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
                  name: "weekRange",
                  type: "text",
                },
                {
                  name: "phaseDescription",
                  type: "textarea",
                },
                {
                  name: "items",
                  type: "array",
                  fields: [
                    {
                      name: "itemName",
                      type: "text",
                      required: true,
                    },
                    {
                      name: "itemOrder",
                      type: "number",
                      required: true,
                      min: 1,
                    },
                    {
                      name: "itemDescription",
                      type: "textarea",
                    },
                    {
                      name: "estimatedHours",
                      type: "number",
                      admin: {
                        description: "Estimated hours for this task (used to calculate progress weighting). Leave blank to count as 1 hour.",
                        step: 0.5,
                      },
                    },
                    {
                      name: "itemStatus",
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
                        description: "When this item was completed",
                      },
                    },
                    {
                      name: "completedBy",
                      type: "relationship",
                      relationTo: "users",
                      admin: {
                        description: "Who completed this item",
                      },
                    },
                    {
                      name: "requiresApproval",
                      type: "checkbox",
                      defaultValue: false,
                    },
                    {
                      name: "approvalStatus",
                      type: "select",
                      defaultValue: "not_needed",
                      options: [
                        { label: "Not Needed", value: "not_needed" },
                        { label: "In Progress", value: "in_progress" },
                        { label: "Action Required", value: "action_required" },
                        { label: "Awaiting Approval", value: "awaiting_approval" },
                        { label: "Pending (Legacy)", value: "pending_approval" },
                        { label: "Approved", value: "approved" },
                      ],
                    },
                    {
                      name: "clientApprovedAt",
                      type: "date",
                      admin: {
                        description: "When the client approved this item",
                      },
                    },
                    {
                      name: "internalNotes",
                      type: "textarea",
                      admin: {
                        description: "Team-only notes — not shown to the client",
                      },
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
    // Sidebar fields
    {
      name: "lastSharedAt",
      type: "date",
      admin: {
        position: "sidebar",
        description: "When this timeline was last shared with the client",
        readOnly: true,
      },
    },
    {
      name: "sharedCount",
      type: "number",
      defaultValue: 0,
      admin: {
        position: "sidebar",
        description: "Number of times shared with the client",
        readOnly: true,
      },
    },
  ],
};
