import type { CollectionConfig } from "payload";
import crypto from "crypto";
import { logActivity } from "../lib/activity-log";
import { canAccess, adminOnlyDelete, hideUnlessFeature } from "../lib/access";
import { ANNUAL_REVIEW_DEFAULTS } from "../lib/tier-table";
import { scheduleContractReminders } from "../lib/contract-reminders";
import { validateClientEmails } from "../lib/contract-emails";

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
      beforeListTable: [
        "./components/CreateFromTemplateButton",
        "./components/ContractsTrashToggle",
      ],
      edit: {
        beforeDocumentControls: ["./components/ContractTrashActions"],
        editMenuItems: ["./components/ContractDeleteMenuItem"],
      },
    },
    hidden: hideUnlessFeature("contracts"),
    // Hide soft-deleted (trashed) contracts from the default list view.
    // When the user opens the Trash toggle, the page sets
    // `req.query.showTrash=true`, and the filter inverts to show only
    // trashed records.
    baseListFilter: ({ req }) => {
      const showTrash =
        (req.query as Record<string, unknown> | undefined)?.showTrash === "true";
      if (showTrash) {
        return { deletedAt: { exists: true } } as any;
      }
      return {
        or: [
          { deletedAt: { exists: false } },
          { deletedAt: { equals: null as any } },
        ],
      } as any;
    },
  },
  // Sort newest-first by default in the admin list view. Users can
  // override by clicking a column header.
  defaultSort: "-createdAt",
  access: {
    read: canAccess("contracts"),
    create: canAccess("contracts"),
    update: canAccess("contracts"),
    // Hard-delete is admin-only AND requires the purge context flag set
    // by our custom /api/contracts/[id]/purge and /api/contracts/trash-sweep
    // endpoints. This neutralises Payload's native Delete button — trashing
    // is the only path for ordinary users.
    delete: ({ req }) => {
      if (!req.user) return false;
      if (!(req.context as Record<string, unknown> | undefined)?.allowPurge) return false;
      return adminOnlyDelete({ req } as any);
    },
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
    // Belt-and-braces: even if a delete operation slips past the access
    // rule (e.g. local-API calls), block it unless the purge context flag
    // is set. Surfaces a clear error message instead of silent data loss.
    beforeDelete: [
      async ({ req }) => {
        if (!(req.context as Record<string, unknown> | undefined)?.allowPurge) {
          throw new Error(
            "Contracts cannot be hard-deleted directly. Use the Trash flow (Move to Trash → Delete Forever) or wait for the 30-day auto-purge.",
          );
        }
      },
    ],
    afterChange: [
      async ({ doc, previousDoc, operation, req }) => {
        if (operation === "create") {
          logActivity(req.payload, {
            type: "contract_created",
            title: `Contract created: ${doc.contractTitle || "Untitled"}`,
            description: doc.clientName || "",
            user: req.user?.id,
          }).catch(() => {});
        }

        // Reschedule the two annual-review reminders. Idempotent —
        // pending rows are replaced; sent/failed/skipped history is kept.
        // Best-effort: a scheduling failure must never block a contract save.
        try {
          await scheduleContractReminders(req.payload, {
            id: doc.id,
            contractDate: doc.contractDate,
            annualReviewReminderEnabled: doc.annualReviewReminderEnabled,
            annualReviewReminderRecipients: doc.annualReviewReminderRecipients,
          });
        } catch (err) {
          req.payload.logger?.error?.({
            msg: "scheduleContractReminders failed",
            contractId: doc.id,
            error: err instanceof Error ? err.message : String(err),
          });
        }

        // Re-run the contract→client sync when a client is newly linked
        // (or swapped) on the contract. Covers the case where the contract
        // was signed first, then a client record was created and linked
        // afterwards — without this hook, the client never receives the
        // contract's contact details, pricing, one-off projects, or the
        // signedContract relationship that drives the Business tab UI.
        //
        // Runs regardless of contract status: the sync's fill-only semantics
        // (don't overwrite when the client already has a value) protect
        // existing data, so it's safe to run on draft / sent / completed.
        //
        // Best-effort: a sync failure must not block the contract save.
        const resolveClientId = (rel: unknown): string | number | null => {
          if (rel == null) return null;
          if (typeof rel === "object" && rel !== null && "id" in rel) {
            const id = (rel as { id?: string | number }).id;
            return id ?? null;
          }
          if (typeof rel === "string" || typeof rel === "number") return rel;
          return null;
        };
        const newClientId = resolveClientId(doc.client);
        const prevClientId = resolveClientId(previousDoc?.client);
        const clientChanged = newClientId != null && newClientId !== prevClientId;
        if (operation === "update" && clientChanged) {
          try {
            const { syncContractToClient } = await import(
              "../lib/contract-to-client-sync"
            );
            const result = await syncContractToClient(req.payload, {
              id: doc.id,
              contractTitle: doc.contractTitle,
              client: doc.client,
              setupFee: doc.setupFee,
              monthlyRetainer: doc.monthlyRetainer,
              contractStartDate: doc.contractStartDate,
              contractDate: doc.contractDate,
              clientName: doc.clientName,
              clientContactName: doc.clientContactName,
              clientEmail: doc.clientEmail,
              clientWebsite: doc.clientWebsite,
              signedPdfUrl: doc.signedPdfUrl,
              additionalWork: doc.additionalWork,
            });
            req.payload.logger?.info?.({
              msg: "contract→client sync after link",
              contractId: doc.id,
              clientId: newClientId,
              status: doc.status,
              applied: result.applied,
              warnings: result.warnings,
              ok: result.ok,
              error: result.error,
            });
          } catch (err) {
            req.payload.logger?.error?.({
              msg: "contract→client sync after link failed",
              contractId: doc.id,
              clientId: newClientId,
              error: err instanceof Error ? err.message : String(err),
            });
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
                    description:
                      "Linked client. Auto-populated when a proposal converts to a client; manually selectable for direct-to-client contracts (no proposal in between).",
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
                  type: "text",
                  validate: (value: unknown) => validateClientEmails(value),
                  admin: {
                    description:
                      "Client email(s) \u2014 comma-separated. The first address is the signer shown on the contract; the rest are CC'd on the signing invite and signed receipt.",
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
              name: "contractStartDate",
              type: "date",
              admin: {
                description:
                  "Engagement effective date — used for retainer pro-ration when synced to the client on signature.",
              },
            },
            {
              name: "contractEndDate",
              type: "date",
              admin: {
                description:
                  "Optional engagement end date. When set, an ‘End Date’ line is rendered on the contract cover page below the effective date. Leave blank to hide the line entirely.",
              },
            },
            {
              type: "row",
              fields: [
                {
                  name: "effectiveDateConfirmed",
                  type: "checkbox",
                  defaultValue: false,
                  admin: {
                    description:
                      "Toggle ON once the effective date is confirmed with the client. When OFF, the cover page shows '(to be confirmed with client)' next to the date; when ON, the qualifier is hidden. The deposit toggle below overrides this.",
                  },
                },
                {
                  name: "effectiveDateOnDeposit",
                  type: "checkbox",
                  defaultValue: false,
                  admin: {
                    description:
                      "When ON: the cover page shows '(once the deposit has been paid)' next to the effective date, even if 'Effective date confirmed' is also ON. Use on jobs that require an upfront deposit before work starts.",
                  },
                },
              ],
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
                    description: "Monthly hosting cost (leave blank if billed annually)",
                    step: 1,
                  },
                },
                {
                  name: "annualHosting",
                  type: "number",
                  min: 0,
                  admin: {
                    description: "Annual hosting cost (leave blank if billed monthly)",
                    step: 1,
                  },
                },
              ],
            },
            {
              name: "hideSetupFee",
              type: "checkbox",
              defaultValue: false,
              admin: {
                description:
                  "When ON: the setup fee row is omitted from the pricing table and the matching Payment Terms bullet is removed. Use when an Additional Work project replaces the setup fee.",
              },
            },
            {
              name: "additionalWork",
              type: "array",
              admin: {
                description:
                  "Additional one-time work items (website builds, agent builds, audits). Copied to the client on signature.",
              },
              fields: [
                {
                  type: "row",
                  fields: [
                    {
                      name: "projectName",
                      type: "text",
                      required: true,
                      admin: {
                        description: "Project name",
                        width: "60%",
                      },
                    },
                    {
                      name: "amount",
                      type: "number",
                      required: true,
                      min: 0,
                      admin: {
                        description: "Amount",
                        step: 1,
                        width: "40%",
                      },
                    },
                  ],
                },
                {
                  name: "countTowardsRetainer",
                  type: "checkbox",
                  defaultValue: false,
                  admin: {
                    description:
                      "Toggle ON if this is part of the managing retainer (counts toward Retainer YTD on the client side).",
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
            {
              name: "terminationOverride",
              type: "richText",
              admin: {
                description:
                  "If filled in, this replaces the default termination section. Paste bullet lists (- item) or numbered lists (1. item) and they will auto-format.",
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
              name: "annualReviewTierTableEnabled",
              type: "checkbox",
              defaultValue: true,
              admin: {
                description:
                  "Toggle ON to include the trailing 3-month spend / tier retainer table inside this section. Turn OFF for clients on a flat retainer where tier-based adjustments don't apply — the intro, notice, good-faith, and acceptance paragraphs above and below still render.",
                condition: (data) => Boolean(data?.annualReviewEnabled),
              },
            },
            {
              name: "annualReviewTierTableText",
              type: "textarea",
              admin: {
                description:
                  "Spreadsheet-style tier table. The first row is the header (e.g. 'Trailing spend' / 'Monthly retainer'). Click any cell to edit; paste from Excel or Google Sheets into a cell to auto-fill multiple rows and columns. Stored as tab-separated text so existing renderers (PDF / HTML / Word) keep working.",
                condition: (data) =>
                  Boolean(data?.annualReviewEnabled) &&
                  data?.annualReviewTierTableEnabled !== false,
                components: {
                  Field: "./components/TierTableGridEditor",
                },
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
            {
              name: "annualReviewReminderEnabled",
              type: "checkbox",
              defaultValue: true,
              admin: {
                description:
                  "Send the selected user(s) two reminder emails before this contract's first anniversary (11 months and 11.5 months after the effective date).",
              },
            },
            {
              name: "annualReviewReminderRecipients",
              type: "relationship",
              relationTo: "users",
              hasMany: true,
              admin: {
                description:
                  "Admin users who receive the reminder email and in-CMS notification. Required when reminders are enabled.",
                condition: (data) => Boolean(data?.annualReviewReminderEnabled),
              },
              validate: (
                value: unknown,
                { siblingData }: { siblingData: Record<string, unknown> },
              ) => {
                const enabled = Boolean(
                  (siblingData as Record<string, unknown>)?.annualReviewReminderEnabled,
                );
                if (!enabled) return true;
                const arr = Array.isArray(value) ? value : [];
                if (arr.length === 0) {
                  return "At least one recipient is required when annual review reminders are enabled.";
                }
                return true;
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
    {
      name: "templateLabel",
      type: "text",
      admin: {
        position: "sidebar",
        description:
          "Short label shown on the 'Create from Template' button (e.g. 'E-Commerce', 'Google Ads'). Falls back to the contract title if blank.",
        condition: (data) => Boolean(data?.isTemplate),
      },
    },
    {
      name: "deletedAt",
      type: "date",
      index: true,
      admin: {
        position: "sidebar",
        readOnly: true,
        description:
          "Soft-delete timestamp. Trashed contracts are hidden from the default list and auto-purged 30 days after this date.",
        condition: (data) => Boolean(data?.deletedAt),
      },
    },
  ],
};
