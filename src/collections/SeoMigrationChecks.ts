import type { CollectionConfig } from "payload";
import { canAccess, adminOnlyDelete, hideUnlessFeature } from "../lib/access";

/**
 * Post-Migration SEO Review.
 *
 * Stores the result of a best-practice SEO migration health check for a client
 * (redirect tracing, soft-404 detection, indexing/robots/sitemap checks, GSC
 * before/after performance, Core Web Vitals, and advisory process items).
 *
 * Records are produced by POST /api/gsc/migration-check and rendered via the
 * SEO hub + a custom Results UI. Heavy JSON fields are hidden from the default
 * form and surfaced through the Results component instead.
 */
export const SeoMigrationChecks: CollectionConfig = {
  slug: "seo-migration-checks",
  labels: {
    singular: "Post-Migration SEO Review",
    plural: "Post-Migration SEO Reviews",
  },
  admin: {
    useAsTitle: "title",
    group: "Growth Tools",
    defaultColumns: ["client", "cutoverDate", "overallScore", "status", "createdAt"],
    description: "Best-practice SEO health review after a site migration",
    hidden: hideUnlessFeature("seo-migration-checks"),
  },
  access: {
    read: canAccess("seo-migration-checks"),
    create: canAccess("seo-migration-checks"),
    update: canAccess("seo-migration-checks"),
    delete: adminOnlyDelete,
  },
  fields: [
    {
      type: "tabs",
      tabs: [
        {
          label: "Overview",
          fields: [
            {
              name: "resultsView",
              type: "ui",
              admin: {
                components: {
                  Field: "./components/SeoMigrationCheckResults",
                },
              },
            },
            {
              name: "title",
              type: "text",
              admin: {
                readOnly: true,
                description: "Auto-generated label (domain + cutover date)",
              },
            },
            {
              name: "client",
              type: "relationship",
              relationTo: "clients",
              required: true,
              admin: {
                position: "sidebar",
                description: "The client this review belongs to",
              },
            },
            {
              name: "siteUrl",
              type: "text",
              admin: { readOnly: true, description: "GSC property URL reviewed" },
            },
            {
              type: "row",
              fields: [
                {
                  name: "cutoverDate",
                  type: "date",
                  required: true,
                  admin: {
                    description: "Date the new site went live",
                    date: { pickerAppearance: "dayOnly", displayFormat: "dd MMM yyyy" },
                  },
                },
                {
                  name: "isDomainMove",
                  type: "checkbox",
                  defaultValue: false,
                  admin: { description: "Tick for a domain change (Change of Address applies)" },
                },
              ],
            },
            {
              type: "row",
              fields: [
                {
                  name: "status",
                  type: "select",
                  defaultValue: "pending",
                  options: [
                    { label: "Pending", value: "pending" },
                    { label: "Running", value: "running" },
                    { label: "Completed", value: "completed" },
                    { label: "Failed", value: "failed" },
                  ],
                  admin: { readOnly: true },
                },
                {
                  name: "overallScore",
                  type: "number",
                  admin: { readOnly: true, description: "0–100 migration health score" },
                },
                {
                  name: "runAt",
                  type: "date",
                  admin: { readOnly: true, description: "When the review was run" },
                },
              ],
            },
            {
              name: "error",
              type: "textarea",
              admin: {
                readOnly: true,
                condition: (_d, sibling) => !!sibling?.error,
              },
            },
            {
              name: "trackingControls",
              type: "ui",
              admin: {
                components: {
                  Field: "./components/SeoMigrationTrackingControls",
                },
              },
            },
            {
              type: "row",
              fields: [
                {
                  name: "trackingEnabled",
                  label: "Migration 30-day review",
                  type: "checkbox",
                  defaultValue: true,
                  admin: {
                    description: "Turn on the sequenced 30-day migration review. Emails send at days 1, 2, 3, 7, 10, 14, 21, and 30 after cutover.",
                  },
                },
                {
                  name: "trackingStatus",
                  label: "30-day review status",
                  type: "select",
                  defaultValue: "active",
                  options: [
                    { label: "Active", value: "active" },
                    { label: "Complete", value: "complete" },
                    { label: "Paused", value: "paused" },
                    { label: "Failed", value: "failed" },
                  ],
                  admin: { readOnly: true, description: "Scheduled report processing status" },
                },
              ],
            },
            {
              name: "emailRecipients",
              label: "30-day review email recipients",
              type: "textarea",
              admin: {
                description: "Comma/newline-separated recipients. Falls back to ALERT_EMAIL_TO if empty.",
              },
            },
            {
              name: "trackingNotes",
              label: "30-day review notes / email comment",
              type: "textarea",
              admin: {
                description: "Optional internal note/comment for this migration review. Included in milestone emails so recipients know the context.",
              },
            },
            {
              type: "row",
              fields: [
                {
                  name: "lastTrackingRunAt",
                  type: "date",
                  admin: { readOnly: true, description: "Last scheduled tracking refresh" },
                },
                {
                  name: "lastEmailSentAt",
                  type: "date",
                  admin: { readOnly: true, description: "Last milestone email sent" },
                },
                {
                  name: "lastEmailMilestoneDay",
                  type: "number",
                  admin: { readOnly: true, description: "Last emailed post-migration day" },
                },
                {
                  name: "nextEmailMilestoneDay",
                  type: "number",
                  admin: { readOnly: true, description: "Next scheduled post-migration day" },
                },
              ],
            },
          ],
        },
        {
          label: "Data",
          description: "Raw review data (rendered via the Overview tab)",
          fields: [
            {
              name: "scoresByPhase",
              type: "json",
              admin: { readOnly: true, condition: () => false },
            },
            {
              name: "checklist",
              type: "json",
              admin: { readOnly: true, condition: () => false },
            },
            {
              name: "redirects",
              type: "json",
              admin: { readOnly: true, condition: () => false },
            },
            {
              name: "performance",
              type: "json",
              admin: { readOnly: true, condition: () => false },
            },
            {
              name: "actions",
              type: "json",
              admin: { readOnly: true, condition: () => false },
            },
            {
              name: "trackingSchedule",
              type: "json",
              admin: { readOnly: true, condition: () => false },
            },
            {
              name: "trackingSnapshots",
              type: "json",
              admin: { readOnly: true, condition: () => false },
            },
            {
              name: "trackingFlags",
              type: "json",
              admin: { readOnly: true, condition: () => false },
            },
            {
              name: "trackingIssueReport",
              type: "json",
              admin: { readOnly: true, condition: () => false },
            },
          ],
        },
      ],
    },
  ],
};
