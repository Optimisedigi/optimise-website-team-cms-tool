import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";

/**
 * POST /api/dashboard/monthly-waste-relevancy/clear
 *
 * Wipes the per-month waste/relevancy cache for one client so the next
 * dashboard request re-fetches every month from Google Ads. Used after
 * adding NKL entries when the agency wants past months retroactively
 * credited (the auto-clear hook on `negative-keyword-lists` covers most
 * cases — this is the safety hatch).
 *
 * Auth: Payload user session (agency-only — clients on PIN-gated dashboards
 * never see this button).
 */
export async function POST(req: NextRequest) {
  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });

  const { user } = await payload.auth({ headers: req.headers });
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { clientId?: number | string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const clientId = Number(body.clientId);
  if (!clientId || Number.isNaN(clientId)) {
    return NextResponse.json({ error: "clientId is required" }, { status: 400 });
  }

  try {
    const result = await payload.delete({
      collection: "negative-keyword-monthly-waste-relevancy-cache",
      where: { client: { equals: clientId } },
      overrideAccess: true,
    });
    return NextResponse.json({
      success: true,
      cleared: Array.isArray(result?.docs) ? result.docs.length : 0,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to clear cache" },
      { status: 500 },
    );
  }
}
