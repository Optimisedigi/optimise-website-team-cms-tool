import type { CollectionConfig, CollectionBeforeChangeHook } from "payload";
import crypto from "crypto";
import { logActivity } from "../lib/activity-log";

const trackRetainerChange: CollectionBeforeChangeHook = async ({
  data,
  originalDoc,
  req,
  operation,
}) => {
  if (operation !== "update" || !data || !originalDoc) return data;

  const oldAmount = originalDoc.monthlyRetainer ?? 0;
  const newAmount = data.monthlyRetainer ?? 0;

  if (oldAmount === newAmount) return data;

  const historyEntry = {
    amount: newAmount,
    previousAmount: oldAmount,
    effectiveDate: new Date().toISOString(),
    changedBy: req.user?.email || req.user?.name || "system",
  };

  const existing = Array.isArray(originalDoc.retainerHistory)
    ? originalDoc.retainerHistory
    : [];
  data.retainerHistory = [historyEntry, ...existing];

  // Log retainer change activity (fire-and-forget)
  logActivity(req.payload, {
    type: "retainer_changed",
    title: `Retainer changed for ${originalDoc.name || "client"}`,
    description: `$${oldAmount.toLocaleString()} → $${newAmount.toLocaleString()}/mo`,
    user: req.user?.id,
    client: originalDoc.id,
  }).catch(() => {});

  return data;
};

/**
 * Clients Collection
 *
 * Each client represents a website/business you manage.
 * Blog posts are associated with specific clients.
 */
