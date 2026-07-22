import type {
  Access,
  CollectionAfterChangeHook,
  CollectionBeforeChangeHook,
  CollectionConfig,
  FieldAccess,
} from "payload";
import { adminOnlyDelete, hideUnlessFeature, userHasFeature } from "../lib/access";
import { logActivity } from "../lib/activity-log";

const TASK_TYPE_OPTIONS = [
  { label: "Blog Post", value: "blog_post" },
  { label: "Email", value: "email" },
  { label: "Product Page", value: "product_page" },
  { label: "Product Update", value: "product_update" },
  { label: "Research", value: "research" },
  { label: "Website Content", value: "website_content" },
  { label: "SEO", value: "seo" },
  { label: "Internal Documentation", value: "internal_documentation" },
  { label: "Reporting", value: "reporting" },
  { label: "Google Ads", value: "google_ads" },
  { label: "Schema Fix", value: "schema_fix" },
  { label: "FAQ Schema", value: "faq_schema" },
  { label: "Product Feed", value: "product_feed" },
  { label: "Google Sheet", value: "google_sheet" },
  { label: "Other", value: "other" },
] as const;

const STATUS_OPTIONS = [
  { label: "Not Started", value: "not_started" },
  { label: "In Progress", value: "in_progress" },
  { label: "Ready for Review", value: "ready_for_review" },
  { label: "Completed", value: "completed" },
  { label: "Task Postponed", value: "task_postponed" },
] as const;

const PRIORITY_OPTIONS = [
  { label: "Low", value: "low" },
  { label: "Normal", value: "normal" },
  { label: "High", value: "high" },
  { label: "Urgent", value: "urgent" },
] as const;

const LINK_KIND_OPTIONS = [
  { label: "Brief", value: "brief" },
  { label: "Loom", value: "loom" },
  { label: "Google Doc", value: "google_doc" },
  { label: "Page", value: "page" },
  { label: "CMS", value: "cms" },
  { label: "Other", value: "other" },
] as const;

function getRelationshipId(value: unknown): string | number | undefined {
  if (typeof value === "string" || typeof value === "number") return value;
  if (value && typeof value === "object" && "id" in value) {
    const id = (value as { id?: string | number }).id;
    if (typeof id === "string" || typeof id === "number") return id;
  }
  return undefined;
}

const canReadTeamTasks: Access = ({ req }) => {
  const user = req.user as { role?: string } | null;
  if (!user) return false;
  return userHasFeature(user, "team-tasks");
};

const canCreateTeamTasks: Access = ({ req }) => {
  const user = req.user as { role?: string } | null;
  if (!user) return false;
  return userHasFeature(user, "team-tasks");
};

const canUpdateTeamTasks: Access = ({ req }) => {
  const user = req.user as { role?: string } | null;
  if (!user) return false;
  return userHasFeature(user, "team-tasks");
};

const adminOrManagerField: FieldAccess = ({ req }) => {
  const role = (req.user as { role?: string } | null)?.role;
  return role === "admin" || role === "manager";
};

const readIfLoggedIn: FieldAccess = ({ req }) => Boolean(req.user);

const prepareTeamTask: CollectionBeforeChangeHook = ({ data, originalDoc, operation, req }) => {
  if (!data) return data;

  if (operation === "create" && req.user?.id && !data.createdBy) {
    data.createdBy = req.user.id;
  }

  if (data.status === "completed" && originalDoc?.status !== "completed" && !data.completedAt) {
    data.completedAt = new Date().toISOString();
  }

  if (operation === "update" && originalDoc?.status === "completed" && data.status && data.status !== "completed") {
    data.completedAt = null;
  }

  return data;
};

const logTeamTaskActivity: CollectionAfterChangeHook = async ({ doc, previousDoc, operation, req }) => {
  const clientId = getRelationshipId(doc.client);
  const taskTypeLabel = TASK_TYPE_OPTIONS.find((option) => option.value === doc.taskType)?.label || "Task";

  if (operation === "create" || previousDoc?.status === doc.status) return;

  if (doc.status === "ready_for_review") {
    logActivity(req.payload, {
      type: "team_task_ready_for_review",
      title: `Ready for review: ${doc.title}`,
      description: `${taskTypeLabel} task submitted for review.`,
      user: req.user?.id,
      client: clientId,
      targetUrl: `/admin/collections/team-tasks/${doc.id}`,
    }).catch(() => {});
  }

  if (doc.status === "completed") {
    logActivity(req.payload, {
      type: "team_task_completed",
      title: `Completed task: ${doc.title}`,
      description: `${taskTypeLabel} task completed.`,
      user: req.user?.id,
      client: clientId,
      targetUrl: `/admin/collections/team-tasks/${doc.id}`,
    }).catch(() => {});
  }
};

