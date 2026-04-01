import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";

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

    if (!audit.adCopyPublished) {
      return NextResponse.json({ error: "Ad copy preview is not published" }, { status: 403 });
    }

    if (audit.presentationPin !== pin) {
      return NextResponse.json({ error: "Invalid PIN" }, { status: 401 });
    }

    // Build landing page lookup from proposal
    const proposalData = typeof audit.campaignProposal === "string"
      ? JSON.parse(audit.campaignProposal)
      : audit.campaignProposal;
    const landingPages: Record<string, Record<string, string>> = {};
    for (const camp of proposalData?.proposedCampaigns || []) {
      if (!landingPages[camp.name]) landingPages[camp.name] = {};
      for (const ag of camp.adGroups || []) {
        landingPages[camp.name][ag.name] = ag.landingPage?.url || "";
      }
    }

    return NextResponse.json({
      businessName: audit.businessName,
      slug: audit.slug,
      adCopy: audit.generatedAdCopy || {},
      comments: audit.adCopyComments || [],
      landingPages,
    });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
