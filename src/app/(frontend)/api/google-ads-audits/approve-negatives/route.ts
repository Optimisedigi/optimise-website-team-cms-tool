import { NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { headers as nextHeaders } from "next/headers";

const GROWTH_TOOLS_URL = process.env.GROWTH_TOOLS_URL || "http://localhost:5000";
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || "";

/**
 * POST /api/google-ads-audits/approve-negatives
 *
 * Called from CMS UI when team approves a pending negative keyword batch.
 * Forwards the approved keywords to Growth Tools for application via
 * the Google Ads mutate API, then updates the sweep history status.
 *
 * Body: { auditId: string, action: "approve" | "skip" }
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
    const { auditId, action } = body;

    if (!auditId || !["approve", "skip"].includes(action)) {
      return NextResponse.json(
        { error: "auditId and action (approve|skip) are required" },
        { status: 400 },
      );
    }

    // Fetch the audit doc
    const doc = await payload.findByID({
      collection: "google-ads-audits",
      id: auditId,
    });

    if (!doc) {
      return NextResponse.json({ error: "Audit not found" }, { status: 404 });
    }

    const pending = (doc as any).negativeSweepPendingApproval;
    if (!pending || (Array.isArray(pending) && pending.length === 0)) {
      return NextResponse.json(
        { error: "No pending negatives to approve" },
        { status: 400 },
      );
    }

    if (action === "skip") {
      // Clear pending and update latest history entry status
      await payload.update({
        collection: "google-ads-audits",
        id: auditId,
        data: {
          negativeSweepPendingApproval: null,
        } as any,
      });
      return NextResponse.json({ ok: true, action: "skipped" });
    }

    // action === "approve" — call Growth Tools to apply
    if (!INTERNAL_API_KEY) {
      return NextResponse.json(
        { error: "INTERNAL_API_KEY not configured" },
        { status: 503 },
      );
    }

    const applyRes = await fetch(
      `${GROWTH_TOOLS_URL}/api/google-ads/negative-sweep/apply`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Internal-Key": INTERNAL_API_KEY,
        },
        body: JSON.stringify({
          customerId: (doc as any).customerId,
          keywords: pending,
          cmsDocId: auditId,
        }),
      },
    );

    if (!applyRes.ok) {
      const errText = await applyRes.text();
      return NextResponse.json(
        { error: `Growth Tools apply failed: ${errText}` },
        { status: 502 },
      );
    }

    const result = await applyRes.json();

    // Clear pending approval
    await payload.update({
      collection: "google-ads-audits",
      id: auditId,
      data: {
        negativeSweepPendingApproval: null,
      } as any,
    });

    return NextResponse.json({
      ok: true,
      action: "approved",
      successCount: result.successCount,
      errors: result.errors,
    });
  } catch (err) {
    console.error("[approve-negatives] error:", err);
    return NextResponse.json(
      { error: "Failed to process approval" },
      { status: 500 },
    );
  }
}
