import { NextResponse } from "next/server";
import { headers as nextHeaders } from "next/headers";
import { getPayload } from "payload";
import config from "@/payload.config";
import { markApplied } from "@/lib/agents/_shared/approval-queue";

/**
 * v1 stub: apply just marks the row as applied. Operator pushes the change
 * manually via the existing per-proposalType flow (e.g. NLB for negative
 * keywords). A later phase will dispatch on proposalType and call the actual
 * apply-side tool.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const payload = await getPayload({ config });
    const headersList = await nextHeaders();
    const { user } = await payload.auth({ headers: headersList });
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const numericId = Number(id);
    if (!Number.isFinite(numericId)) {
      return NextResponse.json({ error: "Invalid approval id" }, { status: 400 });
    }

    // Guard: only applied from approved.
    const doc = (await payload.findByID({
      collection: "agent-approval-queue" as any,
      id: numericId,
      overrideAccess: true,
    })) as { status?: string };
    if (doc.status !== "approved") {
      return NextResponse.json(
        { error: `Cannot apply from status="${doc.status}". Approve first.` },
        { status: 400 },
      );
    }

    await markApplied(numericId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[agent-approvals/apply] error:", err);
    return NextResponse.json(
      { error: (err as Error).message || "Failed to apply" },
      { status: 500 },
    );
  }
}
