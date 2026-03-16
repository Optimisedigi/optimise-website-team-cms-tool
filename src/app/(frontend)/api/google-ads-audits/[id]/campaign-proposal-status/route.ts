import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";

export async function GET(
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

  try {
    const audit = await payload.findByID({
      collection: "google-ads-audits",
      id,
      overrideAccess: true,
    });

    const a = audit as any;

    return NextResponse.json({
      status: a.campaignProposalStatus || null,
      generatedAt: a.campaignProposalGeneratedAt || null,
      hasProposal: !!a.campaignProposal,
      hasEmail: !!a.campaignProposalEmailHtml,
      error: a.campaignProposalStatus === "failed" ? (a.auditError || "Unknown error") : null,
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
