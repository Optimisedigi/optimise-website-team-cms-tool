import type { Payload } from "payload";
import { escapeHtml } from "@/lib/html-escape";
import { parseTierTable } from "@/lib/tier-table";
import { parseClientEmails } from "@/lib/contract-emails";

/**
 * Read-only contract view shared by the public signing page and the draft
 * review page, so a reviewer sees exactly the wording the signer will see.
 * Moved verbatim from /api/contracts/sign/[token] (GET).
 */
export async function buildContractView(payload: Payload, doc: any) {
  // Convert rich text fields to HTML for signing page
  let scopeHtml = "";
  let scopeText = "";
  if (doc.scopeOfWork?.root?.children) {
    scopeHtml = lexicalToHtml(doc.scopeOfWork.root.children);
    scopeText = extractPlainText(doc.scopeOfWork.root.children);
  }
  let pricingNotesHtml = "";
  let pricingNotesText = "";
  if (doc.pricingNotes?.root?.children) {
    pricingNotesHtml = lexicalToHtml(doc.pricingNotes.root.children);
    pricingNotesText = extractPlainText(doc.pricingNotes.root.children);
  }
  let paymentTermsOverrideHtml = "";
  let paymentTermsOverrideText = "";
  if (doc.paymentTermsOverride?.root?.children) {
    paymentTermsOverrideHtml = lexicalToHtml(doc.paymentTermsOverride.root.children);
    paymentTermsOverrideText = extractPlainText(doc.paymentTermsOverride.root.children);
  }
  let terminationOverrideHtml = "";
  let terminationOverrideText = "";
  if (doc.terminationOverride?.root?.children) {
    terminationOverrideHtml = lexicalToHtml(doc.terminationOverride.root.children);
    terminationOverrideText = extractPlainText(doc.terminationOverride.root.children);
  }

  // Annual Review & Tier Adjustment (optional section)
  const annualReviewEnabled = Boolean(doc.annualReviewEnabled);
  let annualReviewIntroHtml = "";
  let annualReviewNoticeHtml = "";
  let annualReviewGoodFaithReviewHtml = "";
  let annualReviewAcceptanceHtml = "";
  if (annualReviewEnabled) {
    if (doc.annualReviewIntro?.root?.children) {
      annualReviewIntroHtml = lexicalToHtml(doc.annualReviewIntro.root.children);
    }
    if (doc.annualReviewNotice?.root?.children) {
      annualReviewNoticeHtml = lexicalToHtml(doc.annualReviewNotice.root.children);
    }
    if (doc.annualReviewGoodFaithReview?.root?.children) {
      annualReviewGoodFaithReviewHtml = lexicalToHtml(doc.annualReviewGoodFaithReview.root.children);
    }
    if (doc.annualReviewAcceptance?.root?.children) {
      annualReviewAcceptanceHtml = lexicalToHtml(doc.annualReviewAcceptance.root.children);
    }
  }
  // Tier table is gated by the section toggle AND the nested per-table
  // toggle. Nested toggle defaults to TRUE for back-compat with contracts
  // signed before the toggle existed.
  const annualReviewTierTableEnabled = doc.annualReviewTierTableEnabled !== false;
  const annualReviewTierTable =
    annualReviewEnabled && annualReviewTierTableEnabled
      ? parseTierTable(doc.annualReviewTierTableText)
      : null;

  const agencySigUrl = await resolveMediaUrl(payload, doc.agencySignature);
  return {
    contractTitle: doc.contractTitle,
    clientName: doc.clientName,
    clientTradingName: doc.clientTradingName,
    clientContactName: doc.clientContactName,
    // Only expose the primary signer email to the sign page — any CC
    // addresses are kept server-side for receipt delivery only.
    clientEmail: parseClientEmails(doc.clientEmail).primary ?? "",
    clientTitle: doc.clientTitle,
    clientPhone: doc.clientPhone,
    clientWebsite: doc.clientWebsite,
    clientAcn: doc.clientAcn,
    clientBusinessAddress: doc.clientBusinessAddress,
    contractDate: doc.contractDate,
    contractStartDate: doc.contractStartDate,
    contractEndDate: doc.contractEndDate,
    monthlyRetainer: doc.monthlyRetainer,
    setupFee: doc.setupFee,
    hideSetupFee: doc.hideSetupFee === true,
    monthlyHosting: doc.monthlyHosting,
    annualHosting: doc.annualHosting,
    additionalWork: Array.isArray(doc.additionalWork)
      ? doc.additionalWork
          .filter((item: any) => item?.projectName && String(item.projectName).trim() !== "")
          .map((item: any) => ({
            projectName: item.projectName,
            amount: item.amount ?? 0,
          }))
      : [],
    currency: doc.currency ?? "AUD",
    effectiveDateConfirmed: doc.effectiveDateConfirmed === true,
    effectiveDateOnDeposit: doc.effectiveDateOnDeposit === true,
    contractTerm: doc.contractTerm,
    paymentTerms: doc.paymentTerms,
    scopeOfWork: scopeText,
    scopeOfWorkHtml: scopeHtml,
    pricingNotes: pricingNotesText,
    pricingNotesHtml: pricingNotesHtml,
    paymentTermsOverride: paymentTermsOverrideText,
    paymentTermsOverrideHtml: paymentTermsOverrideHtml,
    terminationOverride: terminationOverrideText,
    terminationOverrideHtml: terminationOverrideHtml,
    annualReviewEnabled,
    annualReviewIntroHtml,
    annualReviewTierTable,
    annualReviewNoticeHtml,
    annualReviewGoodFaithReviewHtml,
    annualReviewAcceptanceHtml,
    agencyContactName: doc.agencyContactName,
    agencyContactEmail: doc.agencyContactEmail,
    agencyContactPhone: doc.agencyContactPhone,
    agencySignerName: doc.agencySignerName,
    agencySignerTitle: doc.agencySignerTitle,
    agencySignature: agencySigUrl,
    agencySignedAt: doc.agencySignedAt,
  };
}

