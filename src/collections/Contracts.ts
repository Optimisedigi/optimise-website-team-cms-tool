import type { CollectionConfig } from "payload";
import crypto from "crypto";
import { logActivity } from "../lib/activity-log";

export const Contracts: CollectionConfig = {
  slug: "contracts",
  labels: {
    singular: "Contract",
    plural: "Contracts",
  },
  admin: {
    useAsTitle: "contractTitle",
    group: "Performance",
    description: "Service contracts linked to client proposals",
    defaultColumns: ["contractTitle", "clientName", "status", "contractDate", "createdAt"],
    components: {
      beforeListTable: ["./components/CreateFromTemplateButton"],
    },
  },
  access: {
    read: ({ req }) => !!req.user,
    create: ({ req }) => !!req.user,
    update: ({ req }) => !!req.user,
    delete: ({ req }) => req.user?.role === "admin",
  },
  hooks: {
    beforeChange: [
      async ({ data, operation }) => {
        if (operation === "create" && data) {
          if (!data.signingToken) {
            data.signingToken = crypto.randomBytes(48).toString("hex");
          }
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
              type: "row",
              fields: [
                {
                  name: "monthlyRetainer",
                  type: "number",
                  min: 0,
                  admin: {
                    description: "Monthly retainer ($)",
                    step: 1,
                  },
                },
                {
                  name: "setupFee",
                  type: "number",
                  min: 0,
                  admin: {
                    description: "One-time setup fee ($)",
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
                description: "Deliverables and scope of work",
              },
            },
            {
              name: "paymentTermsOverride",
              type: "richText",
              admin: {
                description: "If filled in, this replaces the default payment terms section entirely",
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