export const Clients: CollectionConfig = {
  slug: "clients",
  admin: {
    useAsTitle: "name",
    group: "Database",
    description: "Manage client websites",
  },
  hooks: {
    beforeChange: [trackRetainerChange],
    afterChange: [
      async ({ doc, operation, req }) => {
        if (operation === "create") {
          logActivity(req.payload, {
            type: "client_added",
            title: `New client: ${doc.name}`,
            description: doc.websiteUrl || "",
            user: req.user?.id,
            client: doc.id,
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
          label: "Business",
          fields: [
            {
              name: "name",
              type: "text",
              required: true,
              admin: {
                description: "Client/business name (e.g., 'Acme Corp')",
              },
            },
            {
              name: "slug",
              type: "text",
              required: true,
              unique: true,
              admin: {
                description: "URL-friendly identifier (e.g., 'acme-corp')",
              },
            },
            {
              name: "websiteUrl",
              type: "text",
              admin: {
                description: "Client website URL (e.g., 'https://acmecorp.com')",
              },
            },
            {
              name: "apiKey",
              type: "text",
              admin: {
                description: "API key for this client (auto-generated)",
                readOnly: true,
              },
              hooks: {
                beforeChange: [
                  ({ value, operation }) => {
                    if (operation === "create" && !value) {
                      return `key_${crypto.randomBytes(24).toString("hex")}`;
                    }
                    return value;
                  },
                ],
              },
            },
            {
              name: "isActive",
              type: "checkbox",
              defaultValue: true,
              admin: {
                description: "Enable/disable content publishing for this client",
              },
            },
            {
              name: "isAgency",
              type: "checkbox",
              defaultValue: false,
              admin: {
                position: "sidebar",
                description: "Check if this is the agency itself (hides revenue fields)",
              },
            },
            {
              name: "clientPin",
              type: "text",
              unique: true,
              admin: {
                position: "sidebar",
                description:
                  "4-digit PIN for client hub access (auto-generated)",
              },
              validate: async (value: string | null | undefined, { req, id }: any) => {
                if (!value) return true;
                if (!/^\d{4}$/.test(value))
                  return "PIN must be exactly 4 digits";
                try {
                  const existing = await req.payload.find({
                    collection: "clients",
                    where: {
                      clientPin: { equals: value },
                      ...(id ? { id: { not_equals: id } } : {}),
                    },
                    limit: 1,
                  });
                  if (existing.totalDocs > 0) {
                    return `PIN "${value}" is already in use by another client (${existing.docs[0].name}).`;
                  }
                } catch { /* skip check if payload not available */ }
                return true;
              },
              hooks: {
                beforeChange: [
                  ({ value, operation }) => {
                    if (operation === "create" && !value) {
                      return String(
                        Math.floor(1000 + Math.random() * 9000)
                      );
                    }
                    return value;
                  },
                ],
              },
            },
            {
              name: "websiteType",
              type: "select",
              admin: {
                description:
                  "Who built the website — determines whether GSC alerts are actionable (we fix) or advisory (we recommend)",
              },
              options: [
                { label: "Built by Us", value: "built_by_us" },
                { label: "External CMS / Third Party", value: "external_cms" },
              ],
            },
            {
              name: "externalCms",
              type: "select",
              admin: {
                description: "Which CMS platform is the website built on?",
                condition: (data: any) => data?.websiteType === "external_cms",
              },
              options: [
                { label: "WordPress", value: "wordpress" },
                { label: "Shopify", value: "shopify" },
                { label: "Squarespace", value: "squarespace" },
                { label: "Wix", value: "wix" },
                { label: "Webflow", value: "webflow" },
                { label: "Other", value: "other" },
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
                    description: "Primary contact email",
                  },
                },
              ],
            },
            {
              type: "row",
              fields: [
                {
                  name: "hasPhysicalLocations",
                  type: "checkbox",
                  defaultValue: false,
                  admin: {
                    description: "Does this business have physical locations?",
                  },
                },
                {
                  name: "numberOfLocations",
                  type: "number",
                  min: 1,
                  admin: {
                    description: "Number of physical locations",
                    condition: (data: any) => data?.hasPhysicalLocations,
                  },
                },
              ],
            },
            {
              name: "googleMapsUrls",
              type: "array",
              maxRows: 10,
              admin: {
                description: "Google Maps listing URLs for GBP analysis",
                condition: (data: any) => data?.hasPhysicalLocations,
              },
              fields: [
                {
                  name: "url",
                  type: "text",
                  required: true,
                  admin: {
                    description: "Google Maps listing URL",
                  },
                },
                {
                  name: "label",
                  type: "text",
                  admin: {
                    description: "Location label (e.g. 'Head Office', 'Sydney Branch')",
                  },
                },
              ],
            },
            {
              name: "conversionGoal",
              type: "select",
              admin: {
                description: "Primary conversion goal",
              },
              options: [
                { label: "Lead Generation", value: "lead generation" },
                { label: "Phone Calls", value: "phone calls" },
                { label: "Form Submissions", value: "form submissions" },
                { label: "E-commerce Sales", value: "e-commerce" },
                { label: "Bookings / Appointments", value: "bookings" },
                { label: "Quote Requests", value: "quote requests" },
                { label: "Email Sign-ups", value: "email sign-ups" },
                { label: "Free Trial Sign-ups", value: "free trial" },
                { label: "Content Downloads", value: "content downloads" },
                { label: "Brand Awareness", value: "brand awareness" },
              ],
            },
            {
              name: "secondaryConversionGoal",
              type: "select",
              admin: {
                description: "Secondary conversion goal",
              },
              options: [
                { label: "Lead Generation", value: "lead generation" },
                { label: "Phone Calls", value: "phone calls" },
                { label: "Form Submissions", value: "form submissions" },
                { label: "E-commerce Sales", value: "e-commerce" },
                { label: "Bookings / Appointments", value: "bookings" },
                { label: "Quote Requests", value: "quote requests" },
                { label: "Email Sign-ups", value: "email sign-ups" },
                { label: "Free Trial Sign-ups", value: "free trial" },
                { label: "Content Downloads", value: "content downloads" },
                { label: "Brand Awareness", value: "brand awareness" },
              ],
            },
            {
              name: "monthlyRetainer",
              type: "number",
              min: 0,
              admin: {
                description: "Monthly revenue amount ($)",
                step: 1,
                condition: (data: any) => !data?.isAgency,
              },
            },
            {
              name: "oneOffProjects",
              type: "array",
              admin: {
                description: "One-off projects (website builds, audits, etc.)",
                condition: (data: any) => !data?.isAgency,
              },
              fields: [
                {
                  name: "projectName",
                  type: "text",
                  required: true,
                  admin: {
                    description: "Project name",
                  },
                },
                {
                  name: "amount",
                  type: "number",
                  required: true,
                  min: 0,
                  admin: {
                    description: "Project amount ($)",
                    step: 1,
                  },
                },
                {
                  name: "date",
                  type: "date",
                  required: true,
                  admin: {
                    description: "Project date",
                  },
                },
              ],
            },
            {
              name: "googleAdsCustomerId",
              type: "text",
              admin: {
                description: "Google Ads customer ID (e.g. 955-493-5739). Client must grant access to the Optimise Digital MCC.",
              },
            },
            {
              name: "notes",
              type: "textarea",
              admin: {
                description: "Goals, notes, and context about this client",
              },
            },
            {
              name: "retainerHistory",
              type: "array",
              admin: {
                readOnly: true,
                description: "Automatic log of revenue changes",
              },
              fields: [
                { name: "amount", type: "number" },
                { name: "previousAmount", type: "number" },
                { name: "effectiveDate", type: "date" },
                { name: "changedBy", type: "text" },
              ],
            },
          ],
        },
        {
          label: "Analysis",
          fields: [
            {
              type: "row",
              fields: [
                {
                  name: "businessType",
                  type: "select",
                  admin: {
                    description: "Type of business — used for report weighting and presentation",
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
                  name: "targetLocation",
                  type: "text",
                  admin: {
                    description: "Primary target location for rankings (e.g., 'Sydney, Australia')",
                  },
                },
              ],
            },
            {
              name: "clientGoals",
              type: "textarea",
              admin: {
                description: "Client objectives — what they want to achieve (shown in report intro)",
              },
            },
            {
              name: "keywords",
              type: "textarea",
              admin: {
                description: "Consolidated keyword list (one per line)",
              },
            },
            {
              name: "tam",
              type: "richText",
              admin: {
                description: "Total Addressable Market data",
              },
            },
            {
              type: "row",
              fields: [
                {
                  name: "leadConversionRate",
                  type: "number",
                  min: 0,
                  max: 100,
                  admin: {
                    description: "Website visitor → lead conversion rate (%)",
                    step: 0.1,
                  },
                },
                {
                  name: "leadToSaleConversionRate",
                  type: "number",
                  min: 0,
                  max: 100,
                  admin: {
                    description: "Lead → paying client conversion rate (%)",
                    step: 0.1,
                  },
                },
                {
                  name: "averageOrderValue",
                  type: "number",
                  min: 0,
                  admin: {
                    description: "Average order / client value ($)",
                    step: 1,
                  },
                },
              ],
            },
            {
              type: "row",
              fields: [
                {
                  name: "annualPurchaseFrequency",
                  type: "number",
                  min: 0,
                  admin: {
                    description: "Annual purchase frequency",
                    step: 0.1,
                  },
                },
                {
                  name: "newCustomersLast12Months",
                  type: "number",
                  min: 0,
                  admin: {
                    description: "New customers acquired in the last 12 months",
                    step: 1,
                  },
                },
              ],
            },
            {
              name: "runGoogleAdsAudit",
              type: "ui",
              admin: {
                components: {
                  Field: "./components/RunGoogleAdsAuditFromClientButton",
                },
              },
            },
            {
              name: "googleAdsAudits",
              type: "join",
              collection: "google-ads-audits",
              on: "client",
              admin: {
                description: "Google Ads audits linked to this client",
                defaultColumns: ["businessName", "overallScore", "auditStatus", "createdAt"],
              },
            },
            {
              name: "competitors",
              type: "array",
              maxRows: 5,
              admin: {
                description: "Competitor businesses to benchmark against (up to 5)",
              },
              fields: [
                {
                  name: "name",
                  type: "text",
                  required: true,
                  admin: {
                    description: "Competitor business name",
                  },
                },
                {
                  name: "websiteUrl",
                  type: "text",
                  admin: {
                    description: "Competitor website URL",
                  },
                },
                {
                  name: "googleMapsUrl",
                  type: "text",
                  admin: {
                    description: "Google Maps listing URL for GBP analysis",
                  },
                },
              ],
            },
          ],
        },
        {
          label: "Blog Settings",
          fields: [
            {
              name: "blogCategories",
              type: "textarea",
              admin: {
                description: "Blog categories for this client (one per line)",
              },
            },
            {
              name: "blogTags",
              type: "textarea",
              admin: {
                description: "Available tags for this client (one per line)",
              },
            },
            {
              name: "servicePages",
              type: "textarea",
              admin: {
                description: "Service or product/category pages for this client (one per line). Used to auto-populate the blog prompt requirements.",
              },
            },
          ],
        },
        {
          label: "Blog Posts",
          fields: [
            {
              name: "clientBlogPosts",
              type: "ui",
              admin: {
                components: {
                  Field: "./components/ClientBlogPostsList",
                },
              },
            },
          ],
        },
        {
          label: "Authors",
          fields: [
            {
              name: "authors",
              type: "array",
              maxRows: 10,
              admin: {
                description: "Author profiles for this client (up to 10)",
              },
              fields: [
                {
                  name: "name",
                  type: "text",
                  required: true,
                  admin: {
                    description: "Author's display name",
                  },
                },
                {
                  name: "jobTitle",
                  type: "text",
                  admin: {
                    description: "Author's job title (e.g., 'Senior SEO Strategist')",
                  },
                },
                {
                  name: "blurb",
                  type: "textarea",
                  admin: {
                    description: "Short bio or description of the author",
                  },
                },
                {
                  name: "image",
                  type: "upload",
                  relationTo: "media",
                  admin: {
                    description: "Author's profile photo",
                  },
                },
                {
                  name: "expertiseTags",
                  type: "array",
                  admin: {
                    description: "Tags highlighting this author's areas of expertise",
                  },
                  fields: [
                    {
                      name: "tag",
                      type: "text",
                      required: true,
                    },
                  ],
                },
                {
                  name: "socialLinks",
                  type: "array",
                  maxRows: 6,
                  admin: {
                    description: "Social media and website links",
                  },
                  fields: [
                    {
                      name: "platform",
                      type: "select",
                      required: true,
                      options: [
                        { label: "Website", value: "website" },
                        { label: "LinkedIn", value: "linkedin" },
                        { label: "Twitter / X", value: "twitter" },
                        { label: "Facebook", value: "facebook" },
                        { label: "Instagram", value: "instagram" },
                        { label: "YouTube", value: "youtube" },
                      ],
                    },
                    {
                      name: "url",
                      type: "text",
                      required: true,
                      admin: {
                        description: "Full URL (e.g., 'https://linkedin.com/in/johndoe')",
                      },
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          label: "Search Console",
          fields: [
            {
              name: "gscConnected",
              type: "checkbox",
              defaultValue: false,
              admin: {
                readOnly: true,
                description: "Whether Google Search Console is connected",
              },
            },
            {
              name: "gscPropertyUrl",
              type: "text",
              admin: {
                readOnly: true,
                description: "The connected GSC property URL",
              },
            },
            {
              name: "gscAccessToken",
              type: "text",
              admin: {
                disabled: true,
                hidden: true,
              },
            },
            {
              name: "gscRefreshToken",
              type: "text",
              admin: {
                disabled: true,
                hidden: true,
              },
            },
            {
              name: "gscTokenExpiry",
              type: "date",
              admin: {
                disabled: true,
                hidden: true,
              },
            },
            {
              name: "brandKeywords",
              type: "textarea",
              admin: {
                description:
                  "Comma-separated brand terms to filter out from generic query analysis (e.g., 'optimise digital, optimisedigital, od agency')",
              },
            },
            {
              name: "gscLastSync",
              type: "date",
              admin: {
                readOnly: true,
                description: "Last successful GSC data sync",
              },
            },
            {
              name: "latestGscSnapshot",
              type: "relationship",
              relationTo: "gsc-snapshots",
              admin: {
                readOnly: true,
                description: "Most recent GSC data snapshot",
              },
            },
          ],
        },
      ],
    },
  ],
};
