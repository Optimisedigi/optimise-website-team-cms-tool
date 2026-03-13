import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
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

  const { websiteUrl, businessName, customerId, brandTerms } = audit;
  if (!websiteUrl || !businessName) {
    return NextResponse.json(
      { error: "Missing required fields: websiteUrl and businessName must be set on the audit" },
      { status: 400 }
    );
  }

  // Parse brand terms (stored as textarea, one per line)
  const parsedBrandTerms = typeof brandTerms === "string"
    ? brandTerms.split("\n").map((t: string) => t.trim()).filter(Boolean)
    : [];

  // Mark proposal as pending
  await payload.update({
    collection: "google-ads-audits",
    id,
    data: { campaignProposalStatus: "pending" } as any,
    overrideAccess: true,
  });

  after(async () => {
    try {
      // Mark as running
      await payload.update({
        collection: "google-ads-audits",
        id,
        data: { campaignProposalStatus: "running" } as any,
        overrideAccess: true,
      });

      const gtRes = await fetch(
        `${GROWTH_TOOLS_URL}/api/google-ads/campaign-proposal/cms`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Internal-Key": INTERNAL_API_KEY ?? "",
          },
          body: JSON.stringify({
            auditDocId: id,
            websiteUrl,
            businessName,
            customerId: customerId ?? undefined,
            location: audit.location ?? "au",
            brandTerms: parsedBrandTerms.length > 0 ? parsedBrandTerms : undefined,
          }),
        }
      );

      if (!gtRes.ok) {
        const errorText = await gtRes.text();
        console.error(`[run-campaign-proposal] Growth Tools error: ${errorText}`);
        await payload.update({
          collection: "google-ads-audits",
          id,
          data: { campaignProposalStatus: "failed" } as any,
          overrideAccess: true,
        });
      } else {
        // Parse the response and save directly (avoids auth issues with reverse push)
        const gtData = await gtRes.json();
        const { emailHtml, ...proposalResults } = gtData;

        await payload.update({
          collection: "google-ads-audits",
          id,
          data: {
            campaignProposal: proposalResults,
            campaignProposalEmailHtml: emailHtml || "",
            campaignProposalGeneratedAt: new Date().toISOString(),
            campaignProposalStatus: "completed",
          } as any,
          overrideAccess: true,
        });
      }
    } catch (error) {
      console.error(`[run-campaign-proposal] Failed to call Growth Tools:`, error);
      await payload.update({
        collection: "google-ads-audits",
        id,
        data: { campaignProposalStatus: "failed" } as any,
        overrideAccess: true,
      });
    }
  });

  return NextResponse.json({ success: true });
}
