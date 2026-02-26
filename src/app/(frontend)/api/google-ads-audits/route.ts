import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";

/**
 * Public GET endpoint for Google Ads audit presentations.
 * Used by the presentation renderer at /partners/google-ads-audit/[slug].
 *
 * Query params:
 * - slug (required): the audit slug
 * - pin (required): 4-digit presentation PIN
 *
 * Returns the presentationData (or scoredReport as fallback) if:
 * 1. Slug matches an audit
 * 2. PIN matches
 * 3. presentationPublished is true
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const slug = searchParams.get("slug");
  const pin = searchParams.get("pin");

  if (!slug) {
    return NextResponse.json({ error: "Missing slug parameter" }, { status: 400 });
  }
  if (!pin) {
    return NextResponse.json({ error: "Missing pin parameter" }, { status: 400 });
  }

  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });

  try {
    const result = await payload.find({
      collection: "google-ads-audits",
      where: {
        slug: { equals: slug },
      },
      limit: 1,
      overrideAccess: true,
    });

    if (result.totalDocs === 0) {
      return NextResponse.json({ error: "Audit not found" }, { status: 404 });
    }

    const audit = result.docs[0] as any;

    // Verify PIN
    if (audit.presentationPin !== pin) {
      return NextResponse.json({ error: "Invalid PIN" }, { status: 401 });
    }

    // Check if published
    if (!audit.presentationPublished) {
      return NextResponse.json({ error: "Presentation not yet published" }, { status: 403 });
    }

    // Return presentation data (prefer curated presentationData, fall back to scoredReport)
    const data = audit.presentationData || audit.scoredReport;
    if (!data) {
      return NextResponse.json({ error: "No presentation data available" }, { status: 404 });
    }

    return NextResponse.json({
      data,
      clientName: audit.businessName,
      slug: audit.slug,
    });
  } catch (e: any) {
    console.error("[GoogleAdsAudits API] Error:", e.message);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
