import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { loadReviewContract } from "@/lib/contract-review-server";

/**
 * DELETE /api/contracts/review/:token/comments/:commentId
 *
 * Lets the reviewer withdraw a comment they haven't sent yet. Comments that
 * were already emailed stay, so the agency's record matches its inbox.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string; commentId: string }> },
) {
  const { token, commentId } = await params;
  const payload = await getPayload({ config: await config });

  const loaded = await loadReviewContract(payload, token, new Date());
  if (!loaded.ok) {
    return NextResponse.json({ error: loaded.error, code: loaded.code }, { status: loaded.status });
  }

  if (!/^\d+$/.test(commentId)) {
    return NextResponse.json({ error: "Comment not found" }, { status: 404 });
  }

  // Scope the lookup to this contract so one link can't touch another
  // contract's comments.
  const found = await payload.find({
    collection: "contract-review-comments",
    where: {
      and: [{ id: { equals: commentId } }, { contract: { equals: loaded.doc.id } }],
    },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });
  const comment = found.docs[0] as { id: number | string; emailedAt?: string | null } | undefined;
  if (!comment) {
    return NextResponse.json({ error: "Comment not found" }, { status: 404 });
  }
  if (comment.emailedAt) {
    return NextResponse.json(
      { error: "This comment has already been sent, so it can't be removed." },
      { status: 409 },
    );
  }

  await payload.delete({ collection: "contract-review-comments", id: comment.id, depth: 0, overrideAccess: true });
  return NextResponse.json({ ok: true });
}
