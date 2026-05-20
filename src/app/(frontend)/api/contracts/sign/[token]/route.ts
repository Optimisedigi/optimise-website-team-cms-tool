import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { put } from "@vercel/blob";
import crypto from "crypto";
import { generateContractPdf } from "@/lib/contract-pdf";
import { logActivity } from "@/lib/activity-log";
import type { ContractData } from "@/lib/contract-template";
import { generateCompletionEmail } from "@/lib/contract-email";
import { parseTierTable } from "@/lib/tier-table";
import { parseClientEmails } from "@/lib/contract-emails";
import { syncContractToClient } from "@/lib/contract-to-client-sync";

// GET: return contract data for the signing page
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });

  const results = await payload.find({
    collection: "contracts",
    where: { signingToken: { equals: token } },
    limit: 1,
    overrideAccess: true,
  });

  if (results.totalDocs === 0) {
    return NextResponse.json({ error: "Invalid or expired signing link" }, { status: 404 });
  }

  const doc = results.docs[0] as any;

  if (doc.status === "completed") {
    const agencySigUrl = await resolveMediaUrl(payload, doc.agencySignature);
    return NextResponse.json({
      error: "This contract has already been signed",
      completed: true,
      signedPdfUrl: doc.signedPdfUrl,
      agencySignature: agencySigUrl,
      agencySignerName: doc.agencySignerName,
    }, { status: 400 });
  }

  if (doc.status !== "sent") {
    return NextResponse.json({ error: "This contract is not available for signing" }, { status: 400 });
  }

  if (doc.signingTokenExpiresAt && new Date(doc.signingTokenExpiresAt) < new Date()) {
    return NextResponse.json({ error: "This signing link has expired. Please contact the agency for a new link." }, { status: 400 });
  }

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

  return NextResponse.json({
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
  });
}

