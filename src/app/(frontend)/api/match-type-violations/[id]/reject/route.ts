import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { logActivity } from "@/lib/activity-log";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const { id } = await params;

  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });

  const { user } = await payload.auth({ headers: req.headers });
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const candidate = await (payload.findByID as any)({
    collection: "match-type-violation-candidates",
    id,
    depth: 1,
    overrideAccess: true,
  }).catch(() => null);

  if (!candidate) {
    return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
  }

  const now = new Date().toISOString();

  await (payload.update as any)({
    collection: "match-type-violation-candidates",
    id,
    data: {
      status: "rejected",
      rejectedAt: now,
    },
    overrideAccess: true,
  });

  await logActivity(payload, {
    type: "match_type_violation_rejected",
    title: `Match type violation rejected: "${(candidate as any).searchTerm}"`,
    description: `Violation type: ${(candidate as any).violationType}`,
    user: typeof user.id === "object" ? (user.id as any).id : user.id,
    client: typeof (candidate as any).client === "object"
      ? (candidate as any).client?.id
      : (candidate as any).client,
  });

  return NextResponse.json({ ok: true });
}
