import type { CollectionConfig } from "payload";

/**
 * In-CMS Notifications.
 *
 * Per-user, dismissible notifications surfaced via the bell component in the
 * admin top-bar. **Sparingly used** — only explicit user-facing events worth
 * interrupting someone for. Not a generic activity-log feed; that lives in
 * `activity-log`.
 *
 * Initial event kinds:
 *  - `contract-annual-review-11mo` — fired by `/api/contract-reminders/tick`.
 *  - `contract-annual-review-11.5mo` — same.
 *
 * Read access is per-recipient: non-admin users only see their own rows.
 */
export const Notifications: CollectionConfig = {
  slug: "notifications" as never,
  labels: {
    singular: "Notification",
    plural: "Notifications",
  },
  admin: {
    group: "Admin",
    hidden: true,
    useAsTitle: "title",
    defaultColumns: ["title", "recipient", "kind", "readAt", "createdAt"],
    description:
      "In-CMS notifications surfaced via the admin top-bar bell. Per-user, dismissible.",
  },
  access: {
    read: ({ req }) => {
      const user = req.user as { id?: string | number; role?: string } | null;
      if (!user) return false;
      if (user.role === "admin") return true;
      return { recipient: { equals: user.id } };
    },
    create: ({ req }) => Boolean(req.user),
    update: ({ req }) => Boolean(req.user),
    delete: ({ req }) =>
      (req.user as { role?: string } | null)?.role === "admin",
  },
  fields: [
    {
      name: "recipient",
      type: "relationship",
      relationTo: "users",
      required: true,
      index: true,
    },
    {
      name: "kind",
      type: "select",
      required: true,
      options: [
        {
          label: "Contract annual review — 11 month",
          value: "contract-annual-review-11mo",
        },
        {
          label: "Contract annual review — 11.5 month",
          value: "contract-annual-review-11.5mo",
        },
        {
          label: "Invoice statements ready for review",
          value: "invoice-statements-ready",
        },
        {
          label: "Agent approval pending",
          value: "agent-approval-pending",
        },
        {
          label: "Negative keyword consolidation needed",
          value: "consolidation-pending",
        },
        {
          label: "Goal run escalation",
          value: "goal-run-escalation",
        },
        {
          label: "Monthly Google Ads budget review",
          value: "google-ads-budget-review",
        },
        {
          label: "Meeting attendee accepted",
          value: "meeting-response-accepted",
        },
        {
          label: "Meeting attendee declined",
          value: "meeting-response-declined",
        },
        {
          label: "Meeting time confirmed",
          value: "meeting-confirmed",
        },
      ],
    },
    {
      name: "title",
      type: "text",
      required: true,
    },
    {
      name: "body",
      type: "text",
      admin: {
        description: "Short summary line.",
      },
    },
    {
      name: "url",
      type: "text",
      admin: {
        description: "Deep link (relative, e.g. /admin/collections/contracts/123).",
      },
    },
    {
      name: "relatedContract",
      type: "relationship",
      relationTo: "contracts" as never,
    },
    {
      name: "relatedClient",
      type: "relationship",
      relationTo: "clients",
    },
    {
      name: "relatedMeetingScheduler",
      type: "relationship",
      relationTo: "meeting-schedulers" as never,
      admin: {
        description:
          "Links the notification to the meeting-scheduler row whose attendee responded or whose time was confirmed.",
      },
    },
    {
      name: "relatedApproval",
      type: "relationship",
      relationTo: "agent-approval-queue" as never,
      admin: {
        description:
          "Links the notification to the agent-approval row it was fanned out for. Used to bulk-clear bell rows when any admin actions the queue item.",
      },
    },
    {
      name: "relatedGoalRun",
      type: "relationship",
      relationTo: "goal-runs" as never,
      admin: {
        description:
          "Links the notification to the goal-runs row that triggered the escalation.",
      },
    },
    {
      name: "relatedConsolidationCandidate",
      type: "relationship",
      relationTo: "consolidation-candidates" as never,
      admin: {
        description:
          "Links the notification to a consolidation-candidate row. Used to bulk-clear bell rows when any admin actions the candidate.",
      },
    },
    {
      name: "readAt",
      type: "date",
      admin: {
        description:
          "When the recipient dismissed or clicked the notification. Null until then.",
      },
    },
  ],
  timestamps: true,
};
