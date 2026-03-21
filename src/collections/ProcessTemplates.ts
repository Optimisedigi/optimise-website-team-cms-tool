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
        collection: "process-templates" as any,
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
      if (phase.steps && Array.isArray(phase.steps)) {
        phase.steps.forEach((step: any, j: number) => {
          step.stepOrder = j + 1;
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
      title: `Process template created: ${doc.name}`,
      user: req.user?.id,
    });
  }
  return doc;
};

/**
 * ProcessTemplates Collection
 *
 * Reusable onboarding/sales process templates. Each template defines a
 * sequence of phases and steps for a specific retainer type, from lead
 * generation through to ongoing management.
 */
export const ProcessTemplates: CollectionConfig = {
  slug: "process-templates",
  labels: {
    singular: "Process Template",
    plural: "Process Templates",
  },
  admin: {
    useAsTitle: "name",
    group: "Clients",
    description:
      "Standardised client process templates from lead to ongoing management",
  },
  access: {
    read: ({ req }) => !!req.user,
    create: ({ req }) => !!req.user,
    update: ({ req }) => !!req.user,
    delete: ({ req }) => {
      if (!req.user) return false;
      return req.user.role === "admin";
    },
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
        description: 'Template name, e.g. "Google Ads Only", "Full Integration"',
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
      name: "retainerType",
      type: "select",
      required: true,
      admin: {
        description: "Which retainer type this template applies to",
      },
      options: [
        { label: "Google Ads Only", value: "google_ads_only" },
        { label: "Meta Ads Only", value: "meta_ads_only" },
        { label: "SEO Only", value: "seo_only" },
        { label: "Website Build Only", value: "website_build_only" },
        { label: "Website + SEO", value: "website_seo" },
        { label: "Website + SEO + Google Ads", value: "website_seo_google_ads" },
        { label: "Full Integration", value: "full_integration" },
        { label: "AI Automations", value: "ai_automations" },
        { label: "Custom", value: "custom" },
      ],
    },
    {
      name: "description",
      type: "textarea",
      admin: {
        description: "What this template covers",
      },
    },
    {
      name: "isDefault",
      type: "checkbox",
      defaultValue: false,
      admin: {
        position: "sidebar",
        description: "Default template for its retainer type",
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
        description: "Ordered phases of the process",
        components: {
          Field: "./components/ProcessTemplateWorksheet#default",
        },
      },
      fields: [
        {
          name: "phaseName",
          type: "text",
          required: true,
          admin: {
            description:
              'Phase name, e.g. "Lead Generation", "Qualification & Proposal"',
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
          name: "phaseDescription",
          type: "textarea",
          admin: {
            description: "What this phase covers",
          },
        },
        {
          name: "steps",
          type: "array",
          admin: {
            description: "Steps within this phase",
          },
          fields: [
            {
              name: "stepName",
              type: "text",
              required: true,
              admin: {
                description: 'Step name, e.g. "Send brief analysis"',
              },
            },
            {
              name: "stepOrder",
              type: "number",
              required: true,
              min: 1,
              admin: {
                description: "Display order within the phase",
              },
            },
            {
              name: "stepDescription",
              type: "textarea",
              admin: {
                description: "Detailed instructions for what to do",
              },
            },
            {
              name: "stepType",
              type: "select",
              admin: {
                description: "What kind of step this is",
              },
              options: [
                { label: "Action", value: "action" },
                { label: "Communication", value: "communication" },
                { label: "Decision", value: "decision" },
                { label: "Automated", value: "automated" },
                { label: "Milestone", value: "milestone" },
              ],
            },
            {
              name: "isAutomatable",
              type: "checkbox",
              defaultValue: false,
              admin: {
                description: "Can this step be automated in future?",
              },
            },
            {
              name: "automationNotes",
              type: "textarea",
              admin: {
                description: "What automation would look like",
                condition: (_data: any, siblingData: any) =>
                  siblingData?.isAutomatable,
              },
            },
            {
              name: "defaultAssignee",
              type: "select",
              admin: {
                description: "Who should handle this step by default",
              },
              options: [
                { label: "Account Manager", value: "account_manager" },
                { label: "Strategist", value: "strategist" },
                { label: "Developer", value: "developer" },
                { label: "Founder", value: "founder" },
                { label: "Client", value: "client" },
                { label: "System", value: "system" },
              ],
            },
            {
              name: "estimatedDuration",
              type: "text",
              admin: {
                description: 'e.g. "30 mins", "1 day", "1 week"',
              },
            },
            {
              name: "emailTemplateSubject",
              type: "text",
              admin: {
                description: "Pre-fill subject for email prep",
                condition: (_data: any, siblingData: any) =>
                  siblingData?.stepType === "communication",
              },
            },
            {
              name: "emailTemplateBody",
              type: "textarea",
              admin: {
                description:
                  "Draft email template (approval required before send)",
                condition: (_data: any, siblingData: any) =>
                  siblingData?.stepType === "communication",
              },
            },
            {
              name: "reminderDays",
              type: "number",
              min: 0,
              admin: {
                description:
                  "Days after previous step to trigger reminder (future use)",
              },
            },
            {
              name: "requiredBeforeNext",
              type: "checkbox",
              defaultValue: false,
              admin: {
                description: "Must complete before moving to next step",
              },
            },
          ],
        },
      ],
    },
  ],
};
