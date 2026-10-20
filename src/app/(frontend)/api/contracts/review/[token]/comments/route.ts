import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import {
  REVIEW_MAX_COMMENTS_PER_CONTRACT,
  toPublicReviewComment,
  validateReviewComment,
} from "@/lib/contract-review";
import { loadReviewContract } from "@/lib/contract-review-server";

/**
 * POST /api/contracts/review/:token/comments
 * Body: { quote, occurrence, section, comment }
 *
 * Saves one inline comment from the reviewer. Comments are stored straight
 * away (so nothing is lost if the reviewer never presses Send) and emailed
 * later as a batch by /send.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const payload = await getPayload({ config: await config });

  const loaded = await loadReviewContract(payload, token, new Date());
  if (!loaded.ok) {
    return NextResponse.json({ error: loaded.error, code: loaded.code }, { status: loaded.status });
  }
  const { doc } = loaded;

  const parsed = validateReviewComment(await req.json().catch(() => null));
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const existing = await payload.count({
    collection: "contract-review-comments",
    where: { contract: { equals: doc.id } },
    overrideAccess: true,
  });
  if (existing.totalDocs >= REVIEW_MAX_COMMENTS_PER_CONTRACT) {
    return NextResponse.json(
      { error: "This draft has reached its comment limit. Please contact us directly." },
      { status: 429 },
    );
  }

  const created = await payload.create({
    collection: "contract-review-comments",
    data: {
      contract: doc.id,
      ...parsed.value,
      authorName: doc.accountManagerName || "",
      resolved: false,
    },
    depth: 0,
    overrideAccess: true,
  });

  return NextResponse.json(
    { comment: toPublicReviewComment(created as unknown as Record<string, unknown>) },
    { status: 201 },
  );
}
