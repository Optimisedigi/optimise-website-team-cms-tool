import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { generateContractPdf } from "@/lib/contract-pdf";
import type { ContractData } from "@/lib/contract-template";
import { getPrimaryClientEmail } from "@/lib/contract-emails";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });

  const { user } = await payload.auth({ headers: req.headers });
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let doc: any;
  try {
    doc = await payload.findByID({
      collection: "contracts",
      id,
      overrideAccess: true,
    });
  } catch {
    return NextResponse.json({ error: "Contract not found" }, { status: 404 });
  }

  try {
    let scopeText = "";
    if (doc.scopeOfWork?.root?.children) {
      scopeText = extractPlainText(doc.scopeOfWork.root.children);
    }
    let pricingNotesText = "";
    if (doc.pricingNotes?.root?.children) {
      pricingNotesText = extractPlainText(doc.pricingNotes.root.children);
    }
    let paymentTermsOverrideText = "";
    if (doc.paymentTermsOverride?.root?.children) {
      paymentTermsOverrideText = extractPlainText(doc.paymentTermsOverride.root.children);
    }
    let terminationOverrideText = "";
    if (doc.terminationOverride?.root?.children) {
      terminationOverrideText = extractPlainText(doc.terminationOverride.root.children);
    }

    // Resolve agency signature media to URL
    const agencySigUrl = await resolveMediaToDataUri(payload, doc.agencySignature);

    const contractData: ContractData = {
      contractTitle: doc.contractTitle,
      clientName: doc.clientName,
      clientContactName: doc.clientContactName,
      // Only the primary (first) email is shown on the contract.
      clientEmail: getPrimaryClientEmail(doc.clientEmail),
      clientTitle: doc.clientTitle,
      clientPhone: doc.clientPhone,
      clientWebsite: doc.clientWebsite,
      contractDate: doc.contractDate,
      contractStartDate: doc.contractStartDate,
      monthlyRetainer: doc.monthlyRetainer,
      setupFee: doc.setupFee,
      hideSetupFee: doc.hideSetupFee === true,
      monthlyHosting: doc.monthlyHosting,
      annualHosting: doc.annualHosting,
      additionalWork: doc.additionalWork,
      currency: doc.currency ?? "AUD",
      effectiveDateConfirmed: doc.effectiveDateConfirmed === true,
      effectiveDateOnDeposit: doc.effectiveDateOnDeposit === true,
      contractTerm: doc.contractTerm,
      paymentTerms: doc.paymentTerms,
      pricingNotes: pricingNotesText,
      paymentTermsOverride: paymentTermsOverrideText,
      terminationOverride: terminationOverrideText,
      terminationOverrideNodes: doc.terminationOverride?.root?.children,
      scopeOfWork: scopeText,
      scopeOfWorkNodes: doc.scopeOfWork?.root?.children,
      pricingNotesNodes: doc.pricingNotes?.root?.children,
      paymentTermsOverrideNodes: doc.paymentTermsOverride?.root?.children,
      annualReviewEnabled: Boolean(doc.annualReviewEnabled),
      annualReviewIntroNodes: doc.annualReviewIntro?.root?.children,
      annualReviewTierTableText: doc.annualReviewTierTableText,
      annualReviewNoticeNodes: doc.annualReviewNotice?.root?.children,
      annualReviewGoodFaithReviewNodes: doc.annualReviewGoodFaithReview?.root?.children,
      annualReviewAcceptanceNodes: doc.annualReviewAcceptance?.root?.children,
      agencyContactName: doc.agencyContactName,
      agencyContactEmail: doc.agencyContactEmail,
      agencyContactPhone: doc.agencyContactPhone,
      agencySignerName: doc.agencySignerName,
      agencySignerTitle: doc.agencySignerTitle,
      agencySignature: agencySigUrl || undefined,
      agencySignedAt: doc.agencySignedAt || doc.sentAt,
      clientSignerName: doc.clientSignerName,
      clientSignature: doc.clientSignature,
      clientSignedAt: doc.clientSignedAt,
    };

    const pdfBuffer = await generateContractPdf(contractData);

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${doc.contractTitle || "contract"}.pdf"`,
        // The PDF reflects live contract data — never cache. Without this,
        // Vercel's CDN / browsers can serve a stale render after edits.
        "Cache-Control": "no-store, max-age=0, must-revalidate",
      },
    });
  } catch (e: any) {
    console.error("[preview-pdf] Error:", e.message);
    return NextResponse.json(
      { error: `Failed to generate PDF: ${e.message}` },
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

  // Convert to data URI so react-pdf can render it
  try {
    let fetchUrl = url;
    if (url.startsWith("/")) {
      // Relative URL — resolve to absolute for fetching from the running server
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
