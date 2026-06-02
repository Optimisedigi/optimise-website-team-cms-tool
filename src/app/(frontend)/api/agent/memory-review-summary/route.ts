import { NextResponse } from "next/server";
import { getPayload } from "payload";
import { headers as nextHeaders } from "next/headers";
import config from "@/payload.config";

interface MemoryDoc {
  status?: string | null;
  importance?: number | null;
  confidence?: number | null;
  useCount?: number | null;
  lastAccessedAt?: string | null;
  reviewAfter?: string | null;
  expiresAt?: string | null;
}

/**
 * GET /api/agent/memory-review-summary
 *
 * Admin-only summary for the OptiMate Settings memory tab. Keeps memory review
 * lightweight without loading full client facts into the settings UI.
 */
export async function GET() {
  const payload = await getPayload({ config });
  const headersList = await nextHeaders();
  const { user } = await payload.auth({ headers: headersList });
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if ((user as { role?: string }).role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const result = await payload.find({
      collection: "agent-memory" as never,
      limit: 1000,
      overrideAccess: true,
      depth: 0,
    });
    const docs = result.docs as unknown as MemoryDoc[];
    const now = Date.now();
    const staleBefore = now - 90 * 24 * 60 * 60 * 1000;

    let active = 0;
    let pinned = 0;
    let needsReview = 0;
    let archived = 0;
    let stale = 0;
    let neverUsed = 0;
    let lowConfidence = 0;
    let dueForReview = 0;
    let expired = 0;

    for (const doc of docs) {
      const status = doc.status ?? "active";
      if (status === "archived") archived += 1;
      else active += 1;
      if (status === "needs_review") needsReview += 1;
      if (status !== "archived" && Number(doc.importance ?? 0) >= 80) pinned += 1;
      if (Number(doc.useCount ?? 0) === 0) neverUsed += 1;
      if (Number(doc.confidence ?? 100) < 60) lowConfidence += 1;
      if (doc.lastAccessedAt && new Date(doc.lastAccessedAt).getTime() < staleBefore) stale += 1;
      if (doc.reviewAfter && new Date(doc.reviewAfter).getTime() <= now) dueForReview += 1;
      if (doc.expiresAt && new Date(doc.expiresAt).getTime() <= now) expired += 1;
    }

    return NextResponse.json({
      total: docs.length,
      active,
      pinned,
      needsReview,
      archived,
      stale,
      neverUsed,
      lowConfidence,
      dueForReview,
      expired,
    });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message || "Failed to load memory summary" },
      { status: 500 },
    );
  }
}
