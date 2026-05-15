import type { CollectionConfig, CollectionBeforeChangeHook } from "payload";
import { hasValidApiKey } from "./api-key-access";
import { logActivity } from "../lib/activity-log";
import { canAccessOrApiKey, adminOnlyDelete } from "../lib/access";

/**
 * Denormalise the linked client's name onto the alert so the admin list view
 * can render a human-readable title without an extra lookup.
 */
const denormaliseClientName: CollectionBeforeChangeHook = async ({ data, req }) => {
  if (!data) return data;
  if (data.clientName) return data;
  const clientId = typeof data.client === "object" ? data.client?.id : data.client;
  if (!clientId) return data;
  try {
    const client = await req.payload.findByID({
      collection: "clients",
      id: clientId,
      depth: 0,
    });
    if (client?.name) {
      data.clientName = client.name;
    }
  } catch {
    // Non-fatal.
  }
  return data;
};

export const SerpDisplacementAlerts: CollectionConfig = {
  slug: "serp-displacement-alerts",
  labels: {
    singular: "SERP Displacement Alert",
    plural: "SERP Displacement Alerts",
  },
  admin: {
    useAsTitle: "description",
    defaultColumns: [
      "clientName",
      "keyword",
      "alertType",
      "severity",
      "createdAt",
    ],
    group: "Reports",
    description:
      "Material SERP changes flagged by the daily displacement diff (AI Overview appeared/lost, citations gained/lost, organic drop, paid displaced). Pushed by Growth Tools.",
    // Hidden from the sidebar entirely. Growth Tools push integration is not
    // yet wired up, so the table is empty and clutters the nav. Routes still
    // work for programmatic access (OptiMate's get_serp_displacement_alerts
    // tool reads via payload.find with overrideAccess: true).
    hidden: true,
  },
  hooks: {
    beforeChange: [denormaliseClientName],
    afterChange: [
      async ({ doc, operation, req }) => {
        if (operation === "create") {
          logActivity(req.payload, {
            type: "serp_displacement_alert_created",
            title: `SERP alert: ${doc.clientName || "client"} — ${doc.keyword} (${doc.alertType})`,
            description: doc.description || `Severity: ${doc.severity}`,
            user: req.user?.id,
            client: typeof doc.client === "object" ? doc.client?.id : doc.client,
          }).catch(() => {});
        }
      },
    ],
  },
  access: {
    read: canAccessOrApiKey("serp-displacement-alerts", hasValidApiKey),
    update: canAccessOrApiKey("serp-displacement-alerts", hasValidApiKey),
    delete: adminOnlyDelete,
    create: canAccessOrApiKey("serp-displacement-alerts", hasValidApiKey),
  },
  fields: [
    {
      name: "client",
      type: "relationship",
      relationTo: "clients",
      required: true,
      admin: {
        description: "Linked client",
      },
    },
    {
      name: "clientName",
      type: "text",
      admin: {
        description:
          "Denormalised client name for the admin list view. Auto-populated from the linked client when left blank.",
      },
    },
    {
      name: "keyword",
      type: "text",
      required: true,
      admin: {
        description: "The monitored keyword this alert is about",
      },
    },
    {
      type: "row",
      fields: [
        {
          name: "alertType",
          type: "select",
          required: true,
          options: [
            { label: "AI Overview appeared", value: "ai_overview_appeared" },
            { label: "AI Overview lost", value: "ai_overview_lost" },
            { label: "Cited in AIO", value: "cited_in_aio" },
            { label: "Dropped from AIO", value: "dropped_from_aio" },
            { label: "Organic drop", value: "organic_drop" },
            { label: "Paid displaced", value: "paid_displaced" },
          ],
          admin: { width: "50%" },
        },
        {
          name: "severity",
          type: "select",
          required: true,
          options: [
            { label: "Info", value: "info" },
            { label: "Warning", value: "warning" },
            { label: "Critical", value: "critical" },
          ],
          admin: { width: "50%" },
        },
      ],
    },
    {
      name: "description",
      type: "text",
      required: true,
      admin: {
        description: "Short human-readable summary of what changed",
      },
    },
    {
      name: "recommendedAction",
      type: "textarea",
      admin: {
        description:
          'The "what to do" chip text — guidance the account manager should action (see plan §2.9).',
      },
    },
    {
      type: "row",
      fields: [
        {
          name: "emailSent",
          type: "checkbox",
          defaultValue: false,
          admin: {
            width: "50%",
            description: "Digest email that surfaced this alert has been sent",
          },
        },
        {
          name: "createdAt",
          type: "date",
          required: true,
          admin: {
            width: "50%",
            description: "When the alert was generated",
          },
        },
      ],
    },
  ],
};
