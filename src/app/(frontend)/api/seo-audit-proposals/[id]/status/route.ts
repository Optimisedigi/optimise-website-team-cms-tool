import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";

/**
 * Polling endpoint for the SEO Audit Proposal run. Returns the current status,
 * stage label, and percent parsed from the `progress` field ("stage|percent").
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });

  const { user } = await payload.auth({ headers: req.headers });
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const record = await payload.findByID({
      collection: "seo-audit-proposals",
      id,
      overrideAccess: true,
    });

    const r = record as any;
    const progressRaw = r.progress as string | null;
    let stage = "";
    let percent = 0;
    if (progressRaw && progressRaw.includes("|")) {
      const [s, pStr] = progressRaw.split("|");
      stage = s;
      percent = parseInt(pStr, 10) || 0;
    }

    return NextResponse.json({
      status: r.status || "pending",
      stage,
      percent,
      error: r.error || null,
      reportSlug: r.reportSlug || null,
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
