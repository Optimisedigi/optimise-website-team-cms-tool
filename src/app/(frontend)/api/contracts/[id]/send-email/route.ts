import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { generateSigningInviteEmail } from "@/lib/contract-email";
import { logActivity } from "@/lib/activity-log";
import { parseClientEmails } from "@/lib/contract-emails";

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

  if (doc.status !== "sent") {
    return NextResponse.json(
      { error: "Contract must be in 'Sent to Client' status" },
      { status: 400 },
    );
  }

  const { primary: primaryEmail, ccs: ccEmails } = parseClientEmails(doc.clientEmail);
  if (!primaryEmail) {
    return NextResponse.json(
      { error: "No client email address on this contract" },
      { status: 400 },
    );
  }

  if (!doc.signingToken) {
    return NextResponse.json(
      { error: "No signing link generated. Generate a signing link first." },
      { status: 400 },
    );
  }

  if (!process.env.BREVO_API_KEY) {
    return NextResponse.json(
      { error: "BREVO_API_KEY not configured" },
      { status: 500 },
    );
  }

  const baseUrl =
    process.env.NEXT_PUBLIC_SERVER_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "http://localhost:3004");
  const signingUrl = `${baseUrl}/contracts/sign/${doc.signingToken}`;

  const fromEmail = process.env.CONTRACT_FROM_EMAIL || "contracts@optimisedigital.online";
  const fromName = "Optimise Digital";
  const contractTitle = doc.contractTitle || "Service Contract";
  const recipientName = doc.clientContactName || doc.clientName || "Client";
  const agencyContactName = doc.agencyContactName || fromName;

  try {
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": process.env.BREVO_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sender: { name: fromName, email: fromEmail },
        to: [{ email: primaryEmail, name: recipientName }],
        ...(ccEmails.length > 0 && { cc: ccEmails.map((email) => ({ email })) }),
        subject: `Contract for Review: ${contractTitle}`,
        htmlContent: generateSigningInviteEmail({
          recipientName,
          contractTitle,
          signingUrl,
          senderName: agencyContactName,
        }),
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error(`[brevo] Send email API error (${res.status}):`, text);
      // Brevo returns JSON like { code: "unauthorized", message: "..." }. Surface
      // both fields to the UI so the operator can diagnose without digging
      // through Vercel logs. Falls back to the raw text body when the response
      // isn't JSON (rare). Truncated so a stray HTML error page doesn't blow
      // up the toast.
      let brevoCode: string | undefined;
      let brevoMessage: string | undefined;
      try {
        const parsed = JSON.parse(text) as { code?: string; message?: string };
        brevoCode = parsed.code;
        brevoMessage = parsed.message;
      } catch {
        brevoMessage = text.slice(0, 300);
      }
      const detail = [brevoCode, brevoMessage].filter(Boolean).join(" — ") || `HTTP ${res.status}`;
      return NextResponse.json(
        {
          error: `Brevo rejected the send (${res.status}): ${detail}`,
          brevoStatus: res.status,
          brevoCode,
          brevoMessage,
        },
        { status: 502 },
      );
    }

    const sentToLabel = ccEmails.length > 0
      ? `${primaryEmail} (cc: ${ccEmails.join(", ")})`
      : primaryEmail;
    console.log(`[brevo] Signing invite sent to ${sentToLabel}`);

    logActivity(payload, {
      type: "contract_sent",
      title: `Contract email sent: ${contractTitle}`,
      description: `Sent to ${sentToLabel}`,
      user: user.id,
    }).catch(() => {});

    return NextResponse.json({ ok: true, sentTo: primaryEmail, cc: ccEmails });
  } catch (err: any) {
    console.error("[brevo] Send email failed:", err.message);
    return NextResponse.json(
      { error: `Failed to send email: ${err.message}` },
      { status: 500 },
    );
  }
}
