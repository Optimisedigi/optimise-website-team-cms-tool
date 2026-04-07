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

  const existingNlb = audit.negativeListBuilder as any;
  if (!existingNlb || existingNlb.status !== "team_approved") {
    return NextResponse.json({ error: "Team must approve the list before sharing with client" }, { status: 400 });
  }

  const body = await req.json();
  const customerId = (audit.customerId || "").replace(/[^0-9]/g, "");

  if (!body.recipientEmails?.length) {
    return NextResponse.json({ error: "At least one recipient email is required" }, { status: 400 });
  }

  try {
    const res = await fetch(
      `${GROWTH_TOOLS_URL}/api/google-ads/negative-list-builder/client-share`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-internal-key": INTERNAL_API_KEY,
        },
        body: JSON.stringify({
          customerId,
          cmsDocId: id,
          businessName: audit.businessName,
          recipientEmails: body.recipientEmails,
          message: body.message || "",
          builderResult: existingNlb,
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

    const nlbData = {
      ...existingNlb,
      status: "client_review",
      clientSharedAt: new Date().toISOString(),
      clientSharedTo: body.recipientEmails,
    };

    await payload.update({
      collection: "google-ads-audits",
      id,
      data: { negativeListBuilder: nlbData },
      overrideAccess: true,
    });

    return NextResponse.json({ negativeListBuilder: nlbData });
  } catch (err: any) {
    return NextResponse.json(
      { error: `Failed to call Growth Tools: ${err.message}` },
      { status: 500 }
    );
  }
}
