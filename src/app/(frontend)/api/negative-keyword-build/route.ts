import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { checkPinWithLockout } from "@/lib/pin-auth";

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

    const pinResult = await checkPinWithLockout(
      `nkb:${audit.id}`,
      pin,
      audit.presentationPin ?? "",
    );
    if (!pinResult.ok) {
      return NextResponse.json(
        { error: pinResult.message },
        { status: pinResult.status },
      );
    }

    const nlb = audit.negativeListBuilder as any;
    if (!nlb) {
      return NextResponse.json({ error: "No negative keyword data" }, { status: 404 });
    }

    // Client removals are retained in the audit for review history, but must
    // not be returned to the client editor after a reload. Otherwise a saved
    // removal looks like it was not persisted.
    const isVisibleToClient = (keyword: { removed?: boolean; clientRemoved?: boolean }) =>
      !keyword.removed && !keyword.clientRemoved;

    // Flatten universal + account-wide into a single flat keyword array.
    const accountWideKeywords: any[] = [];

    for (const cat of (nlb.universalNegatives || [])) {
      for (const kw of (cat.keywords || [])) {
        if (!isVisibleToClient(kw)) continue;
        accountWideKeywords.push({
          ...kw,
          sourceSection: "universal",
          sourceCategoryName: cat.name,
        });
      }
    }

    for (const cat of (nlb.accountWideNegatives || [])) {
      for (const kw of (cat.keywords || [])) {
        if (!isVisibleToClient(kw)) continue;
        accountWideKeywords.push({
          ...kw,
          sourceSection: "accountWide",
          sourceCategoryName: cat.name,
        });
      }
    }

    // Fetch existing negative keyword lists for this client
    let existingNegativeKeywordLists: any[] = [];
    const clientId = audit.client
      ? typeof audit.client === "object" ? audit.client.id : audit.client
      : null;
    if (clientId) {
      try {
        const nklResults = await payload.find({
          collection: "negative-keyword-lists",
          where: { client: { equals: clientId } },
          limit: 100,
          overrideAccess: true,
        });
        existingNegativeKeywordLists = nklResults.docs.map((doc: any) => ({
          name: doc.name,
          scope: doc.scope,
          campaigns: doc.campaigns || [],
          keywords: (doc.keywords || []).map((kw: any) => ({
            keyword: kw.keyword,
            matchType: kw.matchType,
          })),
          isActive: doc.isActive,
        }));
      } catch {
        // Non-critical — continue without NKL data
      }
    }

    // Campaign-specific: exclude agency and client removals, while keeping the group structure.
    const campaignSpecificKeywords = (nlb.campaignSpecificNegatives || []).map((group: any) => ({
      campaignName: group.campaignName,
      keywords: (group.keywords || [])
        .filter(isVisibleToClient)
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
      existingNegativeKeywordLists,
      clientNotes: nlb.clientNotes || "",
    });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
