import type { CollectionConfig } from "payload";
import { logActivity } from "../lib/activity-log";
import { canAccess, adminOnlyDelete, hideUnlessFeature } from "../lib/access";

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
    hidden: hideUnlessFeature("sales-leads"),
  },
  disableDuplicate: false,
  access: {
    read: canAccess("sales-leads"),
    create: canAccess("sales-leads"),
    update: canAccess("sales-leads"),
    delete: adminOnlyDelete,
  },
  defaultSort: "-updatedAt",
  hooks: {
    // NOTE: stage-history recording used to live in beforeChange, which
    // mutated `data.stageHistory` with a new array row mid-save. Payload's
    // admin form would then diff its own payload against the response and
    // see a new array entry with a server-generated id it never sent —
    // leaving the form perpetually "dirty" and triggering the
    // "Leave without saving?" prompt on every save. We now defer that
    // write to afterChange via setTimeout (mirrors the existing
    // proposal-sync pattern below) so the user's save POST/response cycle
    // touches only the fields they actually edited.
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

          // Deferred stage-history write. Guarded by req.context.skipStageHistory
          // so our own recursive update (which triggers afterChange again)
          // short-circuits instead of looping. Same fire-and-forget pattern as
          // the proposal sync below — acceptable failure mode: if the process
          // dies in the 500ms gap the stage is recorded but the history row
          // isn't (history is UI nicety, not business logic).
          const ctx = req.context as { skipStageHistory?: boolean } | undefined;
          if (!ctx?.skipStageHistory) {
            const historyEntry = {
              fromStage: previousDoc.stage,
              toStage: doc.stage,
              transitionDate: new Date().toISOString(),
            };
            const existing = Array.isArray((doc as any).stageHistory)
              ? ((doc as any).stageHistory as Array<Record<string, unknown>>)
              : [];
            const syncPayload = req.payload;
            const leadId = doc.id;
            setTimeout(async () => {
              try {
                await syncPayload.update({
                  collection: "sales-leads",
                  id: leadId,
                  data: { stageHistory: [historyEntry, ...existing] } as any,
                  overrideAccess: true,
                  context: { skipStageHistory: true },
                });
              } catch (err) {
                // Best-effort: history is a UI nicety, not used for business logic.
                req.payload.logger?.warn?.(
                  `[sales-leads] deferred stageHistory write failed for lead ${leadId}: ${err instanceof Error ? err.message : String(err)}`,
                );
              }
            }, 500);
          }

          // Sync: when lead moves to "client", update linked proposal status
          // Fire-and-forget to avoid SQLite lock conflicts with the current save
          if (doc.stage === "client" && doc.proposal) {
            const proposalId = typeof doc.proposal === "object" ? (doc.proposal as any).id : doc.proposal;
            if (proposalId) {
              const syncPayload = req.payload;
              setTimeout(async () => {
                try {
                  const proposal = await syncPayload.findByID({
                    collection: "client-proposals",
                    id: proposalId,
                    overrideAccess: true,
                  });
                  if ((proposal as any).proposalStatus !== "client") {
                    await syncPayload.update({
                      collection: "client-proposals",
                      id: proposalId,
                      data: { proposalStatus: "client" } as any,
                      overrideAccess: true,
                    });
                  }
                } catch {
                  // Best effort — proposal may not exist or was already deleted
                }
              }, 500);
            }
          }
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
                    components: {
                      Cell: "./components/list-cells/TitleAvatarCell",
                    },
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
        description: "Current funnel stage",
        components: {
          Cell: "./components/list-cells/StatusPillCell",
        },
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
        description: "Expected close date",
      },
    },
    {
      name: "priority",
      type: "select",
      defaultValue: "medium",
      admin: {
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
