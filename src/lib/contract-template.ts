/**
 * Contract template — generates structured content for PDF and signing page rendering.
 * Matches the Berendsen-style contract layout.
 */

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
  monthlyRetainer?: number;
  setupFee?: number;
  contractTerm?: string;
  paymentTerms?: string;
  pricingNotes?: string;
  paymentTermsOverride?: string;
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
}

export interface ContractSection {
  type: "cover" | "heading" | "paragraph" | "bullets" | "table" | "signatures" | "richtext";
  heading?: string;
  content?: string;
  lexicalNodes?: any[];
  items?: string[];
  rows?: { label: string; value: string }[];
  signatures?: {
    client: {
      name?: string;
      title?: string;
      signature?: string;
      date?: string;
    };
    provider: {
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
    effectiveDate: string;
  };
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
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
      effectiveDate: formatDate(data.contractDate),
    },
  });

  // Scope of Work
  if (data.scopeOfWork || data.scopeOfWorkNodes) {
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

  // Pricing
  const pricingRows: { label: string; value: string }[] = [];
  if (data.setupFee) {
    pricingRows.push({
      label: "One-time setup fee",
      value: `${formatCurrency(data.setupFee)}`,
    });
  }
  if (data.monthlyRetainer) {
    pricingRows.push({
      label: "Monthly management retainer",
      value: `${formatCurrency(data.monthlyRetainer)}/month`,
    });
  }
  if (pricingRows.length > 0) {
    sections.push({
      type: "heading",
      heading: "Pricing",
    });
    sections.push({
      type: "table",
      rows: pricingRows,
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

  // Payment Terms - use override if provided, otherwise exact wording from contract PDF
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
    const setupAmount = data.setupFee ? formatCurrency(data.setupFee) : "$0";
    const retainerAmount = data.monthlyRetainer ? formatCurrency(data.monthlyRetainer) : "$0";
    sections.push({
      type: "bullets",
      items: [
        `The one-time setup fee of ${setupAmount} is payable upon signing of this contract.`,
        `The monthly retainer of ${retainerAmount} will be invoiced on the first day of each month. If the engagement begins partway through a calendar month, the first month's retainer will be pro-rated based on the number of remaining days in that month. From the following month onward, the full monthly retainer will be invoiced on the 1st of each month.`,
        "Invoices are due within 14 days of issue.",
        "This contract will automatically renew on a rolling monthly basis unless terminated by either party with a 30-day written notice.",
      ],
    });
  }

  // Termination - exact wording from contract PDF
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

  // Confidentiality - exact wording from contract PDF
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
        name: data.clientSignerName || data.clientContactName,
        title: data.clientTitle,
        signature: data.clientSignature,
        date: data.clientSignedAt ? formatDate(data.clientSignedAt) : undefined,
      },
      provider: {
        name: data.agencySignerName,
        title: data.agencySignerTitle,
        signature: data.agencySignature,
        date: data.agencySignedAt ? formatDate(data.agencySignedAt) : undefined,
      },
    },
  });

  return sections;
}