export async function resolveMediaUrl(payload: any, agencySignature: any): Promise<string | null> {
  if (!agencySignature) return null;
  // If already populated as an object with url
  if (typeof agencySignature === "object" && agencySignature?.url) {
    return agencySignature.url;
  }
  // If it's a media ID (string or number), look it up
  if (typeof agencySignature === "string" || typeof agencySignature === "number") {
    try {
      const media = await payload.findByID({
        collection: "media",
        id: agencySignature,
        overrideAccess: true,
      });
      return media?.url || null;
    } catch {
      return null;
    }
  }
  return null;
}

export function extractPlainText(children: any[]): string {
  let text = "";
  for (const child of children) {
    if (child.text) {
      text += child.text;
    }
    if (child.children) {
      text += extractPlainText(child.children);
    }
    if (child.type === "paragraph" || child.type === "heading") {
      text += "\n";
    }
  }
  return text.trim();
}

export function lexicalToHtml(children: any[]): string {
  let html = "";
  for (const node of children) {
    if (node.type === "paragraph") {
      html += `<p>${inlineToHtml(node.children || [])}</p>`;
    } else if (node.type === "heading") {
      const tag = node.tag || "h3";
      html += `<${tag}>${inlineToHtml(node.children || [])}</${tag}>`;
    } else if (node.type === "list") {
      const tag = node.listType === "number" ? "ol" : "ul";
      const startAttr = node.start && node.start > 1 ? ` start="${node.start}"` : "";
      html += `<${tag}${startAttr}>`;
      for (const item of node.children || []) {
        if (item.type === "listitem") {
          html += `<li>${inlineToHtml(item.children || [])}</li>`;
        }
      }
      html += `</${tag}>`;
    } else if (node.type === "listitem") {
      html += `<li>${inlineToHtml(node.children || [])}</li>`;
    }
  }
  return html;
}

function inlineToHtml(children: any[]): string {
  let html = "";
  for (const node of children) {
    if (node.type === "list") {
      const tag = node.listType === "number" ? "ol" : "ul";
      const startAttr = node.start && node.start > 1 ? ` start="${node.start}"` : "";
      html += `<${tag}${startAttr}>`;
      for (const item of node.children || []) {
        if (item.type === "listitem") {
          html += `<li>${inlineToHtml(item.children || [])}</li>`;
        }
      }
      html += `</${tag}>`;
    } else if (node.text !== undefined) {
      let text = escapeHtml(node.text);
      // format bitmask: 1=bold, 2=italic, 3=bold+italic
      if (node.format & 1) text = `<strong>${text}</strong>`;
      if (node.format & 2) text = `<em>${text}</em>`;
      html += text;
    } else if (node.children) {
      html += inlineToHtml(node.children);
    }
  }
  return html;
}
