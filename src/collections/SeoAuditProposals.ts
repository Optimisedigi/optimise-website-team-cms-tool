import type { CollectionConfig, CollectionBeforeChangeHook } from "payload";
import crypto from "crypto";
import { hasValidApiKey } from "./api-key-access";
import { canAccessOrApiKey, adminOnlyDelete, hideUnlessFeature } from "../lib/access";
import { GOOGLE_SEARCH_LANGUAGE_OPTIONS, SEARCH_LOCATION_OPTIONS, normalizeSearchLocation } from "../lib/search-target-options";

/**
 * SEO Audit Proposal — a full new-client SEO analysis produced by the Growth
 * Tools `POST /api/seo-proposal` engine. Combines GSC search performance + GSC
 * technical + keyword demand + live rankings + on-page SEO + CRO + service
 * coverage + location targeting + topic authority + traffic-upside + lead-value
 * ROI into one structured report, rendered as a client-facing proposal.
 *
 * Created/triggered from a Client or a Client Proposal (which supplies the
 * website, GSC property, business type, AOV and conversion rate). The full
 * report JSON is stored in `report`.
 */
const autoGenerateSlug: CollectionBeforeChangeHook = ({ data }) => {
  if (data && !data.reportSlug && data.websiteUrl) {
    const domain = String(data.websiteUrl)
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .replace(/[^a-zA-Z0-9.-]/g, "")
      .replace(/\./g, "-");
    const date = new Date().toISOString().slice(0, 10);
    const rand = crypto.randomBytes(4).toString("hex");
    data.reportSlug = `${domain}-${date}-${rand}`;
  }
  return data;
};

export const SeoAuditProposals: CollectionConfig = {
  slug: "seo-audit-proposals",
  labels: {
    singular: "SEO Audit Proposal",
    plural: "SEO Audit Proposals",
  },
  admin: {
    useAsTitle: "websiteUrl",
    group: "Growth Tools",
    defaultColumns: ["websiteUrl", "status", "verdict", "createdAt"],
    description:
      "Full SEO Audit Proposals — GSC performance, technical, demand, rankings, SEO/CRO, service coverage, location, topic authority, and lead-value ROI.",
    hidden: hideUnlessFeature("seo-audit-proposals"),
  },
  hooks: {
    beforeChange: [autoGenerateSlug],
  },
  access: {
    read: canAccessOrApiKey("seo-audit-proposals", hasValidApiKey),
    update: canAccessOrApiKey("seo-audit-proposals", hasValidApiKey),
    delete: adminOnlyDelete,
    create: canAccessOrApiKey("seo-audit-proposals", hasValidApiKey),
  },
  fields: [
    {
      name: "runProposal",
      type: "ui",
      admin: {
        components: {
          Field: "./components/RunSeoProposalButton",
        },
      },
    },
    {
      name: "viewReport",
      type: "ui",
      admin: {
        components: {
          Field: "./components/ViewSeoAuditProposalLink",
        },
      },
    },
    {
      name: "copyEmail",
      type: "ui",
      admin: {
        components: {
          Field: "./components/CopySeoProposalEmailButton",
        },
      },
    },
    {
      type: "row",
      fields: [
        {
          name: "client",
          type: "relationship",
          relationTo: "clients",
          admin: { description: "Linked client (when run from a client)" },
        },
        {
          name: "proposal",
          type: "relationship",
          relationTo: "client-proposals",
          admin: { description: "Linked client proposal (when run from a proposal)" },
        },
      ],
    },
    {
      name: "reportSlug",
      type: "text",
      unique: true,
      index: true,
      admin: {
        readOnly: true,
        description: "Auto-generated slug for the public report URL",
      },
    },
    // ── Inputs (snapshot of what the engine was run with) ──────────────────
    {
      type: "row",
      fields: [
        {
          name: "websiteUrl",
          type: "text",
          required: true,
          admin: {
            description: "Website analysed",
            components: {
              Cell: "./components/list-cells/TitleAvatarCell",
            },
          },
        },
        {
          name: "gscSiteUrl",
          type: "text",
          required: true,
          admin: {
            description:
              "Search Console property — URL (https://x.com/) or domain property (sc-domain:x.com)",
          },
        },
      ],
    },
    {
      type: "row",
      fields: [
        {
          name: "businessType",
          type: "text",
          admin: { description: "Business type / industry" },
        },
        {
          name: "location",
          type: "select",
          options: SEARCH_LOCATION_OPTIONS,
          hooks: { beforeValidate: [({ value }) => normalizeSearchLocation(value)] },
          admin: { isClearable: true, description: "Canonical search country or retained legacy city preset" },
        },
        {
          name: "searchLanguage",
          type: "select",
          options: GOOGLE_SEARCH_LANGUAGE_OPTIONS,
          admin: { isClearable: true, description: "Empty uses the selected country's automatic language" },
        },
      ],
    },
    {
      name: "brandKeywords",
      type: "textarea",
      admin: {
        description:
          "Brand terms (one per line or comma-separated) for the brand-vs-non-brand split. Pulled from the client when available.",
      },
    },
    {
      name: "proposalPin",
      type: "text",
      maxLength: 12,
      admin: {
        description:
          "Optional 4-digit PIN to gate the public deck. Leave blank for no gate. Pulled from the client/proposal when available.",
      },
    },
    {
      name: "presentedBy",
      type: "text",
      admin: {
        description:
          "Who is presenting this proposal (e.g. 'Adam Telhiwec and Peter Tu'). Shown on the closing slide. Pulled from the client/proposal when available.",
      },
    },
    // ── Lead-value economics (drive the ROI hook) ──────────────────────────
    {
      type: "row",
      fields: [
        {
          name: "averageOrderValue",
          type: "number",
          min: 0,
          admin: { description: "Average order / client value ($) — drives ROI revenue", step: 1 },
        },
        {
          name: "conversionRate",
          type: "number",
          min: 0,
          max: 100,
          admin: {
            description: "Website visitor → lead/sale conversion rate (%). Defaults to 2% if blank.",
            step: 0.1,
          },
        },
        {
          name: "costPerLead",
          type: "number",
          min: 0,
          admin: { description: "Optional — cost per lead ($) for the equivalent-paid-cost comparison", step: 1 },
        },
      ],
    },
    // ── Run status ─────────────────────────────────────────────────────────
    {
      name: "status",
      type: "select",
      defaultValue: "pending",
      admin: {
        readOnly: true,
        description: "Current run status",
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
      name: "progress",
      type: "text",
      admin: { readOnly: true, description: "Current stage (e.g. 'Running GSC|20')" },
    },
    {
      type: "row",
      fields: [
        { name: "startedAt", type: "date", admin: { readOnly: true } },
        { name: "completedAt", type: "date", admin: { readOnly: true } },
      ],
    },
    {
      name: "error",
      type: "textarea",
      admin: { readOnly: true, description: "Error details if the run failed" },
    },
    // ── Results ──────────────────────────────────────────────────────────
    {
      name: "verdict",
      type: "textarea",
      admin: { readOnly: true, description: "One-line verdict (copied from the report for list view)" },
    },
    {
      name: "report",
      type: "json",
      admin: {
        readOnly: true,
        description: "Full SeoProposalReport JSON returned by the Growth Tools engine",
      },
    },
  ],
};

export default SeoAuditProposals;
