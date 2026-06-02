import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getPayload } from "payload";
import { headers as getHeaders } from "next/headers";
import config from "@/payload.config";
import { runMonthlyBudgetRecommendations } from "@/lib/google-ads-monthly-budget-recommendations";

export const maxDuration = 300;

/**
 * Monthly Google Ads budget recommendation engine.
 *
 * This endpoint is kept for manual/admin use and backward compatibility. The
 * normal recurring schedule is now managed through `scheduled-agent-tasks` with
 * taskType='monthly-budget-recommendations'.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured" },
      { status: 500 },
    );
  }

  const authHeader = req.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const expected = Buffer.from(cronSecret);
  const provided = Buffer.from(token);
  if (
    expected.length !== provided.length ||
    !crypto.timingSafeEqual(expected, provided)
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cfg = await config;
  const payload = await getPayload({ config: cfg });
  try {
    const result = await runMonthlyBudgetRecommendations(payload, { triggeredBy: "cron" });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

export async function POST(): Promise<NextResponse> {
  const cfg = await config;
  const payload = await getPayload({ config: cfg });
  const reqHeaders = await getHeaders();
  const { user } = await payload.auth({ headers: reqHeaders });
  if (!user || (user as { role?: string }).role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const result = await runMonthlyBudgetRecommendations(payload, {
      triggeredBy: "manual",
      triggeredByEmail: (user as { email?: string }).email,
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
