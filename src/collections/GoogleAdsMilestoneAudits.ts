import type { CollectionConfig } from "payload";

const isAdminUser = ({ req }: { req: { user?: { role?: string } | null } }) => req.user?.role === "admin";

/**
 * Google Ads milestone audits.
 *
 * One row per Google Ads account per milestone (1, 3, 6, 9 and 12 months after
 * the client's Campaign start date). Rows are created and advanced by the
 * hourly `/api/google-ads-milestone-audits/cron` runner:
 *
 *   scheduled → capturing (Growth Tools snapshot) → awaiting_approval
 *     → shared (approved + applied: deck published, Gmail draft created)
 *
 * Side exits: skipped (superseded/too old/no go-live date), rejected (approval
 * rejected), failed (capture failed 3 times). Admins can set a failed or
 * skipped row back to "scheduled" to retry it on the next run.
 */
export const GoogleAdsMilestoneAudits: CollectionConfig = {
  slug: "google-ads-milestone-audits",
  labels: { singular: "Google Ads Milestone Audit", plural: "Google Ads Milestone Audits" },
  admin: {
    group: "Growth Tools",
    useAsTitle: "title",
    defaultColumns: ["title", "client", "months", "dueDate", "status", "overallScore", "sharedAt"],
    listSearchableFields: ["title"],
    description:
      "Automated Google Ads audits at 1, 3, 6, 9 and 12 months after a client's Campaign start date. Each one waits in OptiMate Approvals; applying it publishes the deck and creates a Gmail draft to the client.",
  },
  defaultSort: "dueDate",
  access: {
    read: ({ req }) => Boolean(req.user),
    create: isAdminUser,
    update: isAdminUser,
    delete: isAdminUser,
  },
  fields: [
    { name: "title", type: "text", required: true },
    {
      type: "row",
      fields: [
        { name: "client", type: "relationship", relationTo: "clients", required: true, index: true, admin: { width: "50%" } },
        { name: "audit", type: "relationship", relationTo: "google-ads-audits", required: true, index: true, admin: { width: "50%", description: "Google Ads account audited" } },
      ],
    },
    {
      type: "row",
      fields: [
        {
          name: "months",
          type: "number",
          required: true,
          admin: { width: "25%", description: "Milestone: months after go-live" },
        },
        { name: "goLiveDate", type: "date", required: true, admin: { width: "25%", description: "Campaign start used for this schedule" } },
        { name: "dueDate", type: "date", required: true, index: true, admin: { width: "25%", description: "Runs the day after this date" } },
        {
          name: "status",
          type: "select",
          required: true,
          defaultValue: "scheduled",
          index: true,
          options: [
            { label: "Scheduled", value: "scheduled" },
            { label: "Capturing", value: "capturing" },
            { label: "Awaiting approval", value: "awaiting_approval" },
            { label: "Shared", value: "shared" },
            { label: "Rejected", value: "rejected" },
            { label: "Skipped", value: "skipped" },
            { label: "Failed", value: "failed" },
          ],
          admin: { width: "25%" },
        },
      ],
    },
    {
      name: "milestoneKey",
      type: "text",
      required: true,
      unique: true,
      index: true,
      admin: { readOnly: true, description: "auditId:months — one row per account per milestone" },
    },
    {
      type: "row",
      fields: [
        { name: "periodStart", type: "date", admin: { readOnly: true, width: "33%" } },
        { name: "periodEnd", type: "date", admin: { readOnly: true, width: "33%" } },
        { name: "overallScore", type: "number", admin: { readOnly: true, width: "33%" } },
      ],
    },
    { name: "snapshot", type: "relationship", relationTo: "google-ads-audit-snapshots", admin: { readOnly: true } },
    { name: "approval", type: "relationship", relationTo: "agent-approval-queue" as never, admin: { readOnly: true } },
    {
      type: "row",
      fields: [
        { name: "deckSlug", type: "text", admin: { readOnly: true, width: "50%" } },
        { name: "deckUrl", type: "text", admin: { readOnly: true, width: "50%" } },
      ],
    },
    {
      type: "row",
      fields: [
        { name: "sharedAt", type: "date", admin: { readOnly: true, width: "50%", date: { pickerAppearance: "dayAndTime" } } },
        { name: "gmailDraftId", type: "text", admin: { readOnly: true, width: "50%" } },
      ],
    },
    { name: "captureStartedAt", type: "date", admin: { readOnly: true, date: { pickerAppearance: "dayAndTime" } } },
    { name: "attempts", type: "number", defaultValue: 0, admin: { readOnly: true } },
    { name: "note", type: "textarea", admin: { description: "Why a row was skipped, rejected or failed" } },
  ],
  timestamps: true,
};
