import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";

const ALLOWED_FIELDS = [
  "excludedCompetitorDomains",
  "excludedKeywords",
  "excludedContentQuestions",
  "slideNotes",
] as const;

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const payload = await getPayload({ config: await config });
  const { user } = await payload.auth({ headers: req.headers });
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json();

  // Only allow whitelisted fields
  const data: Record<string, unknown> = {};
  for (const field of ALLOWED_FIELDS) {
    if (body[field] !== undefined) data[field] = body[field];
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json(
      { error: "No valid fields provided" },
      { status: 400 },
    );
  }

  try {
    await payload.update({
      collection: "client-proposals",
      id,
      data: data as any,
      overrideAccess: true,
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[Proposal Edit] Update failed:", err);
    return NextResponse.json(
      { error: "Failed to update proposal" },
      { status: 500 },
    );
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const payload = await getPayload({ config: await config });
  const { user } = await payload.auth({ headers: req.headers });
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const proposal = await payload.findByID({
      collection: "client-proposals",
      id,
      depth: 0,
      overrideAccess: true,
    });

    return NextResponse.json({
      excludedCompetitorDomains: (proposal as any).excludedCompetitorDomains ?? [],
      excludedKeywords: (proposal as any).excludedKeywords ?? [],
      excludedContentQuestions: (proposal as any).excludedContentQuestions ?? [],
      slideNotes: (proposal as any).slideNotes ?? {},
    });
  } catch (err) {
    console.error("[Proposal Edit] Fetch failed:", err);
    return NextResponse.json(
      { error: "Failed to fetch proposal" },
      { status: 500 },
    );
  }
}
