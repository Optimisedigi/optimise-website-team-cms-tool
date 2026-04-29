import type { CollectionConfig } from "payload";
import { logActivity } from "../lib/activity-log";
import { canAccess, adminOnlyDelete, hideUnlessFeature } from "../lib/access";

export const TagSetupAudits: CollectionConfig = {
  slug: "tag-setup-audits",
  labels: {
    singular: "Tag Setup Audit",
    plural: "Tag Setup Audits",
  },
  admin: {
    useAsTitle: "url",
    group: "Growth Tools",
    defaultColumns: ["url", "status", "client", "createdAt"],
    description: "GA4 and GTM tag validation results",
    hidden: hideUnlessFeature("tag-setup-audits"),
  },
  hooks: {
    afterChange: [
      async ({ doc, operation, req }) => {
        if (operation === "create") {
          logActivity(req.payload, {
            type: "tag_audit_completed",
            title: `Tag audit: ${doc.url}`,
            description: `Status: ${doc.status || "pending"}`,
            user: req.user?.id,
            client: typeof doc.client === "object" ? doc.client?.id : doc.client,
          }).catch(() => {});
        }
      },
    ],
  },
  access: {
    read: canAccess("tag-setup-audits"),
    create: canAccess("tag-setup-audits"),
    update: canAccess("tag-setup-audits"),
    delete: adminOnlyDelete,
  },
  fields: [
    {
      type: "row",
      fields: [
        {
          name: "client",
          type: "relationship",
          relationTo: "clients",
          required: true,
          admin: {
            width: "50%",
          },
        },
        {
          name: "url",
          type: "text",
          required: true,
          admin: {
            description: "URL that was audited",
            width: "50%",
          },
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
            { label: "Healthy", value: "healthy" },
            { label: "Warnings", value: "warnings" },
            { label: "Critical Issues", value: "critical_issues" },
            { label: "Not Configured", value: "not_configured" },
            { label: "Error", value: "error" },
          ],
          admin: {
            width: "33%",
          },
        },
        {
          name: "canAutoFix",
          type: "checkbox",
          defaultValue: false,
          admin: {
            description: "Website is built by us - we can apply fixes directly",
            readOnly: true,
            width: "33%",
          },
        },
        {
          name: "autoFixApplied",
          type: "checkbox",
          defaultValue: false,
          admin: {
            description: "Auto-fixes have been applied",
            width: "33%",
          },
        },
      ],
    },

    // Summary
    {
      name: "summary",
      type: "group",
      admin: {
        description: "Quick overview of the audit results",
      },
      fields: [
        {
          type: "row",
          fields: [
            {
              name: "gtmLoaded",
              type: "checkbox",
              defaultValue: false,
              admin: { readOnly: true, width: "25%" },
            },
            {
              name: "ga4Configured",
              type: "checkbox",
              defaultValue: false,
              admin: { readOnly: true, width: "25%" },
            },
            {
              name: "eventsDetected",
              type: "number",
              defaultValue: 0,
              admin: { readOnly: true, width: "25%" },
            },
            {
              name: "issuesCount",
              type: "number",
              defaultValue: 0,
              admin: { readOnly: true, width: "25%" },
            },
          ],
        },
        {
          type: "row",
          fields: [
            {
              name: "gtmContainerIds",
              type: "text",
              admin: {
                readOnly: true,
                description: "GTM container IDs found",
                width: "50%",
              },
            },
            {
              name: "measurementIds",
              type: "text",
              admin: {
                readOnly: true,
                description: "GA4 Measurement IDs found",
                width: "50%",
              },
            },
          ],
        },
        {
          name: "consentModeDetected",
          type: "checkbox",
          defaultValue: false,
          admin: { readOnly: true },
        },
      ],
    },

    // Issues with fix instructions
    {
      name: "issues",
      type: "array",
      admin: {
        description: "Issues found during the audit with fix instructions",
      },
      fields: [
        {
          type: "row",
          fields: [
            {
              name: "severity",
              type: "select",
              required: true,
              options: [
                { label: "Critical", value: "critical" },
                { label: "Warning", value: "warning" },
                { label: "Info", value: "info" },
              ],
              admin: { width: "25%" },
            },
            {
              name: "category",
              type: "select",
              required: true,
              options: [
                { label: "Installation", value: "installation" },
                { label: "Configuration", value: "configuration" },
                { label: "Measurement ID", value: "measurement_id" },
                { label: "Events", value: "events" },
                { label: "Consent", value: "consent" },
              ],
              admin: { width: "25%" },
            },
            {
              name: "autoFixable",
              type: "checkbox",
              defaultValue: false,
              admin: {
                description: "Can be auto-fixed for built-by-us sites",
                width: "25%",
              },
            },
            {
              name: "fixed",
              type: "checkbox",
              defaultValue: false,
              admin: {
                description: "Has been resolved",
                width: "25%",
              },
            },
          ],
        },
        {
          name: "message",
          type: "text",
          required: true,
          admin: {
            description: "What is wrong",
          },
        },
        {
          name: "fix",
          type: "textarea",
          admin: {
            description: "How to fix it",
          },
        },
      ],
    },

    // Events captured
    {
      name: "events",
      type: "array",
      admin: {
        description: "GA4 events captured during the audit",
        readOnly: true,
      },
      fields: [
        {
          type: "row",
          fields: [
            {
              name: "name",
              type: "text",
              admin: { width: "50%" },
            },
            {
              name: "measurementId",
              type: "text",
              admin: { width: "50%" },
            },
          ],
        },
      ],
    },

    // Missing events
    {
      name: "missingEvents",
      type: "json",
      admin: {
        readOnly: true,
        description: "Expected events that were not found",
      },
    },

    // DataLayer events found
    {
      name: "dataLayerEvents",
      type: "json",
      admin: {
        readOnly: true,
        description: "Events found in the dataLayer",
      },
    },

    // Raw result from Scrapling
    {
      name: "rawResult",
      type: "json",
      admin: {
        readOnly: true,
        description: "Full raw response from the validation service",
      },
    },

    // Error info
    {
      name: "error",
      type: "text",
      admin: {
        readOnly: true,
        description: "Error message if the audit failed",
      },
    },
  ],
};
