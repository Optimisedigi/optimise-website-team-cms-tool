import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { logActivity } from "@/lib/activity-log";
import { sendBrevoEmail } from "@/lib/brevo-email";
import { generateReviewCommentsEmail } from "@/lib/contract-email";
import {
  DEFAULT_AGENCY_CONTACT_EMAIL,
  REVIEW_MAX_COMMENTS_PER_CONTRACT,
  contractAdminUrlFor,
  contractEmailSender,
  reviewUrlFor,
} from "@/lib/contract-review";
import { loadReviewContract } from "@/lib/contract-review-server";

/**
 * POST /api/contracts/review/:token/send
 *
 * Emails every not-yet-sent comment to the contract's Agency Contact as one
 * summary, then marks them sent. Comments are only marked after the email
 * succeeds, so a failed send can simply be retried.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const payload = await getPayload({ config: await config });

  const now = new Date();
  const loaded = await loadReviewContract(payload, token, now);
  if (!loaded.ok) {
    return NextResponse.json({ error: loaded.error, code: loaded.code }, { status: loaded.status });
  }
  const { doc } = loaded;

  const pending = await payload.find({
    collection: "contract-review-comments",
    where: {
      and: [
        { contract: { equals: doc.id } },
        { or: [{ emailedAt: { exists: false } }, { emailedAt: { equals: null } }] },
      ],
    },
    sort: "createdAt",
    limit: REVIEW_MAX_COMMENTS_PER_CONTRACT,
    depth: 0,
    overrideAccess: true,
  });
  const comments = pending.docs as unknown as Array<{
    id: number | string;
    quote?: string | null;
    section?: string | null;
    comment?: string | null;
  }>;
  if (comments.length === 0) {
    return NextResponse.json({ error: "There are no new comments to send." }, { status: 400 });
  }

  const recipientEmail = doc.agencyContactEmail || DEFAULT_AGENCY_CONTACT_EMAIL;
  const recipientName = doc.agencyContactName || "Optimise Digital";
  const reviewerName = doc.accountManagerName || "The account manager";
  const contractTitle = doc.contractTitle || "Service Contract";

  const result = await sendBrevoEmail({
    sender: contractEmailSender(),
    to: [{ email: recipientEmail, name: recipientName }],
    ...(doc.accountManagerEmail && {
      replyTo: { email: doc.accountManagerEmail, name: doc.accountManagerName || undefined },
    }),
    subject: `Draft contract comments (${comments.length}): ${contractTitle}`,
    htmlContent: generateReviewCommentsEmail({
      recipientName,
      reviewerName,
      contractTitle,
      comments: comments.map((c) => ({
        quote: c.quote ?? "",
        section: c.section ?? "",
        comment: c.comment ?? "",
      })),
      adminUrl: contractAdminUrlFor(doc.id),
      reviewUrl: reviewUrlFor(token),
    }),
  });
  if (!result.ok) {
    console.error("[contract-review] Comment email failed:", result.code, result.message);
    return NextResponse.json(
      { error: "We couldn't send your comments just now. They're saved — please try again shortly." },
      { status: 502 },
    );
  }

  const emailedAt = now.toISOString();
  await payload.update({
    collection: "contract-review-comments",
    where: { id: { in: comments.map((c) => c.id) } },
    data: { emailedAt },
    depth: 0,
    overrideAccess: true,
  });

  logActivity(payload, {
    type: "contract_sent",
    title: `Draft review comments received: ${contractTitle}`,
    description: `${comments.length} comment${comments.length === 1 ? "" : "s"} from ${reviewerName}`,
  }).catch(() => {});

  return NextResponse.json({ ok: true, sent: comments.length, emailedAt });
}
