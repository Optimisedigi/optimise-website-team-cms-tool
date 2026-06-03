import type { CollectionConfig, CollectionBeforeChangeHook } from "payload";
import crypto from "crypto";
import { hasValidApiKey } from "./api-key-access";
import { logActivity } from "../lib/activity-log";
import { canAccessOrApiKey, adminOnlyDelete, hideUnlessFeature } from "../lib/access";

const autoGenerateSlug: CollectionBeforeChangeHook = ({ data }) => {
  if (data && !data.reportSlug && data.websiteUrl) {
    const domain = data.websiteUrl
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .replace(/[^a-zA-Z0-9.-]/g, "")
      .replace(/\./g, "-");
    const date = new Date().toISOString().slice(0, 10);
    const rand = crypto.randomBytes(4).toString("hex");
    data.reportSlug = `cro-${domain}-${date}-${rand}`;
  }
  return data;
};

export const CroAudits: CollectionConfig = {
  slug: "cro-audits",
  labels: {
    singular: "CRO Audit",
    plural: "CRO Audits",
  },
  admin: {
    useAsTitle: "websiteUrl",
    group: "Growth Tools",
    defaultColumns: ["websiteUrl", "overallScore", "conversionGoal", "createdAt"],
    description: "Conversion rate optimisation audit reports from the growth tools",
    hidden: hideUnlessFeature("cro-audits"),
  },
  hooks: {
    beforeChange: [autoGenerateSlug],
    afterChange: [
      async ({ doc, operation, req }) => {
        if (operation === "create") {
          logActivity(req.payload, {
            type: "cro_audit_completed",
            title: `CRO audit: ${doc.websiteUrl}`,
            description: `Score: ${doc.overallScore ?? "N/A"}/10`,
            user: req.user?.id,
            client: typeof doc.client === "object" ? doc.client?.id : doc.client,
          }).catch(() => {});
        }
      },
    ],
  },
  access: {
    read: canAccessOrApiKey("cro-audits", hasValidApiKey),
    update: canAccessOrApiKey("cro-audits", hasValidApiKey),
    delete: adminOnlyDelete,
    create: canAccessOrApiKey("cro-audits", hasValidApiKey),
  },
  fields: [
    {
      type: "tabs",
      tabs: [
        {
          label: "Overview",
          fields: [
            {
              name: "websiteUrl",
              label: "Website URL",
              type: "text",
              required: true,
              admin: {
                description: "The URL that was audited",
              },
            },
            {
              type: "row",
              fields: [
                {
                  name: "conversionGoal",
                  type: "text",
                  required: true,
                  admin: {
                    description: "Primary conversion goal (e.g. lead generation, e-commerce)",
                  },
                },
                {
                  name: "overallScore",
                  type: "number",
                  min: 0,
                  max: 10,
                  admin: {
                    description: "Overall CRO score (0-10)",
                  },
                },
              ],
            },
            {
              type: "row",
              fields: [
                {
                  name: "firstImpressionScore",
                  type: "number",
                  min: 0,
                  max: 10,
                  admin: { description: "First Impression (20%) — headline clarity, visual hierarchy, above-fold trust signals" },
                },
                {
                  name: "trustScore",
                  type: "number",
                  min: 0,
                  max: 10,
                  admin: { description: "Trust & Social Proof (20%) — testimonials, ratings, logos, case studies" },
                },
                {
                  name: "ctaScore",
                  type: "number",
                  min: 0,
                  max: 10,
                  admin: { description: "Call-to-Action (15%) — text quality, positioning, size/color" },
                },
              ],
            },
            {
              type: "row",
              fields: [
                {
                  name: "leadCaptureScore",
                  type: "number",
                  min: 0,
                  max: 10,
                  admin: { description: "Lead Capture (20%) — form analysis, field count, privacy text, multi-step forms" },
                },
                {
                  name: "contentReadabilityScore",
                  type: "number",
                  min: 0,
                  max: 10,
                  admin: { description: "Content & Readability (15%) — structure, headings, lists, visual quality" },
                },
                {
                  name: "navigationScore",
                  type: "number",
                  min: 0,
                  max: 10,
                  admin: { description: "Navigation (10%) — nav element, link count, dropdowns, CTA in nav" },
                },
              ],
            },
          ],
        },
        {
          label: "Findings",
          fields: [
            {
              name: "findings",
              type: "json",
              admin: {
                description:
                  "CRO findings — each entry has category, score, status (good/warning/critical), message, and optional details",
              },
            },
          ],
        },
        {
          label: "Recommendations",
          fields: [
            {
              name: "recommendations",
              type: "json",
              admin: {
                description:
                  "Prioritised recommendations — each entry has priority, title, description, impact, and estimatedLift",
              },
            },
          ],
        },
        {
          label: "Extracted Content",
          fields: [
            {
              name: "extractedContent",
              type: "json",
              admin: {
                description:
                  "Extracted page content — headline, subHeadlines[], navigationItems[], ctaTexts[]",
              },
            },
          ],
        },
      ],
    },
    {
      name: "reportSlug",
      type: "text",
      unique: true,
      admin: {
        description: "Unique URL slug for this CRO report. Auto-generated if left blank.",
      },
    },
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
    {
      name: "customerEmail",
      type: "email",
      admin: {
        description: "Email captured from gated form (if provided)",
      },
    },
    {
      name: "visitorIp",
      type: "text",
      admin: {
        description: "IP address of the visitor",
      },
    },
    {
      name: "visitorFingerprint",
      type: "text",
      admin: {
        description: "Browser fingerprint hash",
      },
    },
  ],
};
