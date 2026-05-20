/**
 * Contract template — generates structured content for PDF and signing page rendering.
 * Matches the Berendsen-style contract layout.
 */
import { parseTierTable, type TierTable } from "./tier-table";

export type CurrencyCode = "AUD" | "USD" | "GBP" | "EUR" | "NZD" | "CAD" | "SGD";

const CURRENCY_LOCALE: Record<CurrencyCode, string> = {
  AUD: "en-AU",
  USD: "en-US",
  GBP: "en-GB",
  EUR: "en-IE",
  NZD: "en-NZ",
  CAD: "en-CA",
  SGD: "en-SG",
};

export interface ContractData {
  contractTitle: string;
  clientName: string;
  clientContactName?: string;
  clientEmail: string;
  clientTitle?: string;
  clientPhone?: string;
  clientWebsite?: string;
  contractDate: string;
  contractStartDate?: string;
  /** Optional engagement end date. When set, the cover page renders an "End Date:" line below the effective date. When undefined the line is omitted entirely. */
  contractEndDate?: string;
  monthlyRetainer?: number;
  setupFee?: number;
  /** When true the setup-fee row is omitted from the pricing table and the matching default Payment Terms bullet is removed. */
  hideSetupFee?: boolean;
  monthlyHosting?: number;
  annualHosting?: number;
  /** Additional one-off work items rendered as extra rows in the pricing table. Only rows with a non-empty projectName are shown. */
  additionalWork?: Array<{
    projectName?: string | null;
    amount?: number | null;
    countTowardsRetainer?: boolean | null;
  }> | null;
  currency?: CurrencyCode;
  /** When true the cover page hides the "(to be confirmed with client)" qualifier. Takes precedence over `effectiveDateOnDeposit`. */
  effectiveDateConfirmed?: boolean;
  /** When true (and effectiveDateConfirmed is false) the cover page shows "(once the deposit has been paid)" instead of the default qualifier. */
  effectiveDateOnDeposit?: boolean;
  contractTerm?: string;
  paymentTerms?: string;
  pricingNotes?: string;
  paymentTermsOverride?: string;
  terminationOverride?: string;
  terminationOverrideNodes?: any[];
  scopeOfWork?: string;
  agencyContactName?: string;
  agencyContactEmail?: string;
  agencyContactPhone?: string;
  agencySignerName?: string;
  agencySignerTitle?: string;
  agencySignature?: string;
  agencySignedAt?: string;
  clientSignerName?: string;
  clientSignature?: string;
  clientSignedAt?: string;
  // Raw Lexical nodes for rich text rendering in PDF
  scopeOfWorkNodes?: any[];
  pricingNotesNodes?: any[];
  paymentTermsOverrideNodes?: any[];

  // Annual Review & Tier Adjustment section (optional, gated by toggle)
  annualReviewEnabled?: boolean;
  annualReviewIntro?: string;
  annualReviewIntroNodes?: any[];
  /**
   * Per-contract toggle for the tier table inside the Annual Review section.
   * Defaults to `true` when omitted so existing contracts (and callers that
   * haven't been updated yet) keep their table rendered. Set to `false` on
   * contracts where tier-based adjustments don't apply (e.g. flat-retainer
   * clients) and the intro / notice / good-faith / acceptance paragraphs
   * should still render around an empty middle.
   */
  annualReviewTierTableEnabled?: boolean;
  annualReviewTierTableText?: string;
  annualReviewNotice?: string;
  annualReviewNoticeNodes?: any[];
  annualReviewGoodFaithReview?: string;
  annualReviewGoodFaithReviewNodes?: any[];
  annualReviewAcceptance?: string;
  annualReviewAcceptanceNodes?: any[];
}

