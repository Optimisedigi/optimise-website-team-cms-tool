import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import crypto from "crypto";
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

  if (doc.status !== "draft" && doc.status !== "sent") {
    return NextResponse.json(
      { error: "Contract must be in draft or sent status" },
      { status: 400 },
    );
  }

  if (!doc.agencySignature) {
    return NextResponse.json(
      { error: "Please upload an agency signature and sign before sending" },
      { status: 400 },
    );
  }

  try {
    // Generate or refresh signing token
    const signingToken = crypto.randomBytes(48).toString("hex");
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const now = new Date().toISOString();
    await payload.update({
      collection: "contracts",
      id,
      data: {
        signingToken,
        signingTokenExpiresAt: expiresAt.toISOString(),
        sentAt: now,
        agencySignedAt: now,
        status: "sent",
      },
      overrideAccess: true,
    });

    // Build signing URL
    const baseUrl =
      process.env.NEXT_PUBLIC_SERVER_URL ||
      (process.env.VERCEL_PROJECT_PRODUCTION_URL
        ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
        : "http://localhost:3004");
    const signingUrl = `${baseUrl}/contracts/sign/${signingToken}`;

    logActivity(payload, {
      type: "contract_link_generated",
      title: `Signing link generated: ${doc.contractTitle}`,
      description: `Link generated for ${doc.clientEmail}`,
      user: user.id,
    }).catch(() => {});

    return NextResponse.json({
      ok: true,
      signingUrl,
    });
  } catch (e: any) {
    console.error("[send-to-client] Error:", e.message);
    return NextResponse.json(
      { error: `Failed to send contract: ${e.message}` },
      { status: 500 },
    );
  }
}
