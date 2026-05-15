import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { generateSigningInviteEmail } from "@/lib/contract-email";
import { logActivity } from "@/lib/activity-log";

/**
 * Send the contract signing invite email to the client.
 *
 * Transport: Postmark. Brevo was the original transport but Brevo enforces
 * an IP allowlist on API keys that's incompatible with Vercel's rotating
 * serverless IP pool. Postmark has no such restriction; we already use it
 * for audit emails and contract reminders so the sender domain is verified.
 *
 * Sender: `CONTRACT_FROM_EMAIL` (default `contracts@optimisedigital.online`).
 * That domain must be verified in Postmark (Sender Signatures / DKIM) or
 * the API will return a 422.
 */
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

  if (!doc.clientEmail) {
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

  const POSTMARK_API_KEY = process.env.POSTMARK_API_KEY;
  if (!POSTMARK_API_KEY) {
    return NextResponse.json(
      { error: "POSTMARK_API_KEY not configured" },
      { status: 500 },
    );
  }

  const baseUrl =
    process.env.NEXT_PUBLIC_SERVER_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "http://localhost:3004");
  const signingUrl = `${baseUrl}/contracts/sign/${doc.signingToken}`;

  const fromEmail =
    process.env.CONTRACT_FROM_EMAIL || "contracts@optimisedigital.online";
  // Postmark renders "From" as `Name <email>` when given that format. Match
  // Brevo's previous behaviour by including the agency display name.
  const fromHeader = `Optimise Digital <${fromEmail}>`;
  const contractTitle = doc.contractTitle || "Service Contract";
  const recipientName = doc.clientContactName || doc.clientName || "Client";
  const agencyContactName = doc.agencyContactName || "Optimise Digital";

  try {
    const res = await fetch("https://api.postmarkapp.com/email", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Postmark-Server-Token": POSTMARK_API_KEY,
      },
      body: JSON.stringify({
        From: fromHeader,
        To: doc.clientEmail,
        Subject: `Contract for Review: ${contractTitle}`,
        HtmlBody: generateSigningInviteEmail({
          recipientName,
          contractTitle,
          signingUrl,
          senderName: agencyContactName,
        }),
        MessageStream: "outbound",
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error(
        `[postmark] Send contract invite error (${res.status}):`,
        text,
      );
      // Postmark returns JSON like { ErrorCode: 422, Message: "..." }.
      // Surface both fields to the UI so the operator can diagnose without
      // digging through Vercel logs. Falls back to raw text on non-JSON.
      let postmarkCode: number | undefined;
      let postmarkMessage: string | undefined;
      try {
        const parsed = JSON.parse(text) as {
          ErrorCode?: number;
          Message?: string;
        };
        postmarkCode = parsed.ErrorCode;
        postmarkMessage = parsed.Message;
      } catch {
        postmarkMessage = text.slice(0, 300);
      }
      const detail =
        [postmarkCode, postmarkMessage].filter(Boolean).join(" — ") ||
        `HTTP ${res.status}`;
      return NextResponse.json(
        {
          error: `Postmark rejected the send (${res.status}): ${detail}`,
          postmarkStatus: res.status,
          postmarkCode,
          postmarkMessage,
        },
        { status: 502 },
      );
    }

    // Postmark's success response carries a MessageID we can persist for
    // delivery tracking (matches the invoice-statement-drafts pattern). Not
    // wired to a Contracts field yet — log it for now.
    try {
      const success = (await res.clone().json()) as { MessageID?: string };
      if (success.MessageID) {
        console.log(
          `[postmark] Signing invite sent to ${doc.clientEmail} — MessageID ${success.MessageID}`,
        );
      } else {
        console.log(`[postmark] Signing invite sent to ${doc.clientEmail}`);
      }
    } catch {
      console.log(`[postmark] Signing invite sent to ${doc.clientEmail}`);
    }

    logActivity(payload, {
      type: "contract_sent",
      title: `Contract email sent: ${contractTitle}`,
      description: `Sent to ${doc.clientEmail}`,
      user: user.id,
    }).catch(() => {});

    return NextResponse.json({ ok: true, sentTo: doc.clientEmail });
  } catch (err: any) {
    console.error("[postmark] Send email failed:", err.message);
    return NextResponse.json(
      { error: `Failed to send email: ${err.message}` },
      { status: 500 },
    );
  }
}
