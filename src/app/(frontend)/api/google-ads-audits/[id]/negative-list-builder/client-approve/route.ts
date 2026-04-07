import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";

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
  if (!existingNlb || existingNlb.status !== "client_review") {
    return NextResponse.json({ error: "Client share must happen before approval" }, { status: 400 });
  }

  const nlbData = {
    ...existingNlb,
    status: "client_approved",
    clientApprovedAt: new Date().toISOString(),
  };

  await payload.update({
    collection: "google-ads-audits",
    id,
    data: { negativeListBuilder: nlbData },
    overrideAccess: true,
  });

  return NextResponse.json({ negativeListBuilder: nlbData });
}
