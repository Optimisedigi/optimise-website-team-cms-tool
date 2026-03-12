import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";

export const maxDuration = 30;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const payloadConfig = await config;
    const payload = await getPayload({ config: payloadConfig });

    const { user } = await payload.auth({ headers: req.headers });
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const audit = await payload.findByID({
      collection: "gsc-indexing-audits",
      id,
      overrideAccess: true,
    });

    return NextResponse.json(audit);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch audit";
    console.error("[gsc-indexing-audit]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
