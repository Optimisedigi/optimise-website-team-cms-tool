import type { CollectionConfig, CollectionBeforeChangeHook } from "payload";
import { hasValidApiKey } from "./api-key-access";
import { logActivity } from "../lib/activity-log";
import { canAccessOrApiKey, adminOnlyDelete } from "../lib/access";

/**
 * Denormalise the linked client's name onto the snapshot so the admin list view
 * (and any external consumer) can render a human-readable title without an extra
 * lookup. Mirrors the pattern used by AiVisibilitySnapshots and other rows the
 * Growth Tools service pushes in.
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

export const SerpDisplacementSnapshots: CollectionConfig = {
  slug: "serp-displacement-snapshots",
  labels: {
    singular: "SERP Displacement",
    plural: "SERP Displacement",
  },
  admin: {
    useAsTitle: "keyword",
    defaultColumns: [
      "clientName",
      "keyword",
      "capturedAt",
      "hasAiOverview",
      "organicPosition",
    ],
    group: "Reports",
    description:
      "Daily SERP layout snapshots per monitored keyword — tracks AI Overview appearance, SERP features, organic position, pixel offset, and paid position. Pushed by Growth Tools' SERP Displacement Monitor.",
    // Hidden from the sidebar entirely. Growth Tools push integration is not
    // yet wired up, so the table is empty and clutters the nav. Routes still
    // work for programmatic access (OptiMate's get_serp_displacement tool
    // reads via payload.find with overrideAccess: true).
    hidden: true,
  },
  hooks: {
    beforeChange: [denormaliseClientName],
    afterChange: [
      async ({ doc, operation, req }) => {
        if (operation === "create") {
          logActivity(req.payload, {
            type: "serp_displacement_snapshot_created",
            title: `SERP snapshot: ${doc.clientName || "client"} — ${doc.keyword}`,
            description: `AIO: ${doc.hasAiOverview ? "yes" : "no"} · organic pos: ${doc.organicPosition ?? "n/a"}`,
            user: req.user?.id,
            client: typeof doc.client === "object" ? doc.client?.id : doc.client,
          }).catch(() => {});
        }
      },
    ],
  },
  access: {
    read: canAccessOrApiKey("serp-displacement-snapshots", hasValidApiKey),
    update: canAccessOrApiKey("serp-displacement-snapshots", hasValidApiKey),
    delete: adminOnlyDelete,
    create: canAccessOrApiKey("serp-displacement-snapshots", hasValidApiKey),
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
      type: "row",
      fields: [
        {
          name: "keyword",
          type: "text",
          required: true,
          admin: {
            width: "50%",
            description: "The search query that was captured",
          },
        },
        {
          name: "location",
          type: "text",
          required: true,
          admin: {
            width: "25%",
            description: 'Geo target (e.g. "au:sydney")',
          },
        },
        {
          name: "device",
          type: "select",
          required: true,
          options: [
            { label: "Desktop", value: "desktop" },
            { label: "Mobile", value: "mobile" },
          ],
          admin: { width: "25%" },
        },
      ],
    },
    {
      name: "capturedAt",
      type: "date",
      required: true,
      admin: {
        description: "When the SERP was captured",
      },
    },

    // AI Overview
    {
      type: "row",
      fields: [
        {
          name: "hasAiOverview",
          type: "checkbox",
          defaultValue: false,
          admin: {
            width: "33%",
            description: "AI Overview block present on the SERP",
          },
        },
        {
          name: "aiOverviewExpanded",
          type: "checkbox",
          admin: {
            width: "33%",
            description: "AIO was rendered expanded (null = unknown)",
          },
        },
        {
          name: "aiOverviewCitesDomain",
          type: "checkbox",
          admin: {
            width: "33%",
            description: "Client domain is cited in AIO references",
          },
        },
      ],
    },
    {
      name: "aiOverviewReferences",
      type: "json",
      admin: {
        description:
          "AIO reference list. Shape: Array<{ domain, link, title }>",
      },
    },

    // Other SERP features
    {
      type: "row",
      fields: [
        {
          name: "hasAnswerBox",
          type: "checkbox",
          defaultValue: false,
          admin: { width: "25%" },
        },
        {
          name: "hasKnowledgeGraph",
          type: "checkbox",
          defaultValue: false,
          admin: { width: "25%" },
        },
        {
          name: "hasShopping",
          type: "checkbox",
          defaultValue: false,
          admin: { width: "25%" },
        },
        {
          name: "hasLocalPack",
          type: "checkbox",
          defaultValue: false,
          admin: { width: "25%" },
        },
      ],
    },

    // Ads
    {
      type: "row",
      fields: [
        {
          name: "topAdCount",
          type: "number",
          defaultValue: 0,
          admin: {
            width: "50%",
            description: "Sponsored ads above the organic results",
          },
        },
        {
          name: "bottomAdCount",
          type: "number",
          defaultValue: 0,
          admin: {
            width: "50%",
            description: "Sponsored ads below the organic results",
          },
        },
      ],
    },

    // Organic
    {
      type: "row",
      fields: [
        {
          name: "organicPosition",
          type: "number",
          admin: {
            width: "50%",
            description: "Client domain's organic position (null = not in top 100)",
          },
        },
        {
          name: "organicPixelOffset",
          type: "number",
          admin: {
            width: "50%",
            description:
              "Estimated vertical pixel offset of the client's organic listing from the top of the SERP (heuristic).",
          },
        },
      ],
    },

    // Paid
    {
      type: "row",
      fields: [
        {
          name: "paidPosition",
          type: "number",
          admin: {
            width: "33%",
            description: "Average paid position from Google Ads",
          },
        },
        {
          name: "paidAbsoluteTopIs",
          type: "number",
          admin: {
            width: "33%",
            description: "Absolute top impression share (0-1)",
          },
        },
        {
          name: "paidTopIs",
          type: "number",
          admin: {
            width: "33%",
            description: "Top impression share (0-1)",
          },
        },
      ],
    },
  ],
};
