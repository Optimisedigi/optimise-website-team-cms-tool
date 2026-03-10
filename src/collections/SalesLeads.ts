import type { CollectionConfig } from "payload";
import { logActivity } from "../lib/activity-log";

/**
 * SalesLeads Collection
 *
 * Tracks every lead through the sales funnel from initial contact
 * to active client. Each lead has a channel (referral, website, BNI,
 * advertising, cold outreach) and a stage that progresses through
 * the pipeline.
 */
export const SalesLeads: CollectionConfig = {
  slug: "sales-leads",
  labels: {
    singular: "Sales Lead",
    plural: "Sales Leads",
  },
  admin: {
    useAsTitle: "businessName",
    group: "Clients",
    description: "Track leads through the sales funnel by channel",
    defaultColumns: [
      "businessName",
      "channel",
      "stage",
      "estimatedValue",
      "contactName",
      "updatedAt",
    ],
  },
  disableDuplicate: false,
  access: {
    read: ({ req }) => !!req.user,
    create: ({ req }) => !!req.user,
    update: ({ req }) => !!req.user,
    delete: ({ req }) => req.user?.role === "admin",
  },
  defaultSort: "-updatedAt",
  hooks: {
    beforeChange: [
      async ({ data, originalDoc, operation }) => {
        if (!data) return data;

        // Auto-record stage transitions in history
        if (
          operation === "update" &&
          originalDoc &&
          data.stage &&
          data.stage !== originalDoc.stage
        ) {
          const historyEntry = {
            fromStage: originalDoc.stage,
            toStage: data.stage,
            transitionDate: new Date().toISOString(),
          };
          const existing = Array.isArray(originalDoc.stageHistory)
            ? originalDoc.stageHistory
            : [];
          data.stageHistory = [historyEntry, ...existing];
        }

        return data;
      },
    ],
    afterChange: [
      async ({ doc, operation, req, previousDoc }) => {
        if (operation === "create") {
          logActivity(req.payload, {
            type: "lead_created",
            title: `New lead: ${doc.businessName}`,
            description: `Channel: ${doc.channel} | Stage: ${doc.stage}`,
            user: req.user?.id,
          }).catch(() => {});
        }

        if (
          operation === "update" &&
          previousDoc &&
          doc.stage !== previousDoc.stage
        ) {
          logActivity(req.payload, {
            type: "lead_stage_changed",
            title: `Lead progressed: ${doc.businessName}`,
            description: `${previousDoc.stage} → ${doc.stage}`,
            user: req.user?.id,
          }).catch(() => {});
        }
      },
    ],
  },
  fields: [
    {
      type: "tabs",
      tabs: [
        {
          label: "Lead Details",
          fields: [
            {
              type: "row",
              fields: [
                {
                  name: "businessName",
                  type: "text",
                  required: true,
                  admin: {
                    description: "Business or prospect name",
                  },
                },
                {
                  name: "websiteUrl",
                  type: "text",
                  admin: {
                    description: "Business website URL",
                  },
                },
              ],
            },
            {
              type: "row",
              fields: [
                {
                  name: "contactName",
                  type: "text",
                  admin: {
                    description: "Primary contact name",
                  },
                },
                {
                  name: "contactEmail",
                  type: "email",
                  admin: {
                    description: "Contact email",
                  },
                },
                {
                  name: "contactPhone",
                  type: "text",
                  admin: {
                    description: "Contact phone",
                  },
                },
              ],
            },
            {
              type: "row",
              fields: [
                {
                  name: "channel",
                  type: "select",
                  required: true,
                  admin: {
                    description: "How this lead was acquired",
                  },
                  options: [
                    // Online channels (auto-attributed from website forms)
                    { label: "Organic Search", value: "organic_search" },
                    { label: "Paid Search (Google Ads)", value: "paid_search" },
                    { label: "Paid Social (Meta Ads)", value: "paid_social" },
                    { label: "Organic Social", value: "organic_social" },
                    { label: "Website (Other)", value: "website_other" },
                    // Offline / manual channels
                    { label: "Referral", value: "referral" },
                    { label: "Referral Partner", value: "referral_partner" },
                    { label: "BNI Referral", value: "bni_referral" },
                    { label: "Cold Outreach", value: "cold_outreach" },
                  ],
                },
                {
                  name: "channelDetail",
                  type: "text",
                  admin: {
                    description:
                      "Extra detail (e.g. referrer name, ad campaign, BNI chapter)",
                  },
                },
              ],
            },
            {
              type: "row",
              fields: [
                {
                  name: "estimatedValue",
                  type: "number",
                  min: 0,
                  admin: {
                    description: "Estimated monthly retainer value ($)",
                    step: 1,
                  },
                },
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
              ],
            },
            {
              name: "services",
              type: "select",
              hasMany: true,
              admin: {
                description: "Services the lead is interested in",
              },
              options: [
                { label: "Google Ads", value: "google_ads" },
                { label: "SEO", value: "seo" },
                { label: "Meta Ads", value: "meta_ads" },
                { label: "CRO", value: "cro" },
                { label: "Website Build", value: "website_build" },
                { label: "AI Automations", value: "ai_automations" },
                { label: "Content Marketing", value: "content" },
                { label: "Full Service", value: "full_service" },
              ],
            },
            {
              name: "notes",
              type: "textarea",
              admin: {
                description: "Internal notes about this lead",
              },
            },
            {
              name: "lostReason",
              type: "select",
              admin: {
                description: "Why this lead was lost",
                condition: (data: any) => data?.stage === "lost",
              },
              options: [
                { label: "Too Expensive", value: "price" },
                { label: "Chose Competitor", value: "competitor" },
                { label: "Not Ready", value: "not_ready" },
                { label: "No Response", value: "no_response" },
                { label: "Bad Fit", value: "bad_fit" },
                { label: "Other", value: "other" },
              ],
            },
            {
              name: "lostNotes",
              type: "textarea",
              admin: {
                description: "Additional context on why this lead was lost",
                condition: (data: any) => data?.stage === "lost",
              },
            },
            {
              name: "startProcess",
              type: "ui",
              admin: {
                components: {
                  Field: "./components/StartProcessFromLeadButton",
                },
                condition: (data: any) => !!data?.id,
              },
            },
            {
              name: "linkedProcesses",
              type: "ui",
              admin: {
                components: {
                  Field: "./components/LinkedProcesses",
                },
                condition: (data: any) => !!data?.id,
              },
            },
          ],
        },
        {
          label: "Attribution",
          fields: [
            {
              type: "row",
              fields: [
                {
                  name: "utmSource",
                  type: "text",
                  admin: {
                    readOnly: true,
                    description: "UTM source (auto-captured)",
                  },
                },
                {
                  name: "utmMedium",
                  type: "text",
                  admin: {
                    readOnly: true,
                    description: "UTM medium (auto-captured)",
                  },
                },
              ],
            },
            {
              type: "row",
              fields: [
                {
                  name: "utmCampaign",
                  type: "text",
                  admin: {
                    readOnly: true,
                    description: "UTM campaign (auto-captured)",
                  },
                },
                {
                  name: "utmTerm",
                  type: "text",
                  admin: {
                    readOnly: true,
                    description: "UTM term / keyword (auto-captured)",
                  },
                },
              ],
            },
            {
              type: "row",
              fields: [
                {
                  name: "gclid",
                  type: "text",
                  admin: {
                    readOnly: true,
                    description: "Google Ads click ID",
                  },
                },
                {
                  name: "fbclid",
                  type: "text",
                  admin: {
                    readOnly: true,
                    description: "Meta/Facebook click ID",
                  },
                },
              ],
            },
            {
              type: "row",
              fields: [
                {
                  name: "landingPage",
                  type: "text",
                  admin: {
                    readOnly: true,
                    description: "First page the lead landed on",
                  },
                },
                {
                  name: "referrerUrl",
                  type: "text",
                  admin: {
                    readOnly: true,
                    description: "HTTP referrer URL",
                  },
                },
              ],
            },
            {
              name: "leadSource",
              type: "select",
              admin: {
                readOnly: true,
                description: "How this lead was created",
              },
              options: [
                { label: "Website Form", value: "website_form" },
                { label: "Growth Tool Audit", value: "growth_tool" },
                { label: "Manual Entry", value: "manual" },
              ],
            },
            {
              name: "heardAbout",
              type: "text",
              admin: {
                readOnly: true,
                description:
                  "Self-reported: where they heard about us (from contact form)",
              },
            },
          ],
        },
        {
          label: "Linked Records",
          fields: [
            {
              name: "proposal",
              type: "relationship",
              relationTo: "client-proposals",
              admin: {
                description: "Linked proposal (if created)",
              },
            },
            {
              name: "contract",
              type: "relationship",
              relationTo: "contracts",
              admin: {
                description: "Linked contract (if sent)",
              },
            },
            {
              name: "client",
              type: "relationship",
              relationTo: "clients",
              admin: {
                description: "Linked client (if converted)",
              },
            },
          ],
        },
        {
          label: "History",
          fields: [
            {
              name: "stageHistory",
              type: "array",
              admin: {
                readOnly: true,
                description: "Automatic log of stage transitions",
              },
              fields: [
                { name: "fromStage", type: "text" },
                { name: "toStage", type: "text" },
                { name: "transitionDate", type: "date" },
              ],
            },
          ],
        },
      ],
    },
    // Sidebar fields
    {
      name: "stage",
      type: "select",
      required: true,
      defaultValue: "new_lead",
      admin: {
        position: "sidebar",
        description: "Current funnel stage",
      },
      options: [
        { label: "New Lead", value: "new_lead" },
        { label: "Contacted", value: "contacted" },
        { label: "Meeting Booked", value: "meeting_booked" },
        { label: "Proposal Sent", value: "proposal_sent" },
        { label: "Contract Sent", value: "contract_sent" },
        { label: "Client (Won)", value: "client" },
        { label: "Lost", value: "lost" },
      ],
    },
    {
      name: "firstContactDate",
      type: "date",
      admin: {
        position: "sidebar",
        description: "When this lead first came in",
      },
      hooks: {
        beforeChange: [
          ({ value, operation }) => {
            if (operation === "create" && !value) {
              return new Date().toISOString();
            }
            return value;
          },
        ],
      },
    },
    {
      name: "expectedCloseDate",
      type: "date",
      admin: {
        position: "sidebar",
        description: "Expected close date",
      },
    },
    {
      name: "priority",
      type: "select",
      defaultValue: "medium",
      admin: {
        position: "sidebar",
        description: "Lead priority",
      },
      options: [
        { label: "High", value: "high" },
        { label: "Medium", value: "medium" },
        { label: "Low", value: "low" },
      ],
    },
  ],
};