export const TeamTasks: CollectionConfig = {
  slug: "team-tasks",
  labels: {
    singular: "Team Task",
    plural: "Team Tasks",
  },
  admin: {
    useAsTitle: "title",
    group: "Clients",
    description: "Assign and track client work for team members.",
    defaultColumns: ["title", "client", "taskType", "status", "priority", "assignedTo", "dueDate", "completedAt"],
    listSearchableFields: ["title", "instructions", "staffNotes", "reviewNotes"],
    components: {
      views: {
        list: {
          Component: "./components/TeamTasksListView",
        },
      },
    },
    hidden: hideUnlessFeature("team-tasks"),
  },
  access: {
    read: canReadTeamTasks,
    create: canCreateTeamTasks,
    update: canUpdateTeamTasks,
    delete: adminOnlyDelete,
  },
  defaultSort: "-updatedAt",
  hooks: {
    beforeChange: [prepareTeamTask],
    afterChange: [logTeamTaskActivity],
  },
  fields: [
    {
      type: "tabs",
      tabs: [
        {
          label: "Task",
          fields: [
            {
              name: "title",
              type: "text",
              required: true,
            },
            {
              type: "row",
              fields: [
                {
                  name: "client",
                  type: "relationship",
                  relationTo: "clients",
                  index: true,
                  admin: {
                    description: "Client this work is for.",
                  },
                  access: {
                    update: adminOrManagerField,
                  },
                },
                {
                  name: "assignedTo",
                  type: "relationship",
                  relationTo: "users",
                  index: true,
                  admin: {
                    description: "Team member responsible for this task.",
                  },
                  access: {
                    read: readIfLoggedIn,
                    create: adminOrManagerField,
                    update: adminOrManagerField,
                  },
                },
              ],
            },
            {
              type: "row",
              fields: [
                {
                  name: "taskType",
                  type: "select",
                  required: true,
                  defaultValue: "other",
                  options: TASK_TYPE_OPTIONS as unknown as { label: string; value: string }[],
                  index: true,
                  access: {
                    update: adminOrManagerField,
                  },
                },
                {
                  name: "status",
                  type: "select",
                  required: true,
                  defaultValue: "in_progress",
                  options: STATUS_OPTIONS as unknown as { label: string; value: string }[],
                  index: true,
                },
                {
                  name: "priority",
                  type: "select",
                  required: true,
                  defaultValue: "normal",
                  options: PRIORITY_OPTIONS as unknown as { label: string; value: string }[],
                  access: {
                    update: adminOrManagerField,
                  },
                },
              ],
            },
            {
              type: "row",
              fields: [
                {
                  name: "dueDate",
                  type: "date",
                  admin: {
                    date: { pickerAppearance: "dayOnly" },
                  },
                  access: {
                    update: adminOrManagerField,
                  },
                },
                {
                  name: "completedAt",
                  label: "Completed At",
                  type: "date",
                  admin: {
                    date: { pickerAppearance: "dayAndTime" },
                    description: "Set automatically when status changes to Completed.",
                    readOnly: true,
                  },
                },
              ],
            },
          ],
        },
        {
          label: "Instructions",
          fields: [
            {
              name: "instructions",
              type: "textarea",
              admin: {
                rows: 14,
                description: "Original brief, context, checklist, prompts, client notes, or delivery requirements.",
              },
            },
            {
              name: "sourceUrl",
              label: "Primary Source URL",
              type: "text",
              admin: {
                description: "Optional primary Trello, Google Doc, Loom, page, CMS, or source link.",
              },
            },
            {
              name: "relatedLinks",
              type: "array",
              fields: [
                { name: "label", type: "text", required: true },
                { name: "url", type: "text", required: true },
                {
                  name: "kind",
                  type: "select",
                  defaultValue: "other",
                  options: LINK_KIND_OPTIONS as unknown as { label: string; value: string }[],
                },
              ],
            },
            {
              name: "screenshots",
              label: "Screenshots / Images",
              type: "array",
              admin: {
                description: "Images attached from the Team Task detail pane.",
              },
              fields: [
                { name: "label", type: "text", required: true },
                { name: "url", type: "text", required: true },
                { name: "thumbnailUrl", type: "text" },
                { name: "mediaId", type: "number", required: true },
              ],
            },
          ],
        },
        {
          label: "Updates & Review",
          fields: [
            {
              name: "staffNotes",
              label: "Staff Notes / Progress Updates",
              type: "textarea",
              admin: {
                rows: 10,
                description: "Assignee notes, blockers, issue links, completion remarks, or questions.",
              },
            },
            {
              name: "reviewNotes",
              label: "Review Notes",
              type: "textarea",
              admin: {
                rows: 10,
                description: "Peter/manager review feedback and requested changes.",
              },
              access: {
                update: adminOrManagerField,
              },
            },
          ],
        },
        {
          label: "History",
          fields: [
            {
              name: "createdBy",
              type: "relationship",
              relationTo: "users",
              index: true,
              admin: {
                readOnly: true,
                description: "User who created the task.",
              },
              access: {
                read: readIfLoggedIn,
                update: () => false,
              },
            },
            {
              name: "sheetWeek",
              label: "Imported Sheet Week",
              type: "text",
              admin: {
                description: "Historical CSV/week label, e.g. (WEEK 13) Oct 6 to Oct 12, 2025.",
              },
            },
          ],
        },
      ],
    },
  ],
};
