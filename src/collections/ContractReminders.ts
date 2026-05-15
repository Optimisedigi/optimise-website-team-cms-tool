import type { CollectionConfig } from "payload";

/**
 * Contract Reminders.
 *
 * One row per *scheduled* reminder for a contract's first-anniversary annual
 * review. Every contract with `annualReviewReminderEnabled = true` gets two
 * rows: the **11-month** lead-time email and the **11.5-month** final-nudge
 * email. The cron at `/api/contract-reminders/tick` picks up rows where
 * `status = "pending"` AND `sendAt <= now` and fires the email + in-CMS
 * notification, flipping the row to `sent`.
 *
 * Why this isn't just a `sentAt` column on `contracts`:
 *  - We need to track each reminder independently (11-month vs 11.5-month).
 *  - Snapshotting the recipient list at schedule time means deleting a user
 *    or changing the contract's recipients doesn't accidentally retroactively
 *    affect already-fired rows.
 *  - History is preserved (`sent` / `failed` / `skipped`) so the admin can
 *    audit what went out when.
 */
export const ContractReminders: CollectionConfig = {
  slug: "contract-reminders" as never,
  labels: {
    singular: "Contract Reminder",
    plural: "Contract Reminders",
  },
  admin: {
    group: "Admin",
    hidden: true,
    useAsTitle: "id",
    defaultColumns: ["contract", "kind", "status", "sendAt", "sentAt"],
    description:
      "Scheduled annual-review reminders for contracts. Created automatically when a contract is saved with reminders enabled.",
  },
  access: {
    read: ({ req }) => Boolean(req.user),
    create: ({ req }) => Boolean(req.user),
    update: ({ req }) => Boolean(req.user),
    delete: ({ req }) =>
      (req.user as { role?: string } | null)?.role === "admin",
  },
  fields: [
    {
      name: "contract",
      type: "relationship",
      relationTo: "contracts" as never,
      required: true,
      index: true,
    },
    {
      name: "kind",
      type: "select",
      required: true,
      options: [
        { label: "11 months (4-week lead)", value: "11-month" },
        { label: "11.5 months (2-week final nudge)", value: "11.5-month" },
      ],
    },
    {
      name: "sendAt",
      type: "date",
      required: true,
      index: true,
      admin: {
        description:
          "When this reminder is due. Computed from the contract's effective date.",
      },
    },
    {
      name: "status",
      type: "select",
      required: true,
      defaultValue: "pending",
      options: [
        { label: "Pending", value: "pending" },
        { label: "Sent", value: "sent" },
        { label: "Failed", value: "failed" },
        { label: "Skipped", value: "skipped" },
      ],
    },
    {
      name: "recipients",
      type: "relationship",
      relationTo: "users",
      hasMany: true,
      admin: {
        description:
          "Snapshot of the contract's recipients at scheduling time. Used by the cron when sending.",
      },
    },
    {
      name: "sentAt",
      type: "date",
      admin: {
        readOnly: true,
        description: "Wall-clock time when the email and notification fired.",
      },
    },
    {
      name: "lastError",
      type: "text",
      admin: {
        readOnly: true,
        description: "Populated only when status = failed.",
      },
    },
    {
      name: "notes",
      type: "textarea",
      admin: {
        description:
          "Free-form notes. Used by the backfill script to mark rows as 'backfilled past anniversary'.",
      },
    },
  ],
  timestamps: true,
};
