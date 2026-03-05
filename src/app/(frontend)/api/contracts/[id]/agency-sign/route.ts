import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { logActivity } from "@/lib/activity-log";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });

  const { user } = await payload.auth({ headers: req.headers });
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let doc: any;
  try {
    doc = await payload.findByID({
      collection: "contracts",
      id,
      overrideAccess: true,
    });
  } catch {
    return NextResponse.json({ error: "Contract not found" }, { status: 404 });
  }

  if (doc.status !== "draft") {
    return NextResponse.json(
      { error: "Contract has already been signed" },
      { status: 400 },
    );
  }

  const body = await req.json();
  const { signatureMediaId, signerName, signerTitle } = body;

  if (!signatureMediaId || !signerName) {
    return NextResponse.json(
      { error: "Signature media and signer name are required" },
      { status: 400 },
    );
  }

  // Verify media record exists
  try {
    await payload.findByID({
      collection: "media",
      id: signatureMediaId,
      overrideAccess: true,
    });
  } catch {
    return NextResponse.json(
      { error: "Signature media not found" },
      { status: 400 },
    );
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";

  try {
    await payload.update({
      collection: "contracts",
      id,
      data: {
        agencySignature: signatureMediaId,
        agencySignerName: signerName,
        agencySignerTitle: signerTitle || undefined,
        agencySignedAt: new Date().toISOString(),
        agencySignedIp: ip,
      },
      overrideAccess: true,
    });

    logActivity(payload, {
      type: "contract_agency_signed",
      title: `Contract signed by agency: ${doc.contractTitle}`,
      description: `Signed by ${signerName}`,
      user: user.id,
    }).catch(() => {});

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("[agency-sign] Error:", e.message);
    return NextResponse.json(
      { error: `Failed to save signature: ${e.message}` },
      { status: 500 },
    );
  }
}
