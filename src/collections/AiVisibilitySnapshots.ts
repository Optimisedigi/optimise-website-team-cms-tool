import type { CollectionConfig, CollectionBeforeChangeHook } from "payload";
import { hasValidApiKey } from "./api-key-access";
import { logActivity } from "../lib/activity-log";
import { canAccessOrApiKey, adminOnlyDelete, hideUnlessFeature } from "../lib/access";

/**
 * Denormalise the linked client's name onto the snapshot so the admin list view
 * (and any external consumer) can render a human-readable title without an extra
 * lookup. Mirrors the pattern used by Growth Tools when it pushes report rows.
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
    // Non-fatal — the snapshot is still valid without the denormalised name.
  }
  return data;
};

export const AiVisibilitySnapshots: CollectionConfig = {
  slug: "ai-visibility-snapshots",
  labels: {
    singular: "AI Visibility",
    plural: "AI Visibility",
  },
  admin: {
    useAsTitle: "clientName",
    defaultColumns: ["clientName", "periodEnd", "totalSessions", "totalConversions"],
    group: "Reports",
    description:
      "Weekly AI assistant referral traffic snapshots (ChatGPT, Perplexity, Gemini, Claude, Copilot, etc.) pulled from GA4 by Growth Tools.",
    hidden: hideUnlessFeature("ai-visibility-snapshots"),
  },
  hooks: {
    beforeChange: [denormaliseClientName],
    afterChange: [
      async ({ doc, operation, req }) => {
        if (operation === "create") {
          logActivity(req.payload, {
            type: "ai_visibility_snapshot_created",
            title: `AI visibility snapshot: ${doc.clientName || "client"} (${doc.periodStart} → ${doc.periodEnd})`,
            description: `${doc.totalSessions ?? 0} sessions, ${doc.totalConversions ?? 0} conversions`,
            user: req.user?.id,
            client: typeof doc.client === "object" ? doc.client?.id : doc.client,
          }).catch(() => {});
        }
      },
    ],
  },
  access: {
    read: canAccessOrApiKey("ai-visibility-snapshots", hasValidApiKey),
    update: canAccessOrApiKey("ai-visibility-snapshots", hasValidApiKey),
    delete: adminOnlyDelete,
    create: canAccessOrApiKey("ai-visibility-snapshots", hasValidApiKey),
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
      name: "propertyId",
      type: "text",
      required: true,
      admin: {
        description: "GA4 property ID the snapshot was pulled from",
      },
    },
    {
      type: "row",
      fields: [
        {
          name: "periodStart",
          type: "text",
          required: true,
          admin: {
            width: "50%",
            description: "Start of the reporting window (YYYY-MM-DD)",
          },
        },
        {
          name: "periodEnd",
          type: "text",
          required: true,
          admin: {
            width: "50%",
            description: "End of the reporting window (YYYY-MM-DD)",
          },
        },
      ],
    },
    {
      type: "row",
      fields: [
        {
          name: "totalSessions",
          type: "number",
          required: true,
          admin: { width: "33%" },
        },
        {
          name: "totalUsers",
          type: "number",
          required: true,
          admin: { width: "33%" },
        },
        {
          name: "totalConversions",
          type: "number",
          required: true,
          admin: { width: "33%" },
        },
      ],
    },
    {
      type: "row",
      fields: [
        {
          name: "conversionValue",
          type: "number",
          defaultValue: 0,
          admin: { width: "33%" },
        },
        {
          name: "engagedSessions",
          type: "number",
          defaultValue: 0,
          admin: { width: "33%" },
        },
        {
          name: "avgEngagementTime",
          type: "number",
          defaultValue: 0,
          admin: {
            width: "33%",
            description: "Average engagement time in seconds",
          },
        },
      ],
    },
    {
      name: "bySource",
      type: "json",
      admin: {
        description:
          "Full per-assistant breakdown. Shape: Array<{ source, assistant, sessions, users, conversions, conversionValue, engagedSessions, topLandingPages: Array<{ path, sessions, conversions }> }>",
      },
    },
    {
      name: "shareBySource",
      type: "json",
      admin: {
        description: "Share of AI referrals per assistant. Shape: Record<string, number> (values 0-1)",
      },
    },
    {
      name: "fetchedAt",
      type: "text",
      required: true,
      admin: {
        description: "ISO timestamp of when the snapshot was pulled from GA4",
      },
    },
  ],
};
