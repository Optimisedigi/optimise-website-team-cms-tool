import type { CollectionConfig } from "payload";
import crypto from "crypto";
import { logActivity } from "../lib/activity-log";
import { canAccess, adminOnlyDelete, hideUnlessFeature } from "../lib/access";
import { ANNUAL_REVIEW_DEFAULTS } from "../lib/tier-table";

/**
 * Wrap a plain-text default in a minimal Lexical rich-text root so
 * Payload's richText field accepts it. Each blank line in the source
 * becomes a separate paragraph node.
 */
function plainTextToLexical(text: string): Record<string, unknown> {
  const paragraphs = text.split(/\n+/).filter((p) => p.trim().length > 0);
  return {
    root: {
      type: "root",
      format: "",
      indent: 0,
      version: 1,
      direction: "ltr",
      children: paragraphs.map((para) => ({
        type: "paragraph",
        format: "",
        indent: 0,
        version: 1,
        direction: "ltr",
        textFormat: 0,
        textStyle: "",
        children: [
          {
            type: "text",
            format: 0,
            mode: "normal",
            style: "",
            text: para,
            detail: 0,
            version: 1,
          },
        ],
      })),
    },
  };
}

/**
 * When `annualReviewEnabled` flips on and the four supporting fields are
 * empty, seed them with boilerplate defaults from `ANNUAL_REVIEW_DEFAULTS`.
 * Subsequent edits are preserved — we only fill blanks.
 */
function seedAnnualReviewDefaults(data: Record<string, unknown>): void {
  if (!data.annualReviewEnabled) return;

  if (data.annualReviewIntro == null) {
    data.annualReviewIntro = plainTextToLexical(ANNUAL_REVIEW_DEFAULTS.intro);
  }
  if (typeof data.annualReviewTierTableText !== "string" || data.annualReviewTierTableText.trim() === "") {
    data.annualReviewTierTableText = ANNUAL_REVIEW_DEFAULTS.tierTable;
  }
  if (data.annualReviewNotice == null) {
    data.annualReviewNotice = plainTextToLexical(ANNUAL_REVIEW_DEFAULTS.noticeParagraph);
  }
  if (data.annualReviewGoodFaithReview == null) {
    data.annualReviewGoodFaithReview = plainTextToLexical(
      ANNUAL_REVIEW_DEFAULTS.goodFaithReview,
    );
  }
  if (data.annualReviewAcceptance == null) {
    data.annualReviewAcceptance = plainTextToLexical(
      ANNUAL_REVIEW_DEFAULTS.acceptanceOfAdjustment,
    );
  }
}

