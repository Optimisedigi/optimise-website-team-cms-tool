import type { CollectionConfig, CollectionAfterChangeHook } from "payload";

const convertToClientHook: CollectionAfterChangeHook = async ({
  doc,
  req,
  previousDoc,
}) => {
  if (doc.convertToClient && !previousDoc?.convertToClient) {
    const payload = req.payload;

    // Create a new Client from the proposal data
    await payload.create({
      collection: "clients",
      data: {
        name: doc.businessName,
        slug: doc.slug + "-client",
        websiteUrl: doc.websiteUrl,
        businessType: doc.businessType,
        targetLocation: doc.targetLocation,
        clientGoals: doc.businessGoals,
        competitors: doc.competitors,
        isActive: true,
        notes: `Converted from proposal: ${doc.businessName}`,
      },
    });

    // Reset the toggle so it can't be accidentally triggered again
    await payload.update({
      collection: "client-proposals",
      id: doc.id,
      data: { convertToClient: false },
    });
  }
  return doc;
};

/**
 * ClientProposals Collection
 *
 * Internal proposal system for prospects. Team enters prospect details,
 * runs audits, and shares a PIN for the prospect to view the report.
 */
export const ClientProposals: CollectionConfig = {
  slug: "client-proposals",
  labels: {
    singular: "Client Proposal",
    plural: "Client Proposals",
  },
  admin: {
    useAsTitle: "businessName",
    group: "Database",
    description: "Proposals for prospective clients",
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
  fields: [
    {
      type: "tabs",
      tabs: [
        {
          label: "Prospect",
          fields: [
            {
              name: "businessName",
              type: "text",
              required: true,
              admin: {
                description: "Prospect business name",
              },
            },
            {
              name: "slug",
              type: "text",
              required: true,
              unique: true,
              admin: {
                description:
                  "URL-friendly identifier (auto-generated from business name)",
              },
            },
            {
              name: "websiteUrl",
              type: "text",
              required: true,
              admin: {
                description: "Prospect website URL",
              },
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
              name: "businessType",
              type: "select",
              admin: {
                description:
                  "Type of business — used for audit weighting",
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
              name: "conversionGoal",
              type: "select",
              admin: {
                description:
                  "Primary conversion goal — used for CRO audit",
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
              name: "businessGoals",
              type: "textarea",
              admin: {
                description: "What the prospect wants to achieve",
              },
            },
            {
              name: "notes",
              type: "textarea",
              admin: {
                description: "Internal team notes",
              },
            },
          ],
        },
        {
          label: "Audit Inputs",
          fields: [
            {
              name: "keywords",
              type: "textarea",
              admin: {
                description: "One keyword per line — used for keyword tracking and competitor analysis",
              },
            },
            {
              name: "targetLocation",
              type: "select",
              admin: {
                description:
                  "Location for keyword tracking and competitor analysis",
                isSortable: false,
              },
              options: [
                // Australia
                { label: "Australia (National)", value: "au" },
                { label: "Sydney, NSW", value: "au:sydney" },
                { label: "Melbourne, VIC", value: "au:melbourne" },
                { label: "Brisbane, QLD", value: "au:brisbane" },
                { label: "Perth, WA", value: "au:perth" },
                { label: "Adelaide, SA", value: "au:adelaide" },
                { label: "Canberra, ACT", value: "au:canberra" },
                { label: "Hobart, TAS", value: "au:hobart" },
                { label: "Darwin, NT", value: "au:darwin" },
                // New Zealand
                { label: "New Zealand (National)", value: "nz" },
                { label: "Auckland, NZ", value: "nz:auckland" },
                { label: "Wellington, NZ", value: "nz:wellington" },
                // United States
                { label: "United States (National)", value: "us" },
                { label: "New York, NY", value: "us:new-york" },
                { label: "Los Angeles, CA", value: "us:los-angeles" },
                { label: "Chicago, IL", value: "us:chicago" },
                { label: "Houston, TX", value: "us:houston" },
                { label: "Miami, FL", value: "us:miami" },
                { label: "Atlanta, GA", value: "us:atlanta" },
                { label: "Seattle, WA", value: "us:seattle" },
                { label: "Denver, CO", value: "us:denver" },
                // Canada
                { label: "Canada (National)", value: "ca" },
                { label: "Toronto, ON", value: "ca:toronto" },
                { label: "Vancouver, BC", value: "ca:vancouver" },
                { label: "Montreal, QC", value: "ca:montreal" },
                // UK
                { label: "United Kingdom (National)", value: "gb" },
                { label: "London, UK", value: "gb:london" },
                { label: "Manchester, UK", value: "gb:manchester" },
                { label: "Birmingham, UK", value: "gb:birmingham" },
                // Singapore
                { label: "Singapore", value: "sg" },
              ],
            },
            {
              name: "suggestions",
              type: "textarea",
              admin: {
                description:
                  "One idea per line — these will appear at the bottom of the report as potential recommendations for the prospect",
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
                    description:
                      "Website visitor → lead conversion rate (%). Used for Mission Control slide.",
                    step: 0.1,
                  },
                },
                {
                  name: "leadToSaleConversionRate",
                  type: "number",
                  min: 0,
                  max: 100,
                  admin: {
                    description:
                      "Lead → paying client conversion rate (%). Used for Mission Control slide.",
                    step: 0.1,
                  },
                },
                {
                  name: "averageOrderValue",
                  type: "number",
                  min: 0,
                  admin: {
                    description:
                      "Average order / client value ($). Used for Mission Control slide.",
                    step: 1,
                  },
                },
              ],
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
                    description: "Google Maps listing URL",
                  },
                },
              ],
            },
          ],
        },
        {
          label: "Audit Results",
          fields: [
            {
              name: "runAudits",
              type: "ui",
              admin: {
                components: {
                  Field: "./components/RunAuditsButton",
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
              name: "auditStartedAt",
              type: "date",
              admin: {
                readOnly: true,
                description: "When audits were last kicked off",
              },
            },
            {
              name: "auditCompletedAt",
              type: "date",
              admin: {
                readOnly: true,
                description: "When audits finished",
              },
            },
            {
              name: "auditError",
              type: "textarea",
              admin: {
                readOnly: true,
                description: "Error details if audits failed",
              },
            },
            {
              type: "row",
              fields: [
                {
                  name: "seoAudit",
                  type: "relationship",
                  relationTo: "seo-audits",
                  admin: {
                    readOnly: true,
                    description: "Linked SEO audit",
                  },
                },
                {
                  name: "croAudit",
                  type: "relationship",
                  relationTo: "cro-audits",
                  admin: {
                    readOnly: true,
                    description: "Linked CRO audit",
                  },
                },
              ],
            },
            {
              type: "row",
              fields: [
                {
                  name: "keywordSnapshot",
                  type: "relationship",
                  relationTo: "keyword-snapshots",
                  admin: {
                    readOnly: true,
                    description: "Linked keyword snapshot",
                  },
                },
                {
                  name: "competitorAnalysis",
                  type: "relationship",
                  relationTo: "competitor-analyses",
                  admin: {
                    readOnly: true,
                    description: "Linked competitor analysis",
                  },
                },
              ],
            },
            {
              name: "contentResearch",
              type: "relationship",
              relationTo: "content-researches",
              hasMany: true,
              admin: {
                readOnly: true,
                description: "Linked content research results",
              },
            },
            {
              name: "viewReport",
              type: "ui",
              admin: {
                components: {
                  Field: "./components/ViewProposalReportLink",
                },
              },
            },
          ],
        },
        {
          label: "Post report input",
          fields: [
            {
              name: "flightPlan",
              type: "textarea",
              admin: {
                description:
                  "Editable flight plan content shown at the bottom of the report. One item per line. Falls back to suggestions if empty.",
              },
            },
            {
              name: "flightPlanImages",
              type: "array",
              maxRows: 10,
              admin: {
                description:
                  "Images displayed on the Flight Plan slide above the timeline. Add after the report is created.",
              },
              fields: [
                {
                  name: "image",
                  type: "upload",
                  relationTo: "media",
                  required: true,
                },
                {
                  name: "caption",
                  type: "text",
                  admin: {
                    description: "Optional caption for this image",
                  },
                },
              ],
            },
            {
              name: "contentResearchKeywords",
              type: "text",
              admin: {
                description:
                  "Comma-separated keywords to show on the Content Research slide. Leave blank to auto-select top 2 by search volume.",
              },
            },
            {
              name: "missionResources",
              type: "richText",
              admin: {
                description:
                  "Content for the Mission Resources slide. Supports bold, italic, underline formatting.",
              },
            },
            {
              name: "launchRequirements",
              type: "richText",
              admin: {
                description:
                  "Content for the Launch Requirements slide. Supports bold, italic, underline formatting.",
              },
            },
          ],
        },
      ],
    },
    {
      name: "convertToClient",
      type: "checkbox",
      defaultValue: false,
      admin: {
        position: "sidebar",
        description:
          "Toggle on and save to create an active Client from this proposal",
      },
    },
    {
      name: "proposalPin",
      type: "text",
      unique: true,
      admin: {
        position: "sidebar",
        description:
          "4-digit PIN for prospect report access (auto-generated)",
      },
      validate: (value: string | null | undefined) => {
        if (!value) return true;
        if (!/^\d{4}$/.test(value)) return "PIN must be exactly 4 digits";
        return true;
      },
      hooks: {
        beforeChange: [
          ({ value, operation }) => {
            if (operation === "create" && !value) {
              return String(Math.floor(1000 + Math.random() * 9000));
            }
            return value;
          },
        ],
      },
    },
  ],
  hooks: {
    afterChange: [convertToClientHook],
    beforeChange: [
      ({ data, operation }) => {
        if (data && operation === "create" && data.businessName && !data.slug) {
          data.slug = data.businessName
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "");
        }
        return data;
      },
    ],
  },
};
