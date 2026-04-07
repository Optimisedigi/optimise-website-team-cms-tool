import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";

/**
 * Team review is a CMS-only operation — saves the edited keyword lists
 * (removals, match type changes, moves, additions) and advances status
 * to team_approved. No Growth Tools call needed.
 */
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

  const existingNlb = audit.negativeListBuilder as any;
  if (!existingNlb || !existingNlb.status) {
    return NextResponse.json({ error: "No negative list data to review" }, { status: 400 });
  }

  const body = await req.json();

  const nlbData = {
    ...existingNlb,
    status: "team_approved",
    universalNegatives: body.universalNegatives || existingNlb.universalNegatives,
    accountWideNegatives: body.accountWideNegatives || existingNlb.accountWideNegatives,
    campaignSpecificNegatives: body.campaignSpecificNegatives || existingNlb.campaignSpecificNegatives,
    teamReviewedAt: new Date().toISOString(),
    teamReviewedBy: body.reviewedBy || user.name || user.email || "Team",
    teamNotes: body.notes || "",
  };

  await payload.update({
    collection: "google-ads-audits",
    id,
    data: { negativeListBuilder: nlbData },
    overrideAccess: true,
  });

  return NextResponse.json({ negativeListBuilder: nlbData });
}
