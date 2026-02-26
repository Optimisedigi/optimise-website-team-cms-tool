import type {
  CollectionConfig,
  CollectionAfterChangeHook,
  CollectionBeforeChangeHook,
} from "payload";
import crypto from "crypto";
import { hasValidApiKey } from "./api-key-access";
import { logActivity } from "../lib/activity-log";

const autoGenerateSlug: CollectionBeforeChangeHook = async ({
  data,
  operation,
  req,
}) => {
  if (data && operation === "create" && data.businessName && !data.slug) {
    const baseSlug = data.businessName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    let slug = baseSlug;
    let suffix = 0;

    while (true) {
      const existing = await req.payload.find({
        collection: "google-ads-audits",
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

const generateUniquePin = async (payload: any): Promise<string> => {
  const maxAttempts = 20;
  for (let i = 0; i < maxAttempts; i++) {
    const pin = String(Math.floor(1000 + Math.random() * 9000));
    const existing = await payload.find({
      collection: "google-ads-audits",
      where: { presentationPin: { equals: pin } },
      limit: 1,
    });
    if (existing.totalDocs === 0) return pin;
  }
  // Fall back to random hex if all PINs are taken
  return crypto.randomBytes(2).toString("hex").toUpperCase();
};

const createProposalHook: CollectionAfterChangeHook = async ({
  doc,
  req,
  previousDoc,
}) => {
  if (doc.createProposal && !previousDoc?.createProposal) {
    const payload = req.payload;

    try {
      const scoreNote = doc.overallScore != null ? ` (score: ${doc.overallScore}/100)` : "";

      const proposal = await payload.create({
        collection: "client-proposals" as any,
        data: {
          businessName: doc.businessName,
          websiteUrl: doc.websiteUrl || "",
          businessType: doc.businessType,
          contactEmail: doc.contactEmail,
          googleAdsAudit: doc.id,
          proposalStatus: "draft",
          notes: `Created from Google Ads audit${scoreNote}`,
        },
      });

      // Link the audit back to the new proposal and reset the toggle
      await payload.update({
        collection: "google-ads-audits",
        id: doc.id,
        data: {
          proposal: proposal.id,
          createProposal: false,
        },
      });

      logActivity(payload, {
        type: "google_ads_proposal_created",
        title: `Proposal created from audit: ${doc.businessName}`,
        description: `Customer ID: ${doc.customerId || "not set"}`,
        user: req.user?.id,
      }).catch(() => {});
    } catch (error) {
      // Reset the toggle so the user can retry
      await payload.update({
        collection: "google-ads-audits",
        id: doc.id,
        data: { createProposal: false },
      });
      payload.logger.error(
        `Failed to create proposal from audit "${doc.businessName}": ${error}`,
      );
      throw new Error(
        `Failed to create proposal: a proposal for "${doc.businessName}" may already exist.`,
      );
    }
  }
  return doc;
};

export const GoogleAdsAudits: CollectionConfig = {
  slug: "google-ads-audits",
  labels: {
    singular: "Google Ads Audit",
    plural: "Google Ads Audits",
  },
  admin: {
    useAsTitle: "businessName",
    group: "Audits",
    defaultColumns: ["businessName", "overallScore", "auditStatus", "createdAt"],
    description: "Google Ads audit pipeline. Requires client to grant access to the Optimise Digital MCC (manager account) before the audit can pull data.",
  },
  hooks: {
    beforeChange: [autoGenerateSlug],
    afterChange: [
      createProposalHook,
      async ({ doc, operation, req }) => {
        if (operation === "create") {
          logActivity(req.payload, {
            type: "google_ads_audit_created",
            title: `Google Ads audit: ${doc.businessName || doc.slug}`,
            description: `Customer ID: ${doc.customerId || "not set"}`,
            user: req.user?.id,
          }).catch(() => {});
        }
      },
    ],
  },
  access: {
    read: ({ req }) => !!req.user || hasValidApiKey(req),
    update: ({ req }) => !!req.user || hasValidApiKey(req),
    delete: ({ req }) => {
      if (!req.user) return false;
      return req.user.role === "admin";
    },
    create: ({ req }) => !!req.user || hasValidApiKey(req),
  },
  fields: [
    {
      type: "tabs",
      tabs: [
        // ── Tab 1: Client Info ──
        {
          label: "Client Info",
          fields: [
            {
              name: "businessName",
              type: "text",
              required: true,
              admin: {
                description: "Client business name",
              },
            },
            {
              name: "slug",
              type: "text",
              required: true,
              unique: true,
              admin: {
                description: "URL-friendly identifier (auto-generated from business name)",
              },
            },
            {
              type: "row",
              fields: [
                {
                  name: "customerId",
                  type: "text",
                  required: true,
                  admin: {
                    description: "Google Ads customer ID (e.g. 955-493-5739). Client must grant access to the Optimise Digital MCC before running the audit.",
                  },
                },
                {
                  name: "websiteUrl",
                  type: "text",
                  admin: {
                    description: "Client website URL",
                  },
                },
              ],
            },
            {
              type: "row",
              fields: [
                {
                  name: "businessType",
                  type: "select",
                  admin: {
                    description: "Type of business",
                  },
                  options: [
                    { label: "Trades & Home Services", value: "trades" },
                    { label: "Professional Services", value: "services" },
                    { label: "E-commerce / Retail", value: "ecommerce" },
                    { label: "Healthcare", value: "healthcare" },
                    { label: "Hospitality & Food", value: "hospitality" },
                    { label: "Real Estate", value: "realestate" },
                    { label: "Education & Training", value: "education" },
                    { label: "SaaS / Technology", value: "saas" },
                    { label: "Other", value: "other" },
                  ],
                },
                {
                  name: "monthlySpend",
                  type: "number",
                  min: 0,
                  admin: {
                    description: "Client-stated monthly ad spend ($)",
                    step: 1,
                  },
                },
              ],
            },
            {
              name: "contactEmail",
              type: "email",
              admin: {
                description: "Client contact email (for sending audit email)",
              },
            },
            {
              name: "conversionObjectives",
              type: "array",
              maxRows: 10,
              admin: {
                description: "What the client considers a conversion (forms, calls, purchases, etc.)",
              },
              fields: [
                {
                  name: "objective",
                  type: "text",
                  required: true,
                },
              ],
            },
            {
              name: "brandTerms",
              type: "array",
              maxRows: 20,
              admin: {
                description: "Brand terms for brand/generic campaign classification",
              },
              fields: [
                {
                  name: "term",
                  type: "text",
                  required: true,
                },
              ],
            },
            {
              name: "notes",
              type: "textarea",
              admin: {
                description: "Internal team notes about this client",
              },
            },
          ],
        },

        // ── Tab 2: Audit Control ──
        {
          label: "Audit Control",
          fields: [
            {
              name: "runAudit",
              type: "ui",
              admin: {
                components: {
                  Field: "./components/RunGoogleAdsAuditButton",
                },
              },
            },
            {
              name: "auditStatus",
              type: "select",
              admin: {
                readOnly: true,
                description: "Current audit pipeline status",
              },
              options: [
                { label: "Pending", value: "pending" },
                { label: "Running", value: "running" },
                { label: "Completed", value: "completed" },
                { label: "Failed", value: "failed" },
              ],
            },
            {
              name: "auditProgress",
              type: "text",
              admin: {
                readOnly: true,
                description: "Current stage (e.g. 'Pulling data|25')",
              },
            },
            {
              name: "auditStartedAt",
              type: "date",
              admin: {
                readOnly: true,
                description: "When audit was last kicked off",
              },
            },
            {
              name: "auditCompletedAt",
              type: "date",
              admin: {
                readOnly: true,
                description: "When audit finished",
              },
            },
            {
              name: "auditError",
              type: "textarea",
              admin: {
                readOnly: true,
                description: "Error details if audit failed",
              },
            },
          ],
        },

        // ── Tab 3: Audit Results ──
        {
          label: "Audit Results",
          fields: [
            {
              name: "auditPreview",
              type: "ui",
              admin: {
                components: {
                  Field: "./components/GoogleAdsAuditPreview",
                },
              },
            },
            {
              name: "overallScore",
              type: "number",
              min: 0,
              max: 100,
              admin: {
                readOnly: true,
                description: "Overall audit score (0-100)",
              },
            },
            {
              name: "rawData",
              type: "json",
              admin: {
                description: "Raw API data from Google Ads (campaigns, keywords, search terms, etc.)",
              },
            },
            {
              name: "scoredReport",
              type: "json",
              admin: {
                description: "Full scored audit results (GoogleAdsAuditResults shape)",
              },
            },
            {
              name: "emailHtml",
              type: "textarea",
              admin: {
                readOnly: true,
                description: "Generated email HTML (preview in Presentation tab)",
              },
            },
            {
              name: "emailSentAt",
              type: "date",
              admin: {
                readOnly: true,
                description: "When the audit email was sent",
              },
            },
          ],
        },

        // ── Tab 4: Presentation ──
        {
          label: "Presentation",
          fields: [
            {
              name: "presentationPublished",
              type: "checkbox",
              defaultValue: false,
              admin: {
                description: "Toggle on to make the presentation publicly accessible (with PIN)",
              },
            },
            {
              name: "presentationData",
              type: "json",
              admin: {
                description: "AuditPresentation-shaped data for the presentation renderer. Editable by team before publishing.",
              },
            },
            {
              name: "teamNotes",
              type: "textarea",
              admin: {
                description: "Internal annotations before publishing (not shown to client)",
              },
            },
          ],
        },

        // ── Tab 5: History ──
        {
          label: "History",
          fields: [
            {
              name: "history",
              type: "array",
              admin: {
                readOnly: true,
                description: "Previous audit run summaries (auto-populated on re-run)",
              },
              fields: [
                {
                  name: "runDate",
                  type: "date",
                  required: true,
                },
                {
                  name: "overallScore",
                  type: "number",
                  min: 0,
                  max: 100,
                },
                {
                  name: "stepScores",
                  type: "json",
                  admin: {
                    description: "Step-by-step scores from this run",
                  },
                },
                {
                  name: "notes",
                  type: "text",
                  admin: {
                    description: "Auto-generated summary of changes since last run",
                  },
                },
              ],
            },
          ],
        },

        // ── Tab 6: Action Items (OptiMate prep) ──
        {
          label: "Action Items",
          fields: [
            {
              name: "actionItems",
              type: "array",
              admin: {
                description: "Populated from roadmap + quick wins. Future OptiMate agent reads these via API.",
              },
              fields: [
                {
                  name: "action",
                  type: "text",
                  required: true,
                  admin: {
                    description: "What needs to be done",
                  },
                },
                {
                  name: "priority",
                  type: "select",
                  defaultValue: "medium",
                  options: [
                    { label: "High", value: "high" },
                    { label: "Medium", value: "medium" },
                    { label: "Low", value: "low" },
                  ],
                },
                {
                  name: "status",
                  type: "select",
                  defaultValue: "pending",
                  options: [
                    { label: "Pending", value: "pending" },
                    { label: "In Progress", value: "in-progress" },
                    { label: "Done", value: "done" },
                  ],
                },
                {
                  name: "completedAt",
                  type: "date",
                  admin: {
                    condition: (data: any, siblingData: any) => siblingData?.status === "done",
                  },
                },
                {
                  name: "notes",
                  type: "textarea",
                  admin: {
                    description: "Implementation notes or OptiMate feedback",
                  },
                },
              ],
            },
          ],
        },
      ],
    },

    // ── Sidebar fields ──
    {
      name: "presentationPin",
      type: "text",
      unique: true,
      admin: {
        position: "sidebar",
        description: "4-digit PIN for presentation access (auto-generated)",
      },
      validate: async (value: string | null | undefined, { req, id }: any) => {
        if (!value) return true;
        if (!/^\d{4}$/.test(value)) return "PIN must be exactly 4 digits";
        try {
          const existing = await req.payload.find({
            collection: "google-ads-audits",
            where: {
              presentationPin: { equals: value },
              ...(id ? { id: { not_equals: id } } : {}),
            },
            limit: 1,
          });
          if (existing.totalDocs > 0) {
            return `PIN "${value}" is already in use by another audit (${existing.docs[0].businessName}).`;
          }
        } catch { /* skip check if payload not available */ }
        return true;
      },
      hooks: {
        beforeChange: [
          async ({ value, operation, req }) => {
            if (operation === "create" && !value) {
              return generateUniquePin(req.payload);
            }
            return value;
          },
        ],
      },
    },
    {
      name: "client",
      type: "relationship",
      relationTo: "clients",
      admin: {
        position: "sidebar",
        description: "Link to existing client (optional)",
      },
    },
    {
      name: "proposal",
      type: "relationship",
      relationTo: "client-proposals",
      admin: {
        position: "sidebar",
        description: "Link to client proposal (optional)",
      },
    },
    {
      name: "createProposal",
      type: "checkbox",
      defaultValue: false,
      admin: {
        position: "sidebar",
        description:
          "Toggle on and save to create a Client Proposal from this audit",
      },
    },
  ],
};
