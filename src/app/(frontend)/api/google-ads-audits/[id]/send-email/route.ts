import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";

const POSTMARK_API_KEY = process.env.POSTMARK_API_KEY;
const FROM_EMAIL = process.env.AUDIT_FROM_EMAIL || "audits@optimisedigital.online";

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

  if (!POSTMARK_API_KEY) {
    return NextResponse.json(
      { error: "POSTMARK_API_KEY not configured" },
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

  const { emailHtml, contactEmail, businessName } = audit;

  if (!emailHtml) {
    return NextResponse.json(
      { error: "No email HTML generated yet — run the audit first" },
      { status: 400 }
    );
  }

  if (!contactEmail) {
    return NextResponse.json(
      { error: "No contact email set — add one in the Client Info tab" },
      { status: 400 }
    );
  }

  try {
    // Send via Postmark
    const response = await fetch("https://api.postmarkapp.com/email", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Postmark-Server-Token": POSTMARK_API_KEY,
      },
      body: JSON.stringify({
        From: FROM_EMAIL,
        To: contactEmail,
        Subject: `Google Ads Account Review — ${businessName || "Your Business"}`,
        HtmlBody: emailHtml,
        MessageStream: "outbound",
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Postmark error (${response.status}): ${body}`);
    }

    // Record send timestamp
    await payload.update({
      collection: "google-ads-audits",
      id,
      data: {
        emailSentAt: new Date().toISOString(),
      } as any,
      overrideAccess: true,
    });

    return NextResponse.json({ ok: true, sentTo: contactEmail });
  } catch (e: any) {
    console.error("[GoogleAdsAudit] Email send failed:", e.message);
    return NextResponse.json(
      { error: `Failed to send email: ${e.message}` },
      { status: 500 }
    );
  }
}
