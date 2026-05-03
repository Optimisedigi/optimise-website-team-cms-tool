import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { runPrewarm } from "../route";

export const maxDuration = 300;

/**
 * POST /api/dashboard/prewarm/run
 *
 * Admin-only manual trigger for the dashboard cache prewarm. Same fan-out
 * as the cron route, but uses Payload session auth instead of CRON_SECRET
 * so admins can re-run from the browser without juggling the secret.
 */
export async function POST(req: NextRequest) {
  const payload = await getPayload({ config });
  const { user } = await payload.auth({ headers: req.headers });

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if ((user as any).role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const summary = await runPrewarm(payload);
  return NextResponse.json(summary);
}
