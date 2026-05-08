import { NextResponse } from "next/server";
import { headers as nextHeaders } from "next/headers";
import { getPayload } from "payload";
import config from "@/payload.config";
import { markApproved } from "@/lib/agents/_shared/approval-queue";

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

    await markApproved(numericId, user.id as number);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[agent-approvals/approve] error:", err);
    return NextResponse.json(
      { error: (err as Error).message || "Failed to approve" },
      { status: 500 },
    );
  }
}
