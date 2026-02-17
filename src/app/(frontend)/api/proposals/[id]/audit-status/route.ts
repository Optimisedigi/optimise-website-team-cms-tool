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

  const { user } = await payload.auth({ headers: req.headers });
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const proposal = await payload.findByID({
      collection: "client-proposals",
      id,
      overrideAccess: true,
    });

    const p = proposal as any;
    const progressRaw = p.auditProgress as string | null;
    let stage = "";
    let percent = 0;

    if (progressRaw && progressRaw.includes("|")) {
      const [s, pStr] = progressRaw.split("|");
      stage = s;
      percent = parseInt(pStr, 10) || 0;
    }

    return NextResponse.json({
      status: p.auditStatus || "pending",
      stage,
      percent,
      error: p.auditError || null,
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
