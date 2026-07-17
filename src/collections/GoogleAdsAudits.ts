import type {
  CollectionConfig,
  CollectionAfterChangeHook,
  CollectionBeforeChangeHook,
} from "payload";
import crypto from "crypto";
import { hasValidApiKey } from "./api-key-access";
import { logActivity } from "../lib/activity-log";
import { canAccessOrApiKey, adminOnlyDelete, hideUnlessFeature } from "../lib/access";
import { normalizeCampaignProposalKeywords } from "../lib/campaign-proposal-normalize";
import { GOOGLE_SEARCH_LANGUAGE_OPTIONS, SEARCH_LOCATION_OPTIONS, normalizeSearchLocation } from "../lib/search-target-options";

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
    singular: "Google Ads",
    plural: "Google Ads",
  },
  admin: {
    useAsTitle: "businessName",
    group: "Growth Tools",
    defaultColumns: ["businessName", "customerId", "auditStatus", "overallScore", "createdAt"],
    description: "Google Ads audit pipeline. Requires client to grant access to the Optimise Digital MCC (manager account) before the audit can pull data.",
    hidden: hideUnlessFeature("google-ads-audits"),
  },
  hooks: {
    afterRead: [
      // Strip large fields from API responses to keep document under Vercel's 4.5MB body limit.
      // rawData (full Google Ads API dump) is only written once during audit and never read back.
      // Without this, Payload sends the full document on every admin save, causing 413 errors.
      // Also sanitise empty-string select values from SQLite → null so the admin UI
      // doesn't send them back on save (Payload rejects "" as an invalid option).
      ({ doc }) => {
        if (doc?.rawData) {
          doc.rawData = null;
        }
        const selectFields = ["proposalBusinessType", "proposalConversionGoal", "proposalServiceRadius"];
        for (const field of selectFields) {
          if (doc?.[field] === "") doc[field] = null;
        }
        if (doc?.campaignProposal) {
          doc.campaignProposal = normalizeCampaignProposalKeywords(doc.campaignProposal);
        }
        return doc;
      },
    ],
    beforeChange: [
      autoGenerateSlug,
      // Sanitise empty-string select values from SQLite → null so Payload validation passes
      ({ data }) => {
        if (data) {
          const selectFields = ["proposalBusinessType", "proposalConversionGoal", "proposalServiceRadius"];
          for (const field of selectFields) {
            if (data[field] === "") data[field] = null;
          }
          if (data.campaignProposal) {
            data.campaignProposal = normalizeCampaignProposalKeywords(data.campaignProposal);
          }
        }
        return data;
      },
      // Process action items: auto-copy description to notes, auto-complete logged work
      async ({ data }) => {
        if (data?.actionItems && Array.isArray(data.actionItems)) {
          for (const item of data.actionItems) {
            if (item.description && !item.notes) {
              item.notes = item.description;
            }
            // "Completed Work" items auto-set to done with today's date
            if (item.itemType === "completed") {
              item.status = "done";
              if (!item.completedAt) {
                item.completedAt = new Date().toISOString();
              }
            }
          }
        }
        return data;
      },
    ],
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
    read: canAccessOrApiKey("google-ads-audits", hasValidApiKey),
    update: canAccessOrApiKey("google-ads-audits", hasValidApiKey),
    delete: adminOnlyDelete,
    create: canAccessOrApiKey("google-ads-audits", hasValidApiKey),
  },
  fields: [
    {
      name: "linkedClientHeader",
      type: "ui",
      admin: {
        components: {
          Field: "./components/ClientRecordHeader",
        },
      },
    },
    {
      type: "tabs",
      tabs: [
        // ── Tab 1: Client Info ──
        {
          label: "Client Info",
          fields: [
            {
              type: "row",
              fields: [
                {
                  name: "businessName",
                  type: "text",
                  required: true,
                  admin: {
                    description: "Client business name",
                    components: {
                      Cell: "./components/list-cells/TitleAvatarCell",
                    },
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
              ],
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
                  name: "client",
                  type: "relationship",
                  relationTo: "clients",
                  admin: {
                    description: "Link to existing client (optional)",
                  },
                },
                {
                  name: "proposal",
                  type: "relationship",
                  relationTo: "client-proposals",
                  admin: {
                    description: "Link to client proposal (optional)",
                  },
                },
              ],
            },
            {
              type: "row",
              fields: [
                {
                  name: "presentationPin",
                  type: "text",
                  admin: {
                    description: "4-digit PIN for presentation, ad copy preview, and dashboard access. Can match the client PIN for consistency.",
                  },
                  validate: (value: string | null | undefined) => {
                    if (!value) return true;
                    if (!/^\d{4}$/.test(value)) return "PIN must be exactly 4 digits";
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
                  name: "createProposal",
                  type: "checkbox",
                  defaultValue: false,
                  admin: {
                    description:
                      "Toggle on and save to create a Client Proposal from this audit",
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
                    description: "Influences audit scoring weights and campaign proposal structure.",
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
                    description: "Client-stated monthly ad spend ($). Sent to the audit engine to contextualise waste as a % of spend.",
                    step: 1,
                  },
                },
                {
                  name: "contactEmail",
                  type: "email",
                  admin: {
                    description: "Client contact email (for sending audit email)",
                  },
                },
              ],
            },
            {
              name: "conversionObjectives",
              type: "textarea",
              admin: {
                description: "What the client considers a conversion (one per line, e.g. form submissions, phone calls, purchases). Used by the audit engine and email to evaluate conversion tracking alignment.",
              },
            },
            {
              name: "brandTerms",
              type: "textarea",
              admin: {
                description: "Per-audit override (leave empty to inherit clients.brandKeywords). One per line, comma-, or semicolon-separated. Used by the audit, campaign proposal, negative list builder, and email generation to identify and exclude brand search terms.",
              },
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
              name: "snapshot",
              type: "relationship",
              relationTo: "google-ads-audit-snapshots" as any,
              admin: { readOnly: true, description: "Frozen evidence snapshot used by this audit" },
            },
            {
              name: "snapshotState",
              type: "select",
              admin: { readOnly: true, description: "Immutable snapshot capture state" },
              options: ["pending", "running", "completed", "failed"],
            },
            {
              name: "snapshotPeriodStart",
              type: "date",
              admin: { readOnly: true, description: "Earliest available account activity" },
            },
            {
              name: "snapshotPeriodEnd",
              type: "date",
              admin: { readOnly: true, description: "Final day of the previous calendar month in the account timezone" },
            },
            {
              name: "snapshotCapturedAt",
              type: "date",
              admin: { readOnly: true },
            },
            {
              name: "auditStatus",
              type: "select",
              admin: {
                readOnly: true,
                description: "Current audit pipeline status",
                components: {
                  Cell: "./components/list-cells/StatusPillCell",
                },
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
              name: "downloadAuditData",
              type: "ui",
              admin: {
                components: {
                  Field: "./components/DownloadAuditDataButton",
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
                components: {
                  Cell: "./components/list-cells/ScorePillCell",
                },
              },
            },
            {
              name: "rawData",
              type: "json",
              admin: {
                hidden: true,
                description: "Raw API data from Google Ads (campaigns, keywords, search terms, etc.)",
              },
            },
            {
              name: "scoredReport",
              type: "json",
              admin: {
                hidden: true,
                description: "Full scored audit results (GoogleAdsAuditResults shape)",
              },
            },
            {
              name: "emailHtml",
              type: "textarea",
              admin: {
                readOnly: true,
                hidden: true,
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

        // ── Tab 4: Finding Curation ──
        {
          label: "Finding Curation",
          fields: [
            {
              name: "curationUI",
              type: "ui",
              admin: {
                components: {
                  Field: "./components/GoogleAdsFindingCuration",
                },
              },
            },
            {
              name: "curatedFindings",
              type: "json",
              admin: {
                description:
                  "Team-curated finding selections (managed by the UI above)",
              },
            },
            {
              name: "regenerateEmailUI",
              type: "ui",
              admin: {
                components: {
                  Field: "./components/RegenerateEmailButton",
                },
              },
            },
          ],
        },

        // ── Tab 5: Presentation ──
        {
          label: "Presentation",
          fields: [
            {
              name: "deckReview",
              type: "ui",
              admin: { components: { Field: "./components/GoogleAdsAuditDeckReview" } },
            },
            {
              name: "deckGeneratedAt",
              type: "date",
              admin: { readOnly: true },
            },
            {
              name: "deckVersion",
              type: "number",
              admin: { readOnly: true },
            },
            {
              name: "generatedDeckPayload",
              type: "json",
              admin: { hidden: true },
            },
            {
              name: "deckSlideVisibility",
              type: "json",
              admin: { hidden: true, description: "Stable slide ID to hidden-state map" },
            },
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

        // ── Tab 6: Campaign Proposal ──
        {
          label: "Campaign Proposal",
          fields: [
            {
              name: "runCampaignProposal",
              type: "ui",
              admin: {
                components: {
                  Field: "./components/RunCampaignProposalButton",
                },
              },
            },
            {
              name: "campaignProposalPreview",
              type: "ui",
              admin: {
                components: {
                  Field: "./components/CampaignProposalPreview",
                },
              },
            },
            {
              name: "campaignProposalCompetitorWorkflow",
              type: "ui",
              admin: {
                components: {
                  Field: "./components/RunProposalCompetitorWorkflowButton",
                },
              },
            },
            {
              name: "campaignProposalStatus",
              type: "select",
              admin: {
                readOnly: true,
                description: "Current campaign proposal generation status",
              },
              options: [
                { label: "Pending", value: "pending" },
                { label: "Running", value: "running" },
                { label: "Completed", value: "completed" },
                { label: "Failed", value: "failed" },
                { label: "Approved", value: "approved" },
              ],
            },
            {
              name: "campaignProposal",
              type: "json",
              admin: {
                hidden: true,
              },
            },
            {
              name: "campaignProposalCompetitorStatus",
              type: "select",
              admin: {
                readOnly: true,
                description: "Current post-proposal competitor workflow status",
              },
              options: [
                { label: "Pending", value: "pending" },
                { label: "Running", value: "running" },
                { label: "Completed", value: "completed" },
                { label: "Failed", value: "failed" },
              ],
            },
            {
              name: "campaignProposalCompetitors",
              type: "json",
              admin: {
                readOnly: true,
                description: "Combined generated and manual competitors from proposal keywords",
              },
            },
            {
              name: "campaignProposalGeneratedCompetitors",
              type: "json",
              admin: {
                readOnly: true,
                hidden: true,
              },
            },
            {
              name: "campaignProposalManualCompetitors",
              type: "array",
              admin: {
                description: "Optional domains to append after generated competitors",
              },
              fields: [
                { name: "domain", type: "text", required: true },
                { name: "notes", type: "textarea" },
              ],
            },
            {
              name: "campaignProposalCompetitorKeywordsUsed",
              type: "json",
              admin: {
                readOnly: true,
                hidden: true,
              },
            },
            {
              name: "campaignProposalCompetitorsGeneratedAt",
              type: "date",
              admin: {
                readOnly: true,
                description: "When post-proposal competitors were generated",
              },
            },
            {
              name: "campaignProposalCompetitorError",
              type: "textarea",
              admin: {
                readOnly: true,
                description: "Last post-proposal competitor workflow error",
              },
            },
            {
              name: "approvedCampaignStructure",
              type: "json",
              admin: {
                hidden: true,
                description: "Client-approved campaign structure imported from CSV",
              },
            },
            // ── Engine Configuration ──
            {
              name: "proposalBusinessType",
              type: "select",
              defaultValue: "other",
              admin: {
                description: "Drives campaign structure, volume thresholds, and AI prompts. 'Other' auto-detects from crawl.",
                isClearable: true,
              },
              options: [
                { label: "Distributor (multi-brand, products + services)", value: "distributor" },
                { label: "Ecommerce (online store)", value: "ecommerce" },
                { label: "Service Business", value: "service" },
                { label: "Auto-detect", value: "other" },
              ],
              validate: () => true as true,
            },
            {
              name: "proposalConversionGoal",
              type: "select",
              admin: {
                description: "Primary conversion goal. Influences AI keyword filtering and landing page suggestions.",
                isClearable: true,
              },
              options: [
                { label: "Leads (forms, calls)", value: "leads" },
                { label: "Sales (purchases)", value: "sales" },
                { label: "Bookings (appointments)", value: "bookings" },
                { label: "Signups (registrations)", value: "signups" },
              ],
              validate: () => true as true,
            },
            {
              name: "proposalTargetLocation",
              type: "select",
              options: SEARCH_LOCATION_OPTIONS,
              hooks: { beforeValidate: [({ value }) => normalizeSearchLocation(value)] },
              admin: {
                isClearable: true,
                description: "Search-target snapshot used by campaign keyword research.",
              },
            },
            {
              name: "proposalSearchLanguage",
              type: "select",
              options: GOOGLE_SEARCH_LANGUAGE_OPTIONS,
              admin: {
                isClearable: true,
                description: "Explicit search-language snapshot; empty uses the country default.",
              },
            },
            {
              name: "proposalServiceRadius",
              type: "select",
              admin: {
                description: "Service area. Influences geo-targeted ad groups and volume thresholds.",
                isClearable: true,
              },
              options: [
                { label: "Local (single city)", value: "local" },
                { label: "Metro (city + suburbs)", value: "metro" },
                { label: "State", value: "state" },
                { label: "National", value: "national" },
              ],
              validate: () => true as true,
            },
            // ── Advanced Overrides (collapsible) ──
            {
              type: "collapsible",
              label: "Advanced Overrides",
              admin: {
                initCollapsed: true,
                description: "Override default preset values. Leave blank to use business type defaults.",
              },
              fields: [
                {
                  name: "proposalEnabledCampaigns",
                  type: "select",
                  hasMany: true,
                  admin: {
                    description: "Which campaign types to build. Leave empty for preset defaults.",
                  },
                  options: [
                    { label: "Brand", value: "brand" },
                    { label: "Brand Products", value: "brand-product" },
                    { label: "Products", value: "products" },
                    { label: "Services", value: "services" },
                    { label: "Services - Geo", value: "services-geo" },
                    { label: "Industry Verticals", value: "industry" },
                  ],
                },
                {
                  name: "proposalMinAdGroupVolume",
                  type: "number",
                  admin: {
                    description: "Minimum monthly searches for an ad group to qualify. Defaults: distributor=150, ecommerce=100, service=30.",
                    step: 10,
                  },
                },
                {
                  name: "proposalMinBrandImpressions",
                  type: "number",
                  admin: {
                    description: "Minimum monthly impressions for a 3rd-party brand to get its own ad group. Defaults: distributor=20, ecommerce=50.",
                    step: 5,
                  },
                },
                {
                  name: "proposalBrandVolumeExempt",
                  type: "checkbox",
                  admin: {
                    description: "Exempt brand ad groups from the volume threshold. Default: on for distributors, off for others.",
                  },
                },
                {
                  name: "proposalServiceSplit",
                  type: "select",
                  admin: {
                    description: "How to split service campaigns. Auto splits into Repair/Manufacturing/etc. Default: auto.",
                  },
                  options: [
                    { label: "Auto (split by type)", value: "auto" },
                    { label: "Single campaign", value: "single" },
                  ],
                },
                {
                  name: "proposalMaxIndustryVerticals",
                  type: "number",
                  admin: {
                    description: "Max industry vertical ad groups to include (sorted by volume). Default: 5.",
                    step: 1,
                  },
                  min: 1,
                  max: 20,
                },
                {
                  name: "proposalMaxAdGroupsPerCampaign",
                  type: "number",
                  admin: {
                    description: "Max ad groups before splitting into sub-campaigns. Default: 10.",
                    step: 1,
                  },
                  min: 1,
                  max: 50,
                },
                {
                  name: "proposalPrimaryFocus",
                  type: "select",
                  admin: {
                    description: "Which side to prioritise in the proposal. Default: services.",
                  },
                  options: [
                    { label: "Services", value: "services" },
                    { label: "Products", value: "products" },
                    { label: "Equal", value: "equal" },
                  ],
                },
                {
                  name: "proposalGeoIsolationMode",
                  type: "select",
                  defaultValue: "off",
                  admin: {
                    description: "Controls geo campaign proposal behaviour. Existing campaigns stay live; new geo splits are built paused.",
                  },
                  options: [
                    { label: "Off", value: "off" },
                    { label: "State campaigns", value: "state_campaigns" },
                    { label: "City campaigns", value: "city_campaigns" },
                    { label: "State + priority city campaigns", value: "state_plus_city_priority" },
                    { label: "Auto-detect", value: "auto" },
                  ],
                },
                {
                  name: "proposalNearMeStrategy",
                  type: "select",
                  defaultValue: "include_in_local_only",
                  admin: {
                    description: "How to treat 'near me' local-intent searches in geo proposals.",
                  },
                  options: [
                    { label: "Exclude", value: "exclude" },
                    { label: "Include in local/city only", value: "include_in_local_only" },
                    { label: "Include everywhere", value: "include_everywhere" },
                    { label: "Auto", value: "auto" },
                  ],
                },
                {
                  name: "proposalGeoNegativeStrategy",
                  type: "select",
                  defaultValue: "keyword_and_location",
                  admin: {
                    description: "How parent campaigns are isolated when child geo campaigns are proposed.",
                  },
                  options: [
                    { label: "Keyword only", value: "keyword_only" },
                    { label: "Location only", value: "location_only" },
                    { label: "Keyword + location", value: "keyword_and_location" },
                  ],
                },
                {
                  name: "proposalPreserveKeywordCpc",
                  type: "checkbox",
                  defaultValue: true,
                  admin: {
                    description: "Preserve source keyword-level Max CPC when cloning keywords into geo campaigns.",
                  },
                },
                {
                  name: "proposalPhraseMatchRequiresApproval",
                  type: "checkbox",
                  defaultValue: true,
                  admin: {
                    description: "Exact match is allowed by default; phrase match requires explicit review approval. Broad match is never proposed.",
                  },
                },
                {
                  name: "proposalCreatedByLabel",
                  type: "text",
                  defaultValue: "Created by Optimise Digital",
                  admin: {
                    description: "Google Ads label applied to entities created by Optimise Digital tooling.",
                  },
                },
                {
                  name: "proposalPendingActivationLabel",
                  type: "text",
                  defaultValue: "Pending activation - Optimise Digital",
                  admin: {
                    description: "Temporary Google Ads label for paused entities awaiting CMS activation.",
                  },
                },
                {
                  name: "proposalActivatedLabel",
                  type: "text",
                  defaultValue: "Activated by Optimise Digital",
                  admin: {
                    description: "Optional label to apply after a human activates a build batch.",
                  },
                },
              ],
            },
            {
              name: "campaignProposalNegativeKeywords",
              type: "array",
              dbName: "gads_proposal_negatives",
              admin: {
                description: "Keywords to exclude from specific categories or globally. Set these BEFORE running the proposal.",
              },
              fields: [
                {
                  name: "pattern",
                  type: "text",
                  required: true,
                  admin: {
                    description: "Keyword pattern to exclude (e.g. 'sodastream', 'pool pump')",
                  },
                },
                {
                  name: "scope",
                  type: "select",
                  defaultValue: "global",
                  dbName: "neg_scope",
                  options: [
                    { label: "Global (all categories)", value: "global" },
                    { label: "Category-specific", value: "category" },
                  ],
                },
                {
                  name: "category",
                  type: "text",
                  admin: {
                    description: "Category name to apply this negative to (only when scope is 'category')",
                    condition: (data: any, siblingData: any) => siblingData?.scope === "category",
                  },
                },
              ],
            },
            {
              name: "campaignProposalEmailHtml",
              type: "textarea",
              maxLength: 500000,
              admin: {
                hidden: true,
              },
            },
            {
              name: "campaignProposalGeneratedAt",
              type: "date",
              admin: {
                readOnly: true,
                description: "When the campaign proposal was generated",
              },
            },
            // ── Campaign Build (Google Ads push) ──
            {
              name: "buildCampaigns",
              type: "ui",
              admin: {
                components: {
                  Field: "./components/BuildCampaignsButton",
                },
              },
            },
            {
              name: "campaignBuildStatus",
              type: "select",
              admin: {
                readOnly: true,
                description: "Status of campaign creation in Google Ads",
              },
              options: [
                { label: "Not Started", value: "not_started" },
                { label: "Building", value: "building" },
                { label: "Completed", value: "completed" },
                { label: "Partially Failed", value: "partial_failure" },
                { label: "Failed", value: "failed" },
              ],
            },
            {
              name: "generatedAdCopy",
              type: "json",
              admin: {
                hidden: true,
                description: "Pre-generated RSA ad copy per ad group",
              },
            },
            {
              name: "campaignBuildResult",
              type: "json",
              admin: {
                hidden: true,
                description: "Results returned by Growth Tools after campaign creation",
              },
            },
            {
              name: "campaignBuildError",
              type: "textarea",
              admin: {
                readOnly: true,
                description: "Error details if campaign build failed",
              },
            },
            {
              name: "campaignBuildStartedAt",
              type: "date",
              admin: { readOnly: true },
            },
            {
              name: "campaignBuildCompletedAt",
              type: "date",
              admin: { readOnly: true },
            },
          ],
        },

        // ── Tab 7: Ad Copy ──
        {
          label: "Ad Copy",
          fields: [
            {
              name: "adCopyBrandHeadlines",
              type: "textarea",
              admin: {
                description: "Brand-specific headlines included in every generated ad group's RSA headlines (one per line, max 30 chars each). E.g. 'Malcolm Thompson Pumps', 'Call MTP Today', 'Since 1958'",
              },
            },
            {
              name: "generateAdCopyUI",
              type: "ui",
              admin: {
                components: {
                  Field: "./components/GenerateAdCopyButton",
                },
              },
            },
            {
              name: "adCopyEditorUI",
              type: "ui",
              admin: {
                components: {
                  Field: "./components/AdCopyEditor",
                },
              },
            },
            {
              name: "adCopyStatus",
              type: "select",
              admin: {
                readOnly: true,
                description: "Current status of the ad copy",
              },
              options: [
                { label: "Draft", value: "draft" },
                { label: "Generating", value: "generating" },
                { label: "Generated", value: "generated" },
                { label: "Published", value: "published" },
                { label: "Approved", value: "approved" },
              ],
            },
            {
              name: "adCopyPublished",
              type: "checkbox",
              defaultValue: false,
              admin: {
                description: "Toggle to make ad copy preview publicly accessible (with PIN)",
              },
            },
            {
              name: "adCopyComments",
              type: "json",
              admin: {
                hidden: true,
                description: "Client comments on ad copy (managed via API)",
              },
            },
            {
              name: "adCopyGeneratedAt",
              type: "date",
              admin: {
                readOnly: true,
                description: "When the ad copy was generated",
              },
            },
            {
              name: "adCopyPublishedAt",
              type: "date",
              admin: {
                readOnly: true,
                description: "When the ad copy preview was sent to the client",
              },
            },
            {
              name: "adCopyApprovedAt",
              type: "date",
              admin: {
                readOnly: true,
                description: "When the client submitted the ad copy for approval",
              },
            },
            {
              name: "adCopyOriginalCopy",
              type: "json",
              admin: {
                hidden: true,
                description: "Snapshot of the original generated ad copy before client edits",
              },
            },
            {
              name: "adCopyActivityUI",
              type: "ui",
              admin: {
                components: {
                  Field: "./components/AdCopyActivity",
                },
              },
            },
            {
              name: "deployAdCopyUI",
              type: "ui",
              admin: {
                components: {
                  Field: "./components/DeployAdCopyButton",
                },
              },
            },
            {
              name: "adCopyDeployStatus",
              type: "select",
              admin: {
                readOnly: true,
                description: "Current status of the ad copy deployment to Google Ads",
              },
              options: [
                { label: "Not Started", value: "not_started" },
                { label: "Deploying", value: "deploying" },
                { label: "Completed", value: "completed" },
                { label: "Mismatched", value: "mismatched" },
                { label: "Failed", value: "failed" },
              ],
            },
            {
              name: "adCopyDeployStartedAt",
              type: "date",
              admin: {
                readOnly: true,
                hidden: true,
              },
            },
            {
              name: "adCopyDeployedAt",
              type: "date",
              admin: {
                readOnly: true,
                description: "When the ad copy was deployed to Google Ads",
              },
            },
            {
              name: "adCopyDeployResult",
              type: "json",
              admin: {
                hidden: true,
                description: "Results from the ad copy deployment",
              },
            },
            {
              name: "adCopyDeployError",
              type: "textarea",
              admin: {
                readOnly: true,
                description: "Error details if deployment failed",
              },
            },
            {
              name: "adCopyDeployLabel",
              type: "text",
              admin: {
                readOnly: true,
                description: "Label applied to deployed ads in Google Ads",
              },
            },
          ],
        },

        // ── Tab: Conversions ──
        {
          label: "Conversions",
          fields: [
            {
              name: "conversionsUI",
              type: "ui",
              admin: {
                components: {
                  Field: "./components/GoogleAdsAuditConversions",
                },
              },
            },
          ],
        },

        // ── Tab 8: Budget Management ──
        {
          label: "Budget Management",
          fields: [
            {
              name: "budgetManagementUI",
              type: "ui",
              admin: {
                components: {
                  Field: "./components/GoogleAdsBudgetManagement",
                },
              },
            },
          ],
        },

        // ── Tab 9: Ad Extensions ──
        {
          label: "Ad Extensions",
          fields: [
            {
              name: "adExtensionsUI",
              type: "ui",
              admin: {
                components: {
                  Field: "./components/GoogleAdsAdExtensions",
                },
              },
            },
          ],
        },

        // ── Tab 10: Negative List Builder ──
        {
          label: "Negative List Builder",
          fields: [
            {
              name: "negativeListBuilderUI",
              type: "ui",
              admin: {
                components: {
                  Field: "./components/NegativeListBuilder",
                },
              },
            },
            {
              name: "negativeListBuilderPublished",
              type: "checkbox",
              defaultValue: false,
              admin: {
                description: "Toggle to make the negative keyword list publicly accessible (with PIN)",
              },
            },
            {
              name: "negativeListBuilder",
              type: "json",
              admin: {
                hidden: true,
                description: "Negative keyword list builder data (managed by the UI above)",
              },
            },
          ],
        },

        // ── Tab 11: Negative Keyword Lists ──
        {
          label: "Negative Keyword Lists",
          fields: [
            {
              name: "negativeKeywordListsUI",
              type: "ui",
              admin: {
                components: {
                  Field: "./components/GoogleAdsNegativeKeywordLists",
                },
              },
            },
          ],
        },

        // ── Tab 12: Monthly Negative KWs ──
        {
          label: "Monthly negative KWs",
          fields: [
            {
              name: "monthlyNegativeKeywords",
              type: "ui",
              admin: {
                components: {
                  Field: "./components/MonthlyNegativeKeywordsLink",
                },
              },
            },
          ],
        },

        // ── Tab 13: Match Type Variants ──
        {
          label: "Match Type Variants",
          fields: [
            {
              name: "googleAdsMatchTypeVariants",
              type: "ui",
              admin: {
                components: {
                  Field: "./components/GoogleAdsMatchTypeVariants",
                },
              },
            },
          ],
        },

        // ── Tab 14: Negative Keyword Submits ──
        // Submissions the client makes from the Google Ads dashboard's
        // Keyword Deep Dive tool. Team reviews here and applies keywords to
        // a Negative Keyword List from the submission's edit view.
        {
          label: "Negative Keyword Submits",
          fields: [
            {
              name: "keywordDeepDiveSessionsUI",
              type: "ui",
              admin: {
                components: {
                  Field: "./components/GoogleAdsKeywordDeepDiveSessions",
                },
              },
            },
          ],
        },

        // ── Tab 13: History ──
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

        // ── Tab 8: Action Items (OptiMate prep) ──
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
                  name: "itemType",
                  type: "select",
                  defaultValue: "task",
                  options: [
                    { label: "Planned Task", value: "task" },
                    { label: "Completed Work", value: "completed" },
                  ],
                  admin: {
                    description: "Task = something to do. Completed Work = log ad hoc work already done.",
                    width: "50%",
                  },
                },
                {
                  name: "action",
                  type: "text",
                  required: true,
                  admin: {
                    description: "What needs to be done / what was done",
                  },
                },
                {
                  name: "description",
                  type: "textarea",
                  admin: {
                    description: "Detailed description — auto-copied to Notes on save if notes is empty",
                  },
                },
                {
                  type: "row",
                  fields: [
                    {
                      name: "priority",
                      type: "select",
                      defaultValue: "medium",
                      options: [
                        { label: "High", value: "high" },
                        { label: "Medium", value: "medium" },
                        { label: "Low", value: "low" },
                      ],
                      admin: { width: "33%" },
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
                      admin: { width: "33%" },
                    },
                    {
                      name: "timeSpent",
                      type: "number",
                      admin: {
                        description: "Minutes spent on this work",
                        width: "33%",
                        step: 5,
                      },
                    },
                  ],
                },
                {
                  name: "completedAt",
                  type: "date",
                  admin: {
                    condition: (data: any, siblingData: any) =>
                      siblingData?.status === "done" || siblingData?.itemType === "completed",
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

        // ── Tab 9: Automations (Legacy — configure from Client record) ──
        {
          label: "Automations",
          fields: [
            // ─ Negative Keyword Sweep Config ─
            {
              name: "negativeSweepConfig",
              type: "group",
              admin: {
                description: "⚠️ Legacy config — configure automations from the Client record instead. These fields are kept for existing data.",
                readOnly: true,
              },
              fields: [
                {
                  name: "enabled",
                  type: "checkbox",
                  defaultValue: false,
                  admin: {
                    description: "Enable weekly negative keyword sweeps",
                  },
                },
                {
                  type: "row",
                  fields: [
                    {
                      name: "mode",
                      type: "select",
                      defaultValue: "review_first",
                      options: [
                        { label: "Review first (team approves)", value: "review_first" },
                        { label: "Auto-apply", value: "auto_apply" },
                      ],
                      admin: {
                        description: "How to handle candidates",
                        width: "50%",
                      },
                    },
                    {
                      name: "weekday",
                      type: "select",
                      defaultValue: "monday",
                      options: [
                        { label: "Monday", value: "monday" },
                        { label: "Tuesday", value: "tuesday" },
                        { label: "Wednesday", value: "wednesday" },
                        { label: "Thursday", value: "thursday" },
                        { label: "Friday", value: "friday" },
                        { label: "Saturday", value: "saturday" },
                        { label: "Sunday", value: "sunday" },
                      ],
                      admin: {
                        description: "Day to run the sweep",
                        width: "50%",
                      },
                    },
                  ],
                },
                {
                  name: "minSpendThreshold",
                  type: "number",
                  defaultValue: 5,
                  min: 0,
                  admin: {
                    description: "Minimum spend ($) on a search term to flag it as a candidate",
                    step: 1,
                  },
                },
                {
                  name: "excludeTerms",
                  type: "textarea",
                  admin: {
                    description: "Terms to never suggest as negatives, in addition to brand terms (one per line)",
                  },
                },
              ],
            },

            // ─ Re-audit Config ─
            {
              name: "reauditConfig",
              type: "group",
              admin: {
                description: "⚠️ Legacy config — configure from Client record.",
                readOnly: true,
              },
              fields: [
                {
                  name: "enabled",
                  type: "checkbox",
                  defaultValue: false,
                  admin: {
                    description: "Enable scheduled re-audits",
                  },
                },
                {
                  name: "dayOfMonth",
                  type: "number",
                  defaultValue: 1,
                  min: 1,
                  max: 28,
                  admin: {
                    description: "Day of month to run (1–28)",
                    step: 1,
                  },
                },
              ],
            },

            // ─ Score Trajectory ─
            {
              name: "scoreTrajectory",
              type: "group",
              admin: {
                readOnly: true,
                description: "Computed on each re-audit",
              },
              fields: [
                {
                  type: "row",
                  fields: [
                    {
                      name: "latestScore",
                      type: "number",
                      admin: { readOnly: true, width: "25%" },
                    },
                    {
                      name: "previousScore",
                      type: "number",
                      admin: { readOnly: true, width: "25%" },
                    },
                    {
                      name: "scoreChange",
                      type: "number",
                      admin: { readOnly: true, width: "25%" },
                    },
                    {
                      name: "trend",
                      type: "select",
                      options: [
                        { label: "Improving", value: "improving" },
                        { label: "Stable", value: "stable" },
                        { label: "Declining", value: "declining" },
                      ],
                      admin: { readOnly: true, width: "25%" },
                    },
                  ],
                },
              ],
            },

            // ─ Performance Report Config ─
            {
              name: "performanceReportConfig",
              type: "group",
              admin: {
                description: "⚠️ Legacy config — configure from Client record.",
                readOnly: true,
              },
              fields: [
                {
                  name: "enabled",
                  type: "checkbox",
                  defaultValue: false,
                  admin: {
                    description: "Enable monthly performance reports",
                  },
                },
                {
                  name: "dayOfMonth",
                  type: "number",
                  defaultValue: 3,
                  min: 1,
                  max: 28,
                  admin: {
                    description: "Day of month to generate (default 3rd — lets data settle)",
                    step: 1,
                  },
                },
                {
                  name: "recipientEmails",
                  type: "array",
                  maxRows: 10,
                  admin: {
                    description: "Email recipients for the report (falls back to team email if empty)",
                  },
                  fields: [
                    {
                      name: "email",
                      type: "email",
                      required: true,
                    },
                  ],
                },
                {
                  name: "includeInClientHub",
                  type: "checkbox",
                  defaultValue: true,
                  admin: {
                    description: "Make report data available via the client hub API",
                  },
                },
              ],
            },
          ],
        },

        // ── Tab 9: Sweep History ──
        {
          label: "Sweep History",
          fields: [
            {
              name: "negativeSweepPendingApproval",
              type: "json",
              admin: {
                description: "Current batch of negative keyword candidates awaiting review (cleared on approve/skip)",
              },
            },
            {
              name: "negativeSweepHistory",
              type: "array",
              admin: {
                readOnly: true,
                description: "History of negative keyword sweeps",
              },
              fields: [
                {
                  name: "sweepDate",
                  type: "date",
                  required: true,
                },
                {
                  type: "row",
                  fields: [
                    {
                      name: "candidateCount",
                      type: "number",
                      admin: { readOnly: true, width: "25%" },
                    },
                    {
                      name: "totalWasteIdentified",
                      type: "number",
                      admin: { readOnly: true, description: "$ waste found", width: "25%" },
                    },
                    {
                      name: "appliedCount",
                      type: "number",
                      admin: { readOnly: true, width: "25%" },
                    },
                    {
                      name: "status",
                      type: "select",
                      options: [
                        { label: "Pending Review", value: "pending_review" },
                        { label: "Approved", value: "approved" },
                        { label: "Applied", value: "applied" },
                        { label: "Skipped", value: "skipped" },
                      ],
                      admin: { readOnly: true, width: "25%" },
                    },
                  ],
                },
                {
                  name: "candidates",
                  type: "json",
                  admin: {
                    description: "Full candidate list for this sweep",
                  },
                },
              ],
            },
          ],
        },

        // ── Tab 10: Performance Reports ──
        {
          label: "Performance Reports",
          fields: [
            {
              name: "viewDashboardFromAudit",
              type: "ui",
              admin: {
                components: { Field: "./components/ViewGoogleDashboardButton" },
              },
            },
            {
              name: "performanceReports",
              type: "array",
              admin: {
                readOnly: true,
                description: "Monthly performance report history",
              },
              fields: [
                {
                  type: "row",
                  fields: [
                    {
                      name: "reportMonth",
                      type: "text",
                      required: true,
                      admin: { readOnly: true, description: "YYYY-MM", width: "33%" },
                    },
                    {
                      name: "reportDate",
                      type: "date",
                      admin: { readOnly: true, description: "When generated", width: "33%" },
                    },
                    {
                      name: "emailSentAt",
                      type: "date",
                      admin: { readOnly: true, width: "33%" },
                    },
                  ],
                },
                {
                  name: "kpis",
                  type: "json",
                  admin: {
                    description: "Month KPIs (spend, clicks, conversions, CPA, etc.)",
                  },
                },
                {
                  name: "mom",
                  type: "json",
                  admin: {
                    description: "Month-on-month comparison",
                  },
                },
                {
                  name: "campaignBreakdown",
                  type: "json",
                  admin: {
                    description: "Top campaigns by spend",
                  },
                },
                {
                  name: "monthlyTrend",
                  type: "json",
                  admin: {
                    description: "12-month trend data",
                  },
                },
                {
                  name: "emailRecipients",
                  type: "json",
                  admin: {
                    readOnly: true,
                    description: "Who received the email",
                  },
                },
              ],
            },
          ],
        },

        // ── Tab 11: Weekly Reports ──
        {
          label: "Weekly Reports",
          fields: [
            {
              name: "weeklyReports",
              type: "array",
              admin: {
                readOnly: true,
                description: "Weekly performance report history",
              },
              fields: [
                {
                  type: "row",
                  fields: [
                    {
                      name: "reportWeek",
                      type: "text",
                      required: true,
                      admin: { readOnly: true, description: "YYYY-MM-DD/YYYY-MM-DD", width: "33%" },
                    },
                    {
                      name: "reportDate",
                      type: "date",
                      admin: { readOnly: true, description: "When generated", width: "33%" },
                    },
                    {
                      name: "template",
                      type: "text",
                      admin: { readOnly: true, width: "33%" },
                    },
                  ],
                },
                {
                  name: "kpis",
                  type: "json",
                  admin: {
                    description: "Week KPIs (spend, clicks, conversions, CPA, etc.)",
                  },
                },
                {
                  name: "wow",
                  type: "json",
                  admin: {
                    description: "Week-on-week comparison",
                  },
                },
                {
                  name: "campaignBreakdown",
                  type: "json",
                  admin: {
                    description: "Top campaigns by spend",
                  },
                },
                {
                  name: "workDoneCount",
                  type: "number",
                  admin: {
                    readOnly: true,
                    description: "Number of work items included in this report",
                  },
                },
              ],
            },
          ],
        },

        // ── Tab 12: OptiMate Chat ──
        {
          label: "OptiMate Chat",
          fields: [
            {
              name: "optimateChat",
              type: "ui",
              admin: {
                components: {
                  Field: "./components/GoogleAdsChat",
                },
              },
            },
          ],
        },


      ],
    },

    // ── OptiMate autonomous run history (persisted, hidden from admin UI) ──
    {
      name: "optimateHistory",
      type: "array",
      admin: {
        hidden: true,
        readOnly: true,
        description: "Autonomous monitoring run history (populated by OptiMate agent)",
      },
      fields: [
        {
          type: "row",
          fields: [
            {
              name: "runDate",
              type: "text",
              required: true,
              admin: { readOnly: true, width: "30%" },
            },
            {
              name: "recommendationCount",
              type: "number",
              admin: { readOnly: true, width: "15%" },
            },
            {
              name: "criticalCount",
              type: "number",
              admin: { readOnly: true, width: "15%" },
            },
            {
              name: "warningCount",
              type: "number",
              admin: { readOnly: true, width: "15%" },
            },
          ],
        },
        {
          name: "checksRun",
          type: "json",
          admin: { readOnly: true, description: "Which checks ran" },
        },
        {
          name: "autoApplied",
          type: "json",
          admin: { readOnly: true, description: "Actions auto-applied this run" },
        },
        {
          name: "recommendations",
          type: "json",
          admin: { readOnly: true, description: "Full recommendation list" },
        },
      ],
    },

    // ── Budget management (persisted, not shown in tabs) ──
    {
      name: "monthlyBudget",
      type: "number",
      admin: {
        hidden: true,
        description: "Monthly budget total for budget management tab",
      },
    },
    {
      name: "annualBudgetPlaceholders",
      type: "json",
      admin: {
        hidden: true,
        description: "CMS-only annual client budget placeholder grid for Budget Management reference. Not used by budget allocation or Google Ads pushes.",
      },
    },

  ],
};
