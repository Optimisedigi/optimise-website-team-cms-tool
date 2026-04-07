import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";

const GROWTH_TOOLS_URL = process.env.GROWTH_TOOLS_URL;
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;

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

  if (!GROWTH_TOOLS_URL || !INTERNAL_API_KEY) {
    return NextResponse.json(
      { error: "Server misconfigured: missing GROWTH_TOOLS_URL or INTERNAL_API_KEY" },
      { status: 500 }
    );
  }

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

  const customerId = (audit.customerId || "").replace(/[^0-9]/g, "");
  if (!customerId) {
    return NextResponse.json({ error: "No customer ID set" }, { status: 400 });
  }

  // Extract brand terms (newline-separated textarea)
  const brandTerms = (audit.brandTerms || "")
    .split("\n")
    .map((t: string) => t.trim())
    .filter(Boolean);

  // Extract proposal campaigns if available
  let proposalCampaigns: any[] | undefined;
  let campaignMappings: any[] | undefined;

  if (audit.campaignProposal?.proposedCampaigns) {
    proposalCampaigns = audit.campaignProposal.proposedCampaigns;
  }

  // Extract campaign mappings from build result (merged campaigns)
  if (audit.campaignBuildResult?.campaigns) {
    campaignMappings = audit.campaignBuildResult.campaigns
      .filter((c: any) => c.action === "merged" && c.mergedFrom)
      .map((c: any) => ({ oldName: c.mergedFrom, newName: c.name }));
  }

  try {
    const res = await fetch(
      `${GROWTH_TOOLS_URL}/api/google-ads/negative-list-builder/generate`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-internal-key": INTERNAL_API_KEY,
        },
        body: JSON.stringify({
          customerId,
          brandTerms,
          cmsDocId: id,
          proposalCampaigns,
          campaignMappings,
        }),
      }
    );

    const data = await res.json();

    if (!res.ok) {
      return NextResponse.json(
        { error: data.error || `Growth Tools returned ${res.status}` },
        { status: res.status }
      );
    }

    // The Growth Tools API returns a full NegativeListBuilderResult.
    // Store the entire response plus our status metadata.
    // Fields may be at top level or nested — spread the whole thing to capture all.
    const nlbData = {
      ...data,
      status: "generated",
      generatedAt: new Date().toISOString(),
    };

    await payload.update({
      collection: "google-ads-audits",
      id,
      data: { negativeListBuilder: nlbData },
      overrideAccess: true,
    });

    // Return the stored data plus the raw keys for debugging
    return NextResponse.json({
      negativeListBuilder: nlbData,
      _rawKeys: Object.keys(data),
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: `Failed to call Growth Tools: ${err.message}` },
      { status: 500 }
    );
  }
}
