import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { buildContractView } from "@/lib/contract-view";
import { REVIEW_MAX_COMMENTS_PER_CONTRACT, toPublicReviewComment } from "@/lib/contract-review";
import { loadReviewContract } from "@/lib/contract-review-server";

/**
 * GET /api/contracts/review/:token
 * Public (token-gated) read of a draft contract plus the reviewer's comments.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const payload = await getPayload({ config: await config });

  const loaded = await loadReviewContract(payload, token, new Date());
  if (!loaded.ok) {
    return NextResponse.json({ error: loaded.error, code: loaded.code }, { status: loaded.status });
  }
  const { doc } = loaded;

  const comments = await payload.find({
    collection: "contract-review-comments",
    where: { contract: { equals: doc.id } },
    sort: "createdAt",
    limit: REVIEW_MAX_COMMENTS_PER_CONTRACT,
    depth: 0,
    overrideAccess: true,
  });

  return NextResponse.json(
    {
      contract: await buildContractView(payload, doc),
      reviewerName: doc.accountManagerName || "",
      comments: comments.docs.map((c) => toPublicReviewComment(c as unknown as Record<string, unknown>)),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
