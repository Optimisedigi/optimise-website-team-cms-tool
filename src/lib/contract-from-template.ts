import type { Payload } from "payload";

/**
 * Builds the `contracts` create payload for a fresh draft cloned from a
 * source contract (normally a template). Shared by the admin "Create from
 * Template" / "Duplicate" button and by AdminMate's confirmed contract
 * creation so both paths clone exactly the same fields.
 *
 * The new contract is never itself a template, never carries the template's
 * button label, and never inherits the source proposal or client — a template
 * clone is a blank draft until the caller overlays client details.
 */
export function buildContractDataFromSource(source: Record<string, any>): Record<string, unknown> {
  const newTitle = source.isTemplate
    ? source.contractTitle || "Untitled"
    : `Copy of ${source.contractTitle || "Untitled"}`;

  return {
    contractTitle: newTitle,
    isTemplate: false,
    templateLabel: null,
    status: "draft",
    contractDate: new Date().toISOString().split("T")[0],
    // Required DB columns — pass empty values for the new draft
    clientName: "",
    clientEmail: "placeholder@example.com",
    // Template content fields
    scopeOfWork: source.scopeOfWork || undefined,
    pricingNotes: source.pricingNotes || undefined,
    paymentTermsOverride: source.paymentTermsOverride || undefined,
    annualReviewEnabled: source.annualReviewEnabled || false,
    annualReviewIntro: source.annualReviewIntro || undefined,
    // Preserve the per-table toggle so duplicating a flat-retainer
    // contract doesn't accidentally re-introduce the tier table.
    // Coerce to a strict boolean so the column never lands as undefined.
    annualReviewTierTableEnabled: source.annualReviewTierTableEnabled !== false,
    annualReviewTierTableText: source.annualReviewTierTableText || undefined,
    annualReviewNotice: source.annualReviewNotice || undefined,
    annualReviewGoodFaithReview: source.annualReviewGoodFaithReview || undefined,
    annualReviewAcceptance: source.annualReviewAcceptance || undefined,
    // Annual review reminders — copy from template. If the template has no
    // recipients, force reminders off so the new draft passes validation
    // (the user can re-enable + pick recipients later).
    annualReviewReminderRecipients: Array.isArray(source.annualReviewReminderRecipients)
      ? source.annualReviewReminderRecipients.map((u: any) => (typeof u === "object" ? u?.id : u)).filter(Boolean)
      : [],
    annualReviewReminderEnabled:
      Boolean(source.annualReviewReminderEnabled) &&
      Array.isArray(source.annualReviewReminderRecipients) &&
      source.annualReviewReminderRecipients.length > 0,
    contractTerm: source.contractTerm || undefined,
    paymentTerms: source.paymentTerms || undefined,
    monthlyRetainer: source.monthlyRetainer ?? undefined,
    setupFee: source.setupFee ?? undefined,
    currency: source.currency ?? undefined,
    effectiveDateConfirmed: source.effectiveDateConfirmed ?? false,
    effectiveDateOnDeposit: source.effectiveDateOnDeposit ?? false,
    // Agency fields
    agencyContactName: source.agencyContactName || undefined,
    agencyContactEmail: source.agencyContactEmail || undefined,
    agencyContactPhone: source.agencyContactPhone || undefined,
    agencySignerName: source.agencySignerName || undefined,
    agencySignerTitle: source.agencySignerTitle || undefined,
    agencySignature: typeof source.agencySignature === "object"
      ? source.agencySignature?.id
      : source.agencySignature || undefined,
  };
}

/** Compact template shape surfaced to the admin UI and to AdminMate. */
export interface ContractTemplateOption {
  id: string;
  label: string;
  contractTitle: string;
  monthlyRetainer?: number;
  setupFee?: number;
  currency?: string;
  contractTerm?: string;
  paymentTerms?: string;
}

/** Live (non-trashed) contract templates, sorted by their button label. */
export async function listContractTemplates(payload: Payload): Promise<ContractTemplateOption[]> {
  const result = await payload.find({
    collection: "contracts",
    where: {
      and: [
        { isTemplate: { equals: true } },
        { or: [{ deletedAt: { exists: false } }, { deletedAt: { equals: null as any } }] },
      ],
    },
    limit: 50,
    depth: 0,
    overrideAccess: true,
    select: {
      contractTitle: true,
      templateLabel: true,
      monthlyRetainer: true,
      setupFee: true,
      currency: true,
      contractTerm: true,
      paymentTerms: true,
    },
  });
  return result.docs
    .map((doc) => ({
      id: String(doc.id),
      label: (typeof doc.templateLabel === "string" && doc.templateLabel.trim()) || doc.contractTitle || "Untitled template",
      contractTitle: doc.contractTitle || "Untitled template",
      monthlyRetainer: typeof doc.monthlyRetainer === "number" ? doc.monthlyRetainer : undefined,
      setupFee: typeof doc.setupFee === "number" ? doc.setupFee : undefined,
      currency: typeof doc.currency === "string" ? doc.currency : undefined,
      contractTerm: typeof doc.contractTerm === "string" && doc.contractTerm ? doc.contractTerm : undefined,
      paymentTerms: typeof doc.paymentTerms === "string" && doc.paymentTerms ? doc.paymentTerms : undefined,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}
