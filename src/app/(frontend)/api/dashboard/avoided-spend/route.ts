import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { validateDashboardToken } from "../verify/route";
import {
  warmAvoidedSpendForClient,
  buildAvoidedSpendResponse,
} from "@/lib/avoided-spend-warmer";

const DEFAULT_MONTHS_BACK = 12;

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("slug");
  const clientIdParam = req.nextUrl.searchParams.get("clientId");
  const customerId = req.nextUrl.searchParams.get("customerId") || "";
  const monthsBack = Math.min(
    36,
    Math.max(
      1,
      parseInt(
        req.nextUrl.searchParams.get("monthsBack") || String(DEFAULT_MONTHS_BACK),
        10,
      ) || DEFAULT_MONTHS_BACK,
    ),
  );

  if (!slug || !clientIdParam) {
    return NextResponse.json({ error: "Missing slug or clientId" }, { status: 400 });
  }

  const token = req.cookies.get("dashboard_token")?.value;
  if (!validateDashboardToken(token, slug)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const clientId = parseInt(clientIdParam, 10);
  if (Number.isNaN(clientId)) {
    return NextResponse.json({ error: "Invalid clientId" }, { status: 400 });
  }

  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });

  // Run the warmer (read-through cache): pulls NKLs, computes misses,
  // refreshes from Growth Tools as needed, mutates the in-memory cache.
  const result = await warmAvoidedSpendForClient(
    payload,
    clientId,
    customerId,
    monthsBack,
  );

  const response = buildAvoidedSpendResponse(result);

  const out = NextResponse.json(response);
  out.headers.set("Cache-Control", "no-store");
  return out;
}
