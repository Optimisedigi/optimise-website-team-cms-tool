import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { userHasFeature } from "@/lib/access";
import { logActivity } from "@/lib/activity-log";
import { sendBrevoEmail } from "@/lib/brevo-email";
import { generateReviewInviteEmail } from "@/lib/contract-email";
import {
  REVIEW_LINK_TTL_DAYS,
  contractEmailSender,
  reviewLinkExpiresAt,
  reviewUrlFor,
} from "@/lib/contract-review";
import { generateReviewToken } from "@/lib/contract-review-server";

/**
 * POST /api/contracts/:id/review-link
 * Body: { regenerate?: boolean, email?: boolean }
 *
 * Creates (or, with `regenerate`, replaces) the draft review link for the
 * contract's account manager, and optionally emails it to them. An existing
 * in-date link is reused unless `regenerate` is set, so re-sending the email
 * never breaks a link the reviewer already has open.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const payload = await getPayload({ config: await config });

  const { user } = await payload.auth({ headers: req.headers });
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!userHasFeature(user, "contracts")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as { regenerate?: unknown; email?: unknown };
  const regenerate = body.regenerate === true;
  const sendEmail = body.email === true;

  let doc: any;
  try {
    doc = await payload.findByID({ collection: "contracts", id, depth: 0, overrideAccess: true });
  } catch {
    return NextResponse.json({ error: "Contract not found" }, { status: 404 });
  }
  if (!doc || doc.deletedAt) {
    return NextResponse.json({ error: "Contract not found" }, { status: 404 });
  }
  if (doc.isTemplate) {
    return NextResponse.json({ error: "Templates can't be sent for review." }, { status: 400 });
  }
  if (doc.status !== "draft") {
    return NextResponse.json(
      { error: "Only draft contracts can be sent for review." },
      { status: 400 },
    );
  }

  const recipientEmail = typeof doc.accountManagerEmail === "string" ? doc.accountManagerEmail.trim() : "";
  if (sendEmail && !recipientEmail) {
    return NextResponse.json(
      { error: "Add an Account Manager email in Contract Details and save first." },
      { status: 400 },
    );
  }

  const now = new Date();
  const currentExpiry = doc.reviewTokenExpiresAt ? new Date(doc.reviewTokenExpiresAt) : null;
  const hasLiveLink = Boolean(doc.reviewToken) && currentExpiry != null && currentExpiry > now;

  let token: string = doc.reviewToken;
  let expiresAt: Date = currentExpiry ?? now;
  if (regenerate || !hasLiveLink) {
    token = generateReviewToken();
    expiresAt = reviewLinkExpiresAt(now);
  }

  await payload.update({
    collection: "contracts",
    id,
    data: {
      reviewToken: token,
      reviewTokenExpiresAt: expiresAt.toISOString(),
      reviewSentAt: now.toISOString(),
    },
    depth: 0,
    overrideAccess: true,
  });

  const reviewUrl = reviewUrlFor(token);
  const contractTitle = doc.contractTitle || "Service Contract";

  if (sendEmail) {
    const sender = contractEmailSender();
    const recipientName = doc.accountManagerName || "there";
    const result = await sendBrevoEmail({
      sender,
      to: [{ email: recipientEmail, name: doc.accountManagerName || undefined }],
      ...(doc.agencyContactEmail && {
        replyTo: { email: doc.agencyContactEmail, name: doc.agencyContactName || sender.name },
      }),
      subject: `Draft contract for your review: ${contractTitle}`,
      htmlContent: generateReviewInviteEmail({
        recipientName,
        contractTitle,
        reviewUrl,
        senderName: doc.agencyContactName || sender.name,
        expiresInDays: Math.max(1, Math.ceil((expiresAt.getTime() - now.getTime()) / 86_400_000)),
      }),
    });
    if (!result.ok) {
      const detail = [result.code, result.message].filter(Boolean).join(" — ") || "unknown error";
      return NextResponse.json(
        { error: `The review link was created but the email failed: ${detail}`, reviewUrl, expiresAt: expiresAt.toISOString() },
        { status: 502 },
      );
    }
  }

  logActivity(payload, {
    type: "contract_link_generated",
    title: `Draft review link ${sendEmail ? "emailed" : "created"}: ${contractTitle}`,
    description: sendEmail ? `Sent to ${recipientEmail}` : `Valid for ${REVIEW_LINK_TTL_DAYS} days`,
    user: user.id,
  }).catch(() => {});

  return NextResponse.json({
    ok: true,
    reviewUrl,
    expiresAt: expiresAt.toISOString(),
    ...(sendEmail && { sentTo: recipientEmail }),
  });
}