// POST: client signs the contract
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });

  const results = await payload.find({
    collection: "contracts",
    where: { signingToken: { equals: token } },
    limit: 1,
    overrideAccess: true,
  });

  if (results.totalDocs === 0) {
    return NextResponse.json({ error: "Invalid signing link" }, { status: 404 });
  }

  const doc = results.docs[0] as any;

  if (doc.status !== "sent") {
    return NextResponse.json({ error: "This contract is not available for signing" }, { status: 400 });
  }

  // Capture CC addresses from the ORIGINAL clientEmail (comma-separated list)
  // before any update overwrites the field with the signer's single address.
  const originalCcEmails = parseClientEmails(doc.clientEmail).ccs;

  if (doc.signingTokenExpiresAt && new Date(doc.signingTokenExpiresAt) < new Date()) {
    return NextResponse.json({ error: "Signing link expired" }, { status: 400 });
  }

  const body = await req.json();
  const {
    signature,
    clientName,
    clientTradingName,
    signerName,
    signerTitle,
    clientEmail,
    clientPhone,
    clientWebsite,
    clientAcn,
    clientBusinessAddress,
    signingDate,
  } = body;

  if (!signature || !signerName) {
    return NextResponse.json(
      { error: "Signature and name are required" },
      { status: 400 },
    );
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";

  try {
    // Update contract with client signature + updated client details
    const updateData: Record<string, any> = {
      clientSignature: signature,
      clientSignerName: signerName,
      clientSignedAt: signingDate ? new Date(signingDate).toISOString() : new Date().toISOString(),
      clientSignedIp: ip,
      status: "completed",
    };
    if (signerTitle !== undefined) updateData.clientTitle = signerTitle;
    if (clientEmail) updateData.clientEmail = clientEmail;
    if (clientPhone !== undefined) updateData.clientPhone = clientPhone;
    if (clientWebsite !== undefined) updateData.clientWebsite = clientWebsite;
    if (clientAcn !== undefined) updateData.clientAcn = clientAcn;
    if (clientName !== undefined) updateData.clientName = clientName;
    if (clientTradingName !== undefined)
      updateData.clientTradingName = clientTradingName;
    if (clientBusinessAddress !== undefined)
      updateData.clientBusinessAddress = clientBusinessAddress;

    await payload.update({
      collection: "contracts",
      id: doc.id,
      data: updateData,
      overrideAccess: true,
    });

    // Fetch updated doc for PDF
    const updatedDoc = await payload.findByID({
      collection: "contracts",
      id: doc.id,
      overrideAccess: true,
    }) as any;

    // One-way copy of contract → client (contact details, pricing,
    // start date, additional work). Fire-and-forget; sync failure must
    // not block the signing flow.
    syncContractToClient(payload, {
      id: updatedDoc.id,
      contractTitle: updatedDoc.contractTitle,
      client: updatedDoc.client,
      setupFee: updatedDoc.setupFee,
      monthlyRetainer: updatedDoc.monthlyRetainer,
      contractStartDate: updatedDoc.contractStartDate,
      contractDate: updatedDoc.contractDate,
      clientName: updatedDoc.clientName,
      clientTradingName: updatedDoc.clientTradingName,
      clientContactName: updatedDoc.clientContactName,
      clientEmail: updatedDoc.clientEmail,
      clientWebsite: updatedDoc.clientWebsite,
      signedPdfUrl: updatedDoc.signedPdfUrl,
      additionalWork: updatedDoc.additionalWork,
    }).catch((err: unknown) => {
      console.error(
        "[sign-contract] contract→client sync error:",
        err instanceof Error ? err.message : String(err),
      );
    });

    // Extract text from rich text fields
    let scopeText = "";
    if (updatedDoc.scopeOfWork?.root?.children) {
      scopeText = extractPlainText(updatedDoc.scopeOfWork.root.children);
    }
    let pricingNotesText = "";
    if (updatedDoc.pricingNotes?.root?.children) {
      pricingNotesText = extractPlainText(updatedDoc.pricingNotes.root.children);
    }
    let paymentTermsOverrideText = "";
    if (updatedDoc.paymentTermsOverride?.root?.children) {
      paymentTermsOverrideText = extractPlainText(updatedDoc.paymentTermsOverride.root.children);
    }
    let terminationOverrideText = "";
    if (updatedDoc.terminationOverride?.root?.children) {
      terminationOverrideText = extractPlainText(updatedDoc.terminationOverride.root.children);
    }

    // Resolve agency signature media to data URI for PDF rendering
    const agencySigUrlForPdf = await resolveMediaToDataUri(payload, updatedDoc.agencySignature);

    // Generate signed PDF
    const contractData: ContractData = {
      contractTitle: updatedDoc.contractTitle,
      clientName: updatedDoc.clientName,
      clientTradingName: updatedDoc.clientTradingName,
      clientContactName: updatedDoc.clientContactName,
      clientEmail: updatedDoc.clientEmail,
      clientTitle: updatedDoc.clientTitle,
      clientPhone: updatedDoc.clientPhone,
      clientWebsite: updatedDoc.clientWebsite,
      clientAcn: updatedDoc.clientAcn,
      clientBusinessAddress: updatedDoc.clientBusinessAddress,
      contractDate: updatedDoc.contractDate,
      contractStartDate: updatedDoc.contractStartDate,
      contractEndDate: updatedDoc.contractEndDate,
      monthlyRetainer: updatedDoc.monthlyRetainer,
      setupFee: updatedDoc.setupFee,
      hideSetupFee: updatedDoc.hideSetupFee === true,
      monthlyHosting: updatedDoc.monthlyHosting,
      annualHosting: updatedDoc.annualHosting,
      additionalWork: updatedDoc.additionalWork,
      currency: updatedDoc.currency ?? "AUD",
      effectiveDateConfirmed: updatedDoc.effectiveDateConfirmed === true,
      effectiveDateOnDeposit: updatedDoc.effectiveDateOnDeposit === true,
      contractTerm: updatedDoc.contractTerm,
      paymentTerms: updatedDoc.paymentTerms,
      pricingNotes: pricingNotesText,
      paymentTermsOverride: paymentTermsOverrideText,
      terminationOverride: terminationOverrideText,
      terminationOverrideNodes: updatedDoc.terminationOverride?.root?.children,
      scopeOfWork: scopeText,
      scopeOfWorkNodes: updatedDoc.scopeOfWork?.root?.children,
      pricingNotesNodes: updatedDoc.pricingNotes?.root?.children,
      paymentTermsOverrideNodes: updatedDoc.paymentTermsOverride?.root?.children,
      annualReviewEnabled: Boolean(updatedDoc.annualReviewEnabled),
      annualReviewIntroNodes: updatedDoc.annualReviewIntro?.root?.children,
      annualReviewTierTableEnabled: updatedDoc.annualReviewTierTableEnabled !== false,
      annualReviewTierTableText: updatedDoc.annualReviewTierTableText,
      annualReviewNoticeNodes: updatedDoc.annualReviewNotice?.root?.children,
      annualReviewGoodFaithReviewNodes: updatedDoc.annualReviewGoodFaithReview?.root?.children,
      annualReviewAcceptanceNodes: updatedDoc.annualReviewAcceptance?.root?.children,
      agencyContactName: updatedDoc.agencyContactName,
      agencyContactEmail: updatedDoc.agencyContactEmail,
      agencyContactPhone: updatedDoc.agencyContactPhone,
      agencySignerName: updatedDoc.agencySignerName,
      agencySignerTitle: updatedDoc.agencySignerTitle,
      agencySignature: agencySigUrlForPdf || undefined,
      agencySignedAt: updatedDoc.agencySignedAt || updatedDoc.sentAt,
      clientSignerName: updatedDoc.clientSignerName,
      clientSignature: updatedDoc.clientSignature,
      clientSignedAt: updatedDoc.clientSignedAt,
    };

    const pdfBuffer = await generateContractPdf(contractData);

    // Compute SHA-256 hash for document integrity verification
    const pdfHash = crypto.createHash("sha256").update(pdfBuffer).digest("hex");

    // Upload to Vercel Blob
    let signedPdfUrl = "";
    console.log("[sign-contract] BLOB_READ_WRITE_TOKEN set:", !!process.env.BLOB_READ_WRITE_TOKEN, "pdfBuffer size:", pdfBuffer.length);
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      const slug = updatedDoc.contractTitle
        ?.toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || "contract";
      const blob = await put(
        `contracts/${slug}-${Date.now()}.pdf`,
        pdfBuffer,
        {
          access: "public",
          contentType: "application/pdf",
        },
      );
      signedPdfUrl = blob.url;

      await payload.update({
        collection: "contracts",
        id: doc.id,
        data: { signedPdfUrl, pdfHash },
        overrideAccess: true,
      });

      // If contract is already linked to a client, save the signed PDF URL there too
      const clientId =
        typeof updatedDoc.client === "object" ? updatedDoc.client?.id : updatedDoc.client;
      if (clientId) {
        payload
          .update({
            collection: "clients",
            id: clientId,
            data: { signedContractUrl: signedPdfUrl },
            overrideAccess: true,
          })
          .catch((err: any) =>
            console.error("[sign-contract] Failed to update client with signed PDF:", err.message),
          );
      }
    } else {
      console.warn("[sign-contract] BLOB_READ_WRITE_TOKEN not set — skipping PDF upload. Emails will NOT send.");
    }

    logActivity(payload, {
      type: "contract_client_signed",
      title: `Contract signed by client: ${updatedDoc.contractTitle}`,
      description: `Signed by ${signerName}. Status: ${updatedDoc.status}. PDF: ${signedPdfUrl ? 'yes' : 'no'}. Brevo: ${process.env.BREVO_API_KEY ? 'yes' : 'no'}`,
    }).catch(() => {});

    // Send completion emails via Brevo (fire-and-forget)
    console.log("[brevo] BREVO_API_KEY set:", !!process.env.BREVO_API_KEY, "signedPdfUrl:", !!signedPdfUrl, "BLOB_READ_WRITE_TOKEN set:", !!process.env.BLOB_READ_WRITE_TOKEN, "clientEmail:", updatedDoc.clientEmail);
    if (process.env.BREVO_API_KEY && signedPdfUrl) {
      const fromEmail = process.env.CONTRACT_FROM_EMAIL || "contracts@optimisedigital.online";
      const fromName = "Optimise Digital";
      const agencyEmail = process.env.CONTRACT_AGENCY_EMAIL || "contracts@optimisedigital.online";
      const contractTitle = updatedDoc.contractTitle || "Service Contract";

      const sendBrevoEmail = async (
        to: { email: string; name: string },
        htmlContent: string,
        subject: string,
        ccEmails: string[] = [],
      ) => {
        const res = await fetch("https://api.brevo.com/v3/smtp/email", {
          method: "POST",
          headers: {
            "api-key": process.env.BREVO_API_KEY!,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            sender: { name: fromName, email: fromEmail },
            to: [to],
            ...(ccEmails.length > 0 && { cc: ccEmails.map((email) => ({ email })) }),
            subject,
            htmlContent,
          }),
        });
        if (!res.ok) {
          const text = await res.text();
          console.error(`[brevo] API error (${res.status}):`, text);
        } else {
          const ccLabel = ccEmails.length > 0 ? ` (cc: ${ccEmails.join(", ")})` : "";
          console.log(`[brevo] Email sent to ${to.email}${ccLabel}`);
        }
      };

      // Send both emails in parallel and await before returning (required for Vercel serverless)
      await Promise.all([
        // Client email — to the signer, CC any additional addresses that were
        // on the original clientEmail list when the contract was sent.
        sendBrevoEmail(
          { email: updatedDoc.clientEmail, name: updatedDoc.clientContactName || updatedDoc.clientName || "" },
          generateCompletionEmail({
            recipientName: updatedDoc.clientContactName || updatedDoc.clientName || "Client",
            contractTitle,
            pdfUrl: signedPdfUrl,
            isAgencyCopy: false,
          }),
          `Signed Contract: ${contractTitle}`,
          originalCcEmails,
        ).catch((err: any) => console.error("[brevo] Client email failed:", err.message)),

        // Agency email
        sendBrevoEmail(
          { email: agencyEmail, name: fromName },
          generateCompletionEmail({
            recipientName: updatedDoc.agencyContactName || "Team",
            contractTitle,
            pdfUrl: signedPdfUrl,
            isAgencyCopy: true,
          }),
          `Contract Signed: ${contractTitle}`,
        ).catch((err: any) => console.error("[brevo] Agency email failed:", err.message)),
      ]);
    } else {
      console.warn("[brevo] Skipping completion emails. BREVO_API_KEY:", !!process.env.BREVO_API_KEY, "signedPdfUrl:", !!signedPdfUrl);
    }

    const agencySigUrlPost = await resolveMediaUrl(payload, updatedDoc.agencySignature);

    return NextResponse.json({
      ok: true,
      signedPdfUrl,
      agencySignature: agencySigUrlPost,
      agencySignerName: updatedDoc.agencySignerName,
    });
  } catch (e: any) {
    console.error("[sign-contract] Error:", e.message);
    return NextResponse.json(
      { error: `Failed to complete signing: ${e.message}` },
      { status: 500 },
    );
  }
}

