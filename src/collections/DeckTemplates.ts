import type {
  CollectionConfig,
  CollectionBeforeChangeHook,
  CollectionAfterChangeHook,
} from "payload";
import { logActivity } from "../lib/activity-log";
import { canAccess, adminOnlyDelete, hideUnlessFeature } from "../lib/access";
import { getTemplate } from "../lib/decks/registry";

const validateTemplateSlug: CollectionBeforeChangeHook = async ({ data }) => {
  if (data?.templateSlug && !getTemplate(data.templateSlug)) {
    throw new Error(
      `Unknown deck templateSlug "${data.templateSlug}". Register it in src/lib/decks/registry.ts first.`,
    );
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
      title: `Deck template created: ${doc.name}`,
      user: req.user?.id,
    });
  }
  return doc;
};

/**
 * DeckTemplates Collection
 *
 * Reusable slide-deck templates (Google Ads audits, stakeholder recaps, etc.).
 * Each entry maps to a registered template in src/lib/decks/registry.ts via
 * `templateSlug`.
 */
export const DeckTemplates: CollectionConfig = {
  slug: "deck-templates",
  labels: {
    singular: "Deck Template",
    plural: "Deck Templates",
  },
  admin: {
    useAsTitle: "name",
    group: "Clients",
    description:
      "Reusable slide-deck templates (Google Ads audits, stakeholder recaps, etc.)",
    hidden: hideUnlessFeature("deck-templates"),
  },
  access: {
    read: canAccess("deck-templates"),
    create: canAccess("deck-templates"),
    update: canAccess("deck-templates"),
    delete: adminOnlyDelete,
  },
  defaultSort: "name",
  hooks: {
    beforeChange: [validateTemplateSlug],
    afterChange: [logTemplateCreated],
  },
  fields: [
    {
      name: "templateSlug",
      type: "text",
      required: true,
      unique: true,
      admin: {
        description:
          'Must match a registered template in src/lib/decks/registry.ts (e.g. "google-ads-audit-15-slide").',
      },
    },
    {
      name: "name",
      type: "text",
      required: true,
    },
    {
      name: "description",
      type: "textarea",
    },
    {
      name: "category",
      type: "select",
      required: true,
      options: [
        { label: "Stakeholder recap", value: "stakeholder-recap" },
        { label: "Google Ads audit", value: "google-ads-audit" },
        { label: "CRO audit", value: "cro-audit" },
        { label: "SEO audit", value: "seo-audit" },
        { label: "Custom", value: "custom" },
      ],
    },
    {
      name: "previewImage",
      type: "upload",
      relationTo: "media",
      admin: {
        description: "Thumbnail for the CMS admin picker",
      },
    },
    {
      name: "previewUrl",
      type: "ui",
      admin: {
        components: {
          Field: "/components/DeckTemplatePreviewLink",
        },
      },
    },
    {
      name: "usage",
      type: "ui",
      admin: {
        components: {
          Field: "/components/DeckTemplateUsageCount",
        },
      },
    },
    {
      name: "isActive",
      type: "checkbox",
      defaultValue: true,
      admin: {
        position: "sidebar",
      },
    },
    {
      name: "isDefault",
      type: "checkbox",
      defaultValue: false,
      admin: {
        position: "sidebar",
        description: "Default template for this category",
      },
    },
    {
      name: "notes",
      type: "textarea",
      admin: {
        description: "Internal-only notes about this template",
      },
    },
  ],
};
