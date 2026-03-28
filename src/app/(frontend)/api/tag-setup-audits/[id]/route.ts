import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });

  // Auth check
  const { user } = await payload.auth({ headers: req.headers });
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const audit = await payload.findByID({
      collection: "tag-setup-audits",
      id,
      overrideAccess: true,
    });

    return NextResponse.json(audit);
  } catch {
    return NextResponse.json({ error: "Audit not found" }, { status: 404 });
  }
}
