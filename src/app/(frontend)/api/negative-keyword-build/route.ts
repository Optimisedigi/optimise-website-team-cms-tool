import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";

/**
 * GET /api/negative-keyword-build?slug=X&pin=Y
 * Returns merged negative keyword data for the public client page.
 * Merges universal + account-wide into one "accountWide" section.
 * Filters out agency-removed keywords.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const slug = searchParams.get("slug");
  const pin = searchParams.get("pin");

  if (!slug || !pin) {
    return NextResponse.json({ error: "slug and pin are required" }, { status: 400 });
  }

  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });

  try {
    const results = await payload.find({
      collection: "google-ads-audits",
      where: { slug: { equals: slug } },
      limit: 1,
      overrideAccess: true,
    });

    if (!results.docs.length) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const audit = results.docs[0] as any;

    if (!audit.negativeListBuilderPublished) {
      return NextResponse.json({ error: "Negative keyword list is not published" }, { status: 403 });
    }

    if (audit.presentationPin !== pin) {
      return NextResponse.json({ error: "Invalid PIN" }, { status: 401 });
    }

    const nlb = audit.negativeListBuilder as any;
    if (!nlb) {
      return NextResponse.json({ error: "No negative keyword data" }, { status: 404 });
    }

    // Merge universal + account-wide into one section, tag with sourceSection
    const accountWideKeywords: any[] = [];

    for (const cat of (nlb.universalNegatives || [])) {
      accountWideKeywords.push({
        name: cat.name,
        totalWaste: cat.totalWaste,
        keywords: (cat.keywords || [])
          .filter((kw: any) => !kw.removed)
          .map((kw: any) => ({
            ...kw,
            sourceSection: "universal",
            sourceCategoryName: cat.name,
          })),
      });
    }

    for (const cat of (nlb.accountWideNegatives || [])) {
      accountWideKeywords.push({
        name: cat.name,
        totalWaste: cat.totalWaste,
        keywords: (cat.keywords || [])
          .filter((kw: any) => !kw.removed)
          .map((kw: any) => ({
            ...kw,
            sourceSection: "accountWide",
            sourceCategoryName: cat.name,
          })),
      });
    }

    // Campaign-specific: filter removed, keep structure
    const campaignSpecificKeywords = (nlb.campaignSpecificNegatives || []).map((group: any) => ({
      campaignName: group.campaignName,
      keywords: (group.keywords || [])
        .filter((kw: any) => !kw.removed)
        .map((kw: any) => ({ ...kw })),
    }));

    return NextResponse.json({
      businessName: audit.businessName,
      slug: audit.slug,
      status: nlb.status,
      totalSearchTermsAnalyzed: nlb.totalSearchTermsAnalyzed,
      dateRangeStart: nlb.dateRangeStart,
      dateRangeEnd: nlb.dateRangeEnd,
      totalWasteIdentified: nlb.totalWasteIdentified,
      existingNegativeCount: nlb.existingNegativeCount,
      accountWideKeywords,
      campaignSpecificKeywords,
      clientNotes: nlb.clientNotes || "",
    });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
