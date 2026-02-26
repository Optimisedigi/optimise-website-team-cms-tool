import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { generateGoogleAdsAuditEmail } from "@/lib/google-ads-email-generator";
import type { GoogleAdsAuditResults, CurationSelections } from "@/lib/google-ads-types";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });

  const { user } = await payload.auth({ headers: req.headers });
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Fetch the audit record
  let audit: any;
  try {
    audit = await payload.findByID({
      collection: "google-ads-audits",
      id,
      overrideAccess: true,
    });
  } catch {
    return NextResponse.json({ error: "Audit not found" }, { status: 404 });
  }

  const scoredReport = audit.scoredReport as GoogleAdsAuditResults | null;
  if (!scoredReport) {
    return NextResponse.json(
      { error: "No scored report available. Run the audit first." },
      { status: 400 }
    );
  }

  const curatedFindings = audit.curatedFindings as CurationSelections | undefined;

  const presentationUrl = audit.slug
    ? `https://www.optimisedigital.online/partners/google-ads-audit/${audit.slug}${audit.presentationPin ? `?pin=${audit.presentationPin}` : ""}`
    : undefined;

  const emailHtml = generateGoogleAdsAuditEmail(
    scoredReport,
    {
      clientName: audit.businessName || "your business",
      contactName: undefined,
      presentationUrl,
    },
    curatedFindings,
  );

  // Update only emailHtml — preserve array fields
  await payload.update({
    collection: "google-ads-audits",
    id,
    data: {
      emailHtml,
      conversionObjectives: audit.conversionObjectives ?? [],
      brandTerms: audit.brandTerms ?? [],
      history: audit.history ?? [],
      actionItems: audit.actionItems ?? [],
    } as any,
    overrideAccess: true,
  });

  return NextResponse.json({ ok: true });
}