async function resolveMediaToDataUri(payload: any, agencySignature: any): Promise<string | null> {
  if (!agencySignature) return null;

  let url: string | null = null;
  let mimeType = "image/png";

  if (typeof agencySignature === "object" && agencySignature?.url) {
    url = agencySignature.url;
    mimeType = agencySignature.mimeType || "image/png";
  } else if (typeof agencySignature === "string" || typeof agencySignature === "number") {
    try {
      const media = await payload.findByID({
        collection: "media",
        id: agencySignature,
        overrideAccess: true,
      });
      url = media?.url || null;
      mimeType = media?.mimeType || "image/png";
    } catch {
      return null;
    }
  }

  if (!url) return null;

  try {
    let fetchUrl = url;
    if (url.startsWith("/")) {
      const baseUrl =
        process.env.NEXT_PUBLIC_SERVER_URL ||
        (process.env.VERCEL_PROJECT_PRODUCTION_URL
          ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
          : "http://localhost:3004");
      fetchUrl = `${baseUrl}${url}`;
    }
    const res = await fetch(fetchUrl);
    if (!res.ok) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    return `data:${mimeType};base64,${buffer.toString("base64")}`;
  } catch {
    return null;
  }
}

async function resolveMediaUrl(payload: any, agencySignature: any): Promise<string | null> {
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

function extractPlainText(children: any[]): string {
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

function lexicalToHtml(children: any[]): string {
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

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
