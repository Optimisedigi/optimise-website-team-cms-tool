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

    // When duplicating from a template, start the new contract with the
    // template's own contractTitle (operator will rename for the client).
    // When duplicating a normal contract, prefix "Copy of" so it's obvious
    // this is a clone.
    const newTitle = source.isTemplate
      ? source.contractTitle || "Untitled"
      : `Copy of ${source.contractTitle || "Untitled"}`;

    const newContract = await payload.create({
      collection: "contracts",
      data: {
        contractTitle: newTitle,
        // The new contract is never itself a template, and never carries the
        // template's button label.
        isTemplate: false,
        templateLabel: null,
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
