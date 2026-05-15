import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });

  // Check auth
  const { user } = await payload.auth({ headers: req.headers });
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const source = await payload.findByID({
      collection: "contracts",
      id,
      overrideAccess: true,
    }) as any;

    if (!source) {
      return NextResponse.json({ error: "Contract not found" }, { status: 404 });
    }

    const newContract = await payload.create({
      collection: "contracts",
      data: {
        contractTitle: `Copy of ${source.contractTitle || "Untitled"}`,
        status: "draft",
        contractDate: new Date().toISOString().split("T")[0],
        // Required DB columns — pass empty values for the new draft
        clientName: "",
        clientEmail: "placeholder@example.com",
        proposal: typeof source.proposal === "object" ? source.proposal?.id : source.proposal,
        // Template content fields
        scopeOfWork: source.scopeOfWork || undefined,
        pricingNotes: source.pricingNotes || undefined,
        paymentTermsOverride: source.paymentTermsOverride || undefined,
        annualReviewEnabled: source.annualReviewEnabled || false,
        annualReviewIntro: source.annualReviewIntro || undefined,
        annualReviewTierTableText: source.annualReviewTierTableText || undefined,
        annualReviewNotice: source.annualReviewNotice || undefined,
        annualReviewGoodFaithReview: source.annualReviewGoodFaithReview || undefined,
        annualReviewAcceptance: source.annualReviewAcceptance || undefined,
        contractTerm: source.contractTerm || undefined,
        paymentTerms: source.paymentTerms || undefined,
        monthlyRetainer: source.monthlyRetainer ?? undefined,
        setupFee: source.setupFee ?? undefined,
        currency: source.currency ?? undefined,
        effectiveDateConfirmed: source.effectiveDateConfirmed ?? false,
        // Agency fields
        agencyContactName: source.agencyContactName || undefined,
        agencyContactEmail: source.agencyContactEmail || undefined,
        agencyContactPhone: source.agencyContactPhone || undefined,
        agencySignerName: source.agencySignerName || undefined,
        agencySignerTitle: source.agencySignerTitle || undefined,
        agencySignature: typeof source.agencySignature === "object"
          ? source.agencySignature?.id
          : source.agencySignature || undefined,
      },
      overrideAccess: true,
    });

    return NextResponse.json({ id: newContract.id });
  } catch (e: any) {
    console.error("[duplicate-contract] Error:", e.message);
    return NextResponse.json({ error: e.message || "Failed to duplicate contract" }, { status: 500 });
  }
}