export interface ContractSection {
  type:
    | "cover"
    | "heading"
    | "subheading"
    | "paragraph"
    | "bullets"
    | "table"
    | "pricingBlock"
    | "tierTable"
    | "signatures"
    | "richtext"
    | "pageBreak";
  heading?: string;
  /** Optional h4 sub-heading rendered immediately before a richtext section. */
  subHeading?: string;
  content?: string;
  lexicalNodes?: any[];
  items?: string[];
  rows?: { label: string; value: string }[];
  /** Column headers for `table` sections. Defaults to ['', 'Amount']. */
  tableHeaders?: { label: string; value: string };
  /** Pricing block — heading + table rendered together so the PDF renderer keeps them on the same page. */
  pricingBlock?: {
    heading: string;
    rows: { label: string; value: string }[];
    tableHeaders: { label: string; value: string };
  };
  tierTable?: TierTable;
  signatures?: {
    client: {
      /** Company name shown on the "Client:" header line at the bottom of the
       *  contract. Not the signer's personal name — that's `name`. */
      companyName?: string;
      name?: string;
      title?: string;
      signature?: string;
      date?: string;
    };
    provider: {
      /** Company name shown on the "Service Provider:" header line. */
      companyName?: string;
      name?: string;
      title?: string;
      signature?: string;
      date?: string;
    };
  };
  cover?: {
    title: string;
    subtitle: string;
    clientName: string;
    clientContactName?: string;
    clientEmail: string;
    clientTitle?: string;
    clientPhone?: string;
    clientWebsite?: string;
    agencyName: string;
    agencyContactName?: string;
    agencyContactEmail?: string;
    agencyContactPhone?: string;
    /** Reused on the cover next to the agency contact-person field. The agency
     *  contact and the agency signer are the same person in practice, so we
     *  surface the signer title here rather than maintain a separate field. */
    agencySignerTitle?: string;
    effectiveDate: string;
    effectiveDateConfirmed?: boolean;
    effectiveDateOnDeposit?: boolean;
    /** Pre-formatted end date string. Undefined when no contractEndDate was supplied — the cover page must hide the line in that case. */
    endDate?: string;
  };
}