export const Contracts: CollectionConfig = {
  slug: "contracts",
  labels: {
    singular: "Contract",
    plural: "Contracts",
  },
  admin: {
    useAsTitle: "contractTitle",
    group: "Clients",
    description: "Service contracts linked to client proposals",
    defaultColumns: ["contractTitle", "clientName", "status", "contractDate", "createdAt"],
    components: {
      beforeListTable: ["./components/CreateFromTemplateButton"],
    },
    hidden: hideUnlessFeature("contracts"),
  },
  access: {
    read: canAccess("contracts"),
    create: canAccess("contracts"),
    update: canAccess("contracts"),
    delete: adminOnlyDelete,
  },
  hooks: {
    beforeChange: [
      async ({ data, operation }) => {
        if (operation === "create" && data) {
          if (!data.signingToken) {
            data.signingToken = crypto.randomBytes(48).toString("hex");
          }
        }
        if (data) {
          seedAnnualReviewDefaults(data as Record<string, unknown>);
        }
        return data;
      },
    ],
    afterChange: [
      async ({ doc, operation, req }) => {
        if (operation === "create") {
          logActivity(req.payload, {
            type: "contract_created",
            title: `Contract created: ${doc.contractTitle || "Untitled"}`,
            description: doc.clientName || "",
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
          label: "Contract Details",
          fields: [
            {
              name: "contractTitle",
              type: "text",
              required: true,
              admin: {
                description: "Title for this contract (e.g. 'SEO Retainer Agreement')",
              },
            },
            {
              type: "row",
              fields: [
                {
                  name: "proposal",
                  type: "relationship",
                  relationTo: "client-proposals",
                  admin: {
                    description: "Linked client proposal",
                  },
                },
                {
                  name: "client",
                  type: "relationship",
                  relationTo: "clients",
                  admin: {
                    description: "Linked client (populated after conversion)",
                    readOnly: true,
                  },
                },
              ],
            },
            {
              type: "row",
              fields: [
                {
                  name: "clientName",
                  type: "text",
                  admin: {
                    description: "Business/company name (e.g. 'Berendsen Fluid Power Pty Ltd')",
                  },
                },
                {
                  name: "clientContactName",
                  type: "text",
                  admin: {
                    description: "Client contact person name",
                  },
                },
              ],
            },
            {
              type: "row",
              fields: [
                {
                  name: "clientEmail",
                  type: "email",
                  admin: {
                    description: "Client email",
                  },
                },
                {
                  name: "clientTitle",
                  type: "text",
                  admin: {
                    description: "Client job title (e.g. 'Managing Director')",
                  },
                },
              ],
            },
            {
              name: "clientPhone",
              type: "text",
              admin: {
                description: "Client phone number",
              },
            },
            {
              name: "clientWebsite",
              type: "text",
              admin: {
                description: "Client website URL (auto-populated from proposal)",
              },
            },
            {
              name: "contractDate",
              type: "date",
              required: true,
              admin: {
                description: "Date of contract",
              },
            },
            {
              name: "currency",
              type: "select",
              defaultValue: "AUD",
              admin: {
                description:
                  "Currency for all amounts on this contract. Shown in the pricing table header as 'Amount (CCY)' and used to format every monetary value.",
                width: "30%",
              },
              options: [
                { label: "AUD \u2014 Australian Dollar", value: "AUD" },
                { label: "USD \u2014 US Dollar", value: "USD" },
                { label: "GBP \u2014 British Pound", value: "GBP" },
                { label: "EUR \u2014 Euro", value: "EUR" },
                { label: "NZD \u2014 New Zealand Dollar", value: "NZD" },
                { label: "CAD \u2014 Canadian Dollar", value: "CAD" },
                { label: "SGD \u2014 Singapore Dollar", value: "SGD" },
              ],
            },
            {
              type: "row",
              fields: [
                {
                  name: "monthlyRetainer",
                  type: "number",
                  min: 0,
                  admin: {
                    description: "Monthly retainer",
                    step: 1,
                  },
                },
                {
                  name: "setupFee",
                  type: "number",
                  min: 0,
                  admin: {
                    description: "One-time setup fee",
                    step: 1,
                  },
                },
                {
                  name: "monthlyHosting",
                  type: "number",
                  min: 0,
                  admin: {
                    description: "Monthly hosting cost",
                    step: 1,
                  },
                },
              ],
            },
            {
              name: "pricingNotes",
              type: "richText",
              admin: {
                description: "Additional pricing details shown below the pricing table (e.g. bundle pricing, ad spend thresholds)",
              },
            },
            {
              type: "row",
              fields: [
                {
                  name: "contractTerm",
                  type: "text",
                  admin: {
                    description: "Contract term (e.g. '12 months')",
                  },
                },
                {
                  name: "paymentTerms",
                  type: "text",
                  admin: {
                    description: "Payment terms (e.g. 'Net 14')",
                  },
                },
              ],
            },
            {
              name: "scopeOfWork",
              type: "richText",
              admin: {
                description: "Deliverables and scope of work. Paste bullet lists (- item) or numbered lists (1. item) and they will auto-format.",
              },
            },
            {
              name: "paymentTermsOverride",
              type: "richText",
              admin: {
                description: "If filled in, this replaces the default payment terms section. Paste bullet lists (- item) or numbered lists (1. item) and they will auto-format.",
              },
            },
          ],
        },
        {
          label: "Annual Review & Tier Adjustment",
          description:
            "Optional section for tiered retainer adjustments based on media spend. When enabled, renders an intro paragraph, a tier table (paste straight from Excel/Sheets), a notice paragraph, a Good Faith Review paragraph, and an Acceptance of Adjustment paragraph \u2014 in that order \u2014 in the signing page, PDF, and Word export.",
          fields: [
            {
              name: "annualReviewEnabled",
              type: "checkbox",
              defaultValue: false,
              admin: {
                description:
                  "Toggle ON to include the Annual Review & Tier Adjustment section in this contract.",
              },
            },
            {
              name: "annualReviewIntro",
              type: "richText",
              admin: {
                description:
                  "Opening paragraph(s) explaining the tier structure. Default copy is pre-filled \u2014 edit per client as needed.",
                condition: (data) => Boolean(data?.annualReviewEnabled),
              },
            },
            {
              name: "annualReviewTierTableText",
              type: "textarea",
              admin: {
                description:
                  "Paste your tier table straight from Excel or Google Sheets. First line = column headers. Each subsequent line = one tier row. Cells are separated by Tab (what Sheets/Excel paste). Example: 'Trailing spend  |  Monthly retainer' on line 1, then 'Up to $60,000  |  $4,800' on line 2, etc. Supports any number of columns (e.g. AUD + USD).",
                condition: (data) => Boolean(data?.annualReviewEnabled),
                rows: 8,
              },
            },
            {
              name: "annualReviewNotice",
              type: "richText",
              admin: {
                description:
                  "Notice paragraph (e.g. 60-day written notice clause). Edit per client as needed.",
                condition: (data) => Boolean(data?.annualReviewEnabled),
              },
            },
            {
              name: "annualReviewGoodFaithReview",
              type: "richText",
              admin: {
                description:
                  "Good Faith Review paragraph. Default copy is pre-filled \u2014 usually unchanged across contracts.",
                condition: (data) => Boolean(data?.annualReviewEnabled),
              },
            },
            {
              name: "annualReviewAcceptance",
              type: "richText",
              admin: {
                description:
                  "Acceptance of Adjustment paragraph. Default copy is pre-filled \u2014 usually unchanged across contracts.",
                condition: (data) => Boolean(data?.annualReviewEnabled),
              },
            },
          ],
        },
        {
          label: "Agency Contact",
          fields: [
            {
              type: "row",
              fields: [
                {
                  name: "agencyContactName",
                  type: "text",
                  defaultValue: "Peter Tu",
                  admin: {
                    description: "Agency contact name on the contract",
                  },
                },
                {
                  name: "agencyContactEmail",
                  type: "email",
                  defaultValue: "peter@optimisedigital.online",
                  admin: {
                    description: "Agency contact email on the contract",
                  },
                },
              ],
            },
            {
              name: "agencyContactPhone",
              type: "text",
              defaultValue: "0493053188",
              admin: {
                description: "Agency contact phone on the contract",
              },
            },
          ],
        },
        {
          label: "Signatures",
          fields: [
            {
              type: "row",
              fields: [
                {
                  name: "agencySignerName",
                  type: "text",
                  admin: {
                    description: "Name of agency signer",
                  },
                },
                {
                  name: "agencySignerTitle",
                  type: "text",
                  admin: {
                    description: "Title of agency signer (e.g. 'Director')",
                  },
                },
              ],
            },
            {
              name: "agencySignature",
              type: "upload",
              relationTo: "media",
              admin: {
                description: "Upload agency signature image (PNG or JPEG with white background)",
              },
            },
            {
              type: "row",
              fields: [
                {
                  name: "agencySignedAt",
                  type: "date",
                  admin: {
                    readOnly: true,
                    description: "When agency signed",
                  },
                },
                {
                  name: "agencySignedIp",
                  type: "text",
                  admin: {
                    readOnly: true,
                    description: "IP address of agency signer",
                  },
                },
              ],
            },
            {
              name: "signContractButton",
              type: "ui",
              admin: {
                components: {
                  Field: "./components/AgencySignButton",
                },
              },
            },
            {
              name: "sendToClientButton",
              type: "ui",
              admin: {
                components: {
                  Field: "./components/SendContractButton",
                },
              },
            },
            {
              name: "sendEmailButton",
              type: "ui",
              admin: {
                components: {
                  Field: "./components/SendContractEmailButton",
                },
              },
            },
            {
              type: "row",
              fields: [
                {
                  name: "clientSignerName",
                  type: "text",
                  admin: {
                    readOnly: true,
                    description: "Name of client signer",
                  },
                },
                {
                  name: "clientSignature",
                  type: "textarea",
                  admin: {
                    hidden: true,
                    description: "Base64 PNG of client signature",
                  },
                },
              ],
            },
            {
              type: "row",
              fields: [
                {
                  name: "clientSignedAt",
                  type: "date",
                  admin: {
                    readOnly: true,
                    description: "When client signed",
                  },
                },
                {
                  name: "clientSignedIp",
                  type: "text",
                  admin: {
                    readOnly: true,
                    description: "IP address of client signer",
                  },
                },
              ],
            },
          ],
        },
        {
          label: "Final Document",
          fields: [
            {
              name: "signedPdfUrl",
              type: "text",
              admin: {
                readOnly: true,
                description: "URL of the signed contract PDF (Vercel Blob)",
              },
            },
            {
              name: "pdfHash",
              type: "text",
              admin: {
                readOnly: true,
                description: "SHA-256 hash of the signed PDF for document integrity verification",
              },
            },
            {
              name: "previewButton",
              type: "ui",
              admin: {
                components: {
                  Field: "./components/ContractPreviewButton",
                },
              },
            },
          ],
        },
      ],
    },
    // Sidebar fields
    {
      name: "status",
      type: "select",
      defaultValue: "draft",
      admin: {
        position: "sidebar",
        description: "Contract status",
      },
      options: [
        { label: "Draft", value: "draft" },
        { label: "Sent to Client", value: "sent" },
        { label: "Completed", value: "completed" },
      ],
    },
    {
      name: "signingToken",
      type: "text",
      unique: true,
      admin: {
        position: "sidebar",
        readOnly: true,
        description: "Secure token for client signing link",
      },
    },
    {
      name: "signingTokenExpiresAt",
      type: "date",
      admin: {
        position: "sidebar",
        readOnly: true,
        description: "When the signing link expires",
      },
    },
    {
      name: "sentAt",
      type: "date",
      admin: {
        position: "sidebar",
        readOnly: true,
        description: "When contract was sent to client",
      },
    },
    {
      name: "isTemplate",
      type: "checkbox",
      defaultValue: false,
      admin: {
        position: "sidebar",
        description: "Mark as a template contract (e.g. Google Ads). Duplicate to create new contracts.",
      },
    },
  ],
};
