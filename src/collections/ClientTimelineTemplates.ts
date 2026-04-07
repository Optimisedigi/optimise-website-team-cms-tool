import type {
  CollectionConfig,
  CollectionBeforeChangeHook,
  CollectionAfterChangeHook,
} from "payload";
import { logActivity } from "../lib/activity-log";

const generateUniqueSlug: CollectionBeforeChangeHook = async ({
  data,
  operation,
  req,
}) => {
  if (data && operation === "create" && data.name && !data.slug) {
    const baseSlug = data.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    let slug = baseSlug;
    let suffix = 0;

    while (true) {
      const existing = await req.payload.find({
        collection: "client-timeline-templates" as any,
        where: { slug: { equals: slug } },
        limit: 1,
      });
      if (existing.totalDocs === 0) break;
      suffix++;
      slug = `${baseSlug}-${suffix}`;
    }

    data.slug = slug;
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

const logTemplateCreated: CollectionAfterChangeHook = async ({
  doc,
  operation,
  req,
}) => {
  if (operation === "create") {
    await logActivity(req.payload, {
      type: "template_created",
      title: `Timeline template created: ${doc.name}`,
      user: req.user?.id,
    });
  }
  return doc;
};

/**
 * ClientTimelineTemplates Collection
 *
 * Reusable client-facing timeline templates. Each template defines phases
 * and items shown to the client, simplified from the full internal
 * client process. Templates are copied into ClientTimelines when a
 * timeline is started for a client.
 */
export const ClientTimelineTemplates: CollectionConfig = {
  slug: "client-timeline-templates",
  labels: {
    singular: "Timeline Template",
    plural: "Timeline Templates",
  },
  admin: {
    useAsTitle: "name",
    description:
      "Client-facing timeline templates — simplified phases shown to clients. Access via the Templates tab inside a Client Timeline.",
  },
  access: {
    read: ({ req }) => !!req.user,
    create: ({ req }) => !!req.user,
    update: ({ req }) => !!req.user,
    delete: ({ req }) => req.user?.role === "admin",
  },
  defaultSort: "name",
  hooks: {
    beforeChange: [generateUniqueSlug, normalizeOrders],
    afterChange: [logTemplateCreated],
  },
  fields: [
    {
      name: "name",
      type: "text",
      required: true,
      admin: {
        description: 'Template name, e.g. "Google Ads 90-Day Onboarding"',
      },
    },
    {
      name: "slug",
      type: "text",
      required: true,
      unique: true,
      admin: {
        description: "URL-friendly identifier (auto-generated from name)",
      },
    },
    {
      name: "serviceType",
      type: "select",
      required: true,
      admin: {
        description: "Which service this timeline is for",
      },
      options: [
        { label: "Google Ads", value: "google_ads" },
        { label: "SEO", value: "seo" },
        { label: "Meta Ads", value: "meta_ads" },
        { label: "CRO", value: "cro" },
        { label: "General", value: "general" },
      ],
    },
    {
      name: "durationDays",
      type: "number",
      required: true,
      defaultValue: 90,
      min: 1,
      max: 365,
      admin: {
        description: "Total timeline duration in days (e.g. 90)",
      },
    },
    {
      name: "description",
      type: "textarea",
      admin: {
        description: "Brief overview shown at the top of the client timeline",
      },
    },
    {
      name: "isDefault",
      type: "checkbox",
      defaultValue: false,
      admin: {
        position: "sidebar",
        description: "Default template for its service type",
      },
    },
    {
      name: "isActive",
      type: "checkbox",
      defaultValue: true,
      admin: {
        position: "sidebar",
        description: "Enable or disable this template",
      },
    },
    {
      name: "phases",
      type: "array",
      admin: {
        description: "Ordered phases of the client-facing timeline",
      },
      fields: [
        {
          name: "phaseName",
          type: "text",
          required: true,
          admin: {
            description: 'Phase name, e.g. "Quick Wins"',
          },
        },
        {
          name: "phaseOrder",
          type: "number",
          required: true,
          min: 1,
          admin: {
            description: "Display order (1 = first phase)",
          },
        },
        {
          name: "weekRange",
          type: "text",
          admin: {
            description: 'e.g. "Weeks 1–2", "Beyond Week 5"',
          },
        },
        {
          name: "phaseDescription",
          type: "textarea",
          admin: {
            description: "What this phase covers — shown to the client",
          },
        },
        {
          name: "items",
          type: "array",
          admin: {
            description: "Tasks and milestones within this phase",
          },
          fields: [
            {
              name: "itemName",
              type: "text",
              required: true,
              admin: {
                description: 'The task or milestone, e.g. "Fix form tracking"',
              },
            },
            {
              name: "itemOrder",
              type: "number",
              required: true,
              min: 1,
              admin: {
                description: "Display order within the phase",
              },
            },
            {
              name: "itemDescription",
              type: "textarea",
              admin: {
                description: "Additional detail (optional, shown to client)",
              },
            },
            {
              name: "requiresApproval",
              type: "checkbox",
              defaultValue: false,
              admin: {
                description: 'Show "Your approval needed" badge for this item',
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
};