export function formatCurrency(amount: number, currency: CurrencyCode = "AUD"): string {
  const locale = CURRENCY_LOCALE[currency] ?? "en-AU";
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString("en-AU", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

export function generateContractSections(data: ContractData): ContractSection[] {
  const sections: ContractSection[] = [];
  const agencyName = "Optimise Digital";

  // Cover page
  sections.push({
    type: "cover",
    cover: {
      title: "Contract Agreement",
      subtitle: `Between ${agencyName} And ${data.clientName}`,
      clientName: data.clientName,
      clientContactName: data.clientContactName,
      clientEmail: data.clientEmail,
      clientTitle: data.clientTitle,
      clientPhone: data.clientPhone,
      clientWebsite: data.clientWebsite,
      agencyName,
      agencyContactName: data.agencyContactName || "Peter Tu",
      agencyContactEmail: data.agencyContactEmail || "peter@optimisedigital.online",
      agencyContactPhone: data.agencyContactPhone || "0493053188",
      agencySignerTitle: data.agencySignerTitle,
      effectiveDate: formatDate(data.contractDate),
      effectiveDateConfirmed: data.effectiveDateConfirmed === true,
      effectiveDateOnDeposit: data.effectiveDateOnDeposit === true,
      // Only set endDate when the operator entered one. The cover-page
      // renderers check for undefined and skip the line entirely otherwise
      // — contracts without an end date show no change from before.
      ...(data.contractEndDate && data.contractEndDate.trim() !== ""
        ? { endDate: formatDate(data.contractEndDate) }
        : {}),
    },
  });

  // Scope of Work — starts on a new page in the PDF so the deliverables read
  // as their own section after the cover.
  if (data.scopeOfWork || data.scopeOfWorkNodes) {
    sections.push({ type: "pageBreak" });
    sections.push({
      type: "heading",
      heading: "Scope of Work",
    });
    sections.push({
      type: "richtext",
      content: data.scopeOfWork,
      lexicalNodes: data.scopeOfWorkNodes,
    });
  }

  // Pricing — starts on a new page in the PDF so the pricing table always
  // reads as a fresh section after Scope of Work.
  sections.push({ type: "pageBreak" });
  // Row order (per contract spec):
  //   1. Additional Work projects (only rows with a non-empty projectName)
  //   2. One-time setup fee (unless hideSetupFee is ON)
  //   3. Monthly management retainer
  //   4. Monthly / annual hosting
  const ccy = (data.currency ?? "AUD") as CurrencyCode;
  const pricingRows: { label: string; value: string }[] = [];
  if (Array.isArray(data.additionalWork)) {
    for (const item of data.additionalWork) {
      const label = item?.projectName?.trim();
      if (!label) continue;
      pricingRows.push({
        label,
        value: formatCurrency(item?.amount ?? 0, ccy),
      });
    }
  }
  if (!data.hideSetupFee) {
    pricingRows.push({
      label: "One-time setup fee",
      value: formatCurrency(data.setupFee ?? 0, ccy),
    });
  }
  if (data.monthlyRetainer) {
    pricingRows.push({
      label: "Monthly management retainer",
      value: `${formatCurrency(data.monthlyRetainer, ccy)}/month`,
    });
  }
  if (data.monthlyHosting) {
    pricingRows.push({
      label: "Monthly hosting",
      value: `${formatCurrency(data.monthlyHosting, ccy)}/month`,
    });
  }
  if (data.annualHosting) {
    pricingRows.push({
      label: "Annual hosting",
      value: `${formatCurrency(data.annualHosting, ccy)}/year`,
    });
  }
  if (pricingRows.length > 0) {
    // Emit heading + table as ONE section so the PDF renderer can keep them
    // on the same page (avoids the dangling-rule break shown in screenshots).
    sections.push({
      type: "pricingBlock",
      pricingBlock: {
        heading: "Pricing",
        rows: pricingRows,
        tableHeaders: { label: "Service", value: `Amount (${ccy})` },
      },
    });
  }

  // Pricing Notes (rich text, rendered like scope of work)
  if (data.pricingNotes || data.pricingNotesNodes) {
    sections.push({
      type: "richtext",
      content: data.pricingNotes,
      lexicalNodes: data.pricingNotesNodes,
    });
  }

  // Payment Terms — use override if provided, otherwise exact wording from
  // the contract PDF. Flows on the same page as Pricing (no page break) so
  // they read as one billing-related section.
  sections.push({
    type: "heading",
    heading: "Payment Terms:",
  });
  if (data.paymentTermsOverride || data.paymentTermsOverrideNodes) {
    sections.push({
      type: "richtext",
      content: data.paymentTermsOverride,
      lexicalNodes: data.paymentTermsOverrideNodes,
    });
  } else {
    const setupAmount = formatCurrency(data.setupFee ?? 0, ccy);
    const retainerAmount = formatCurrency(data.monthlyRetainer ?? 0, ccy);
    const monthlyHostingAmount = data.monthlyHosting ? formatCurrency(data.monthlyHosting, ccy) : null;
    const annualHostingAmount = data.annualHosting ? formatCurrency(data.annualHosting, ccy) : null;
    const items: string[] = [];
    if (!data.hideSetupFee) {
      items.push(`The one-time setup fee of ${setupAmount} is payable upon signing of this contract.`);
    }
    items.push(
      `The monthly retainer of ${retainerAmount} will be invoiced on the first day of each month. If the engagement begins partway through a calendar month, the first month's retainer will be pro-rated based on the number of remaining days in that month. From the following month onward, the full monthly retainer will be invoiced on the 1st of each month.`,
    );
    if (monthlyHostingAmount) {
      items.push(`The monthly hosting fee of ${monthlyHostingAmount} will be invoiced alongside the monthly retainer.`);
    }
    if (annualHostingAmount) {
      items.push(`The annual hosting fee of ${annualHostingAmount} will be invoiced yearly on the anniversary of the contract start date.`);
    }
    items.push(
      "Invoices are due within 14 days of issue.",
      "This contract will automatically renew on a rolling monthly basis unless terminated by either party with a 30-day written notice.",
    );
    sections.push({
      type: "bullets",
      items,
    });
  }

  // Annual Review & Tier Adjustment (optional). Sits directly after Payment
  // Terms so the billing-related clauses read as one continuous section.
  if (data.annualReviewEnabled) {
    sections.push({
      type: "heading",
      heading: "Annual Review and Adjustment",
    });
    if (data.annualReviewIntro || data.annualReviewIntroNodes) {
      sections.push({
        type: "richtext",
        content: data.annualReviewIntro,
        lexicalNodes: data.annualReviewIntroNodes,
      });
    }
    // Tier table is gated by both the section toggle (annualReviewEnabled,
    // checked above) and a nested toggle (annualReviewTierTableEnabled).
    // The nested toggle defaults to TRUE — explicit `false` hides the table
    // for flat-retainer contracts while keeping the surrounding paragraphs.
    const tierTableEnabled = data.annualReviewTierTableEnabled !== false;
    const parsedTierTable = tierTableEnabled
      ? parseTierTable(data.annualReviewTierTableText)
      : null;
    if (parsedTierTable) {
      sections.push({
        type: "tierTable",
        tierTable: parsedTierTable,
      });
    }
    if (data.annualReviewNotice || data.annualReviewNoticeNodes) {
      sections.push({
        type: "richtext",
        content: data.annualReviewNotice,
        lexicalNodes: data.annualReviewNoticeNodes,
      });
    }
    if (data.annualReviewGoodFaithReview || data.annualReviewGoodFaithReviewNodes) {
      sections.push({
        type: "richtext",
        subHeading: "Good Faith Review",
        content: data.annualReviewGoodFaithReview,
        lexicalNodes: data.annualReviewGoodFaithReviewNodes,
      });
    }
    if (data.annualReviewAcceptance || data.annualReviewAcceptanceNodes) {
      sections.push({
        type: "richtext",
        subHeading: "Acceptance of Adjustment",
        content: data.annualReviewAcceptance,
        lexicalNodes: data.annualReviewAcceptanceNodes,
      });
    }
  }

  // Termination
  if (data.terminationOverride || data.terminationOverrideNodes) {
    sections.push({
      type: "heading",
      heading: "Termination:",
    });
    sections.push({
      type: "richtext",
      content: data.terminationOverride,
      lexicalNodes: data.terminationOverrideNodes,
    });
  } else {
    sections.push({
      type: "heading",
      heading: "Termination:",
    });
    sections.push({
      type: "bullets",
      items: [
        "Either party may terminate this contract with a 30-day written notice.",
        "Upon termination, the Client agrees to pay for all services rendered up to the termination date.",
        "Upon termination, Optimise Digital will provide the Client with full access to and ownership of all Google Ads campaigns, conversion tracking, and assets created during the engagement.",
      ],
    });
  }

  // Confidentiality — starts on a new page in the PDF so the legal clause
  // reads as its own section.
  sections.push({ type: "pageBreak" });
  sections.push({
    type: "heading",
    heading: "Confidentiality:",
  });
  sections.push({
    type: "bullets",
    items: [
      `Either party may disclose Confidential Information to the other. "Confidential Information" includes all non-public information about the Disclosing Party's business, technology, structure, and strategies, whether conveyed orally or in tangible form, and whether or not marked as "confidential." The Recipient will keep the Confidential Information in trust, not disclose it to others, and ensure that its employees, agents, or any persons under its direction do the same, indefinitely.`,
    ],
  });

  // Acceptance and Signature
  sections.push({
    type: "heading",
    heading: "Acceptance and Signature:",
  });
  sections.push({
    type: "paragraph",
    content:
      "By signing below, both parties consent to executing this agreement electronically under the Electronic Transactions Act 1999 (Cth) and agree that electronic signatures are the legal equivalent of manual signatures. Both parties agree to the terms and conditions outlined in this contract.",
  });
  sections.push({
    type: "signatures",
    signatures: {
      client: {
        companyName: data.clientName,
        name: data.clientSignerName || data.clientContactName,
        title: data.clientTitle,
        signature: data.clientSignature,
        date: data.clientSignedAt ? formatDate(data.clientSignedAt) : undefined,
      },
      provider: {
        companyName: agencyName + " Pty Ltd",
        name: data.agencySignerName,
        title: data.agencySignerTitle,
        signature: data.agencySignature,
        date: data.agencySignedAt ? formatDate(data.agencySignedAt) : undefined,
      },
    },
  });

  return sections;
}
