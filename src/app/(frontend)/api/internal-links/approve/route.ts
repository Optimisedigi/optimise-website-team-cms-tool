import { NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { headers as nextHeaders } from "next/headers";

const GROWTH_TOOLS_URL = process.env.GROWTH_TOOLS_URL || "http://localhost:5000";
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || "";

/**
 * POST /api/internal-links/approve
 *
 * Approve or reject internal link suggestions from the CMS admin.
 * Updates the suggestion status locally and syncs back to Growth Tools.
 *
 * Body: { suggestionIds: string[], action: "approve" | "reject" }
 */
export async function POST(request: Request) {
  try {
    const payload = await getPayload({ config });
    const headersList = await nextHeaders();
    const { user } = await payload.auth({ headers: headersList });
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { suggestionIds, action } = body;

    if (
      !suggestionIds ||
      !Array.isArray(suggestionIds) ||
      suggestionIds.length === 0 ||
      !["approve", "reject"].includes(action)
    ) {
      return NextResponse.json(
        { error: "suggestionIds (array) and action (approve|reject) are required" },
        { status: 400 },
      );
    }

    const results: Array<{ id: string; ok: boolean; error?: string }> = [];

    for (const id of suggestionIds) {
      try {
        // Update in CMS
        await payload.update({
          collection: "internal-link-suggestions" as any,
          id,
          data: {
            status: action === "approve" ? "approved" : "rejected",
            approvedBy: user.email || user.id,
            approvedAt: action === "approve" ? new Date().toISOString() : null,
          } as any,
        });

        results.push({ id, ok: true });
      } catch (err: any) {
        results.push({ id, ok: false, error: err.message });
      }
    }

    // Sync status back to Growth Tools if the API key is configured
    if (INTERNAL_API_KEY) {
      const successIds = results.filter(r => r.ok).map(r => r.id);

      if (successIds.length > 0) {
        // Fetch the updated docs to get sourceUrl/targetUrl for matching
        const docs = await Promise.all(
          successIds.map(id =>
            payload.findByID({ collection: "internal-link-suggestions" as any, id }).catch(() => null)
          )
        );
        const suggestions = docs
          .filter((d): d is any => d !== null)
          .map(d => ({ sourceUrl: d.sourceUrl, targetUrl: d.targetUrl }));

        // Fire and forget — sync back to Growth Tools
        fetch(`${GROWTH_TOOLS_URL}/api/topic-clusters/suggestions/sync-status`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Internal-Key": INTERNAL_API_KEY,
          },
          body: JSON.stringify({
            suggestions,
            status: action === "approve" ? "approved" : "rejected",
            approvedBy: user.email || user.id,
          }),
        }).catch(err => {
          console.error("[internal-links/approve] Growth Tools sync failed:", err.message);
        });
      }
    }

    const successCount = results.filter(r => r.ok).length;
    const failCount = results.filter(r => !r.ok).length;

    return NextResponse.json({
      ok: true,
      action,
      successCount,
      failCount,
      results,
    });
  } catch (err) {
    console.error("[internal-links/approve] error:", err);
    return NextResponse.json(
      { error: "Failed to process approval" },
      { status: 500 },
    );
  }
}
