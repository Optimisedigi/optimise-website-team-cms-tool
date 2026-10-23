import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { validateDashboardToken } from "../../../dashboard/verify/route";
import { toClientPlacement } from "@/lib/content-map/client-view";
import { findReportClient, validReportSlug } from "@/lib/content-map/paths";
import { checkClientPlacementLimit, parsePlacementBody, placeIdea } from "@/lib/content-map/placement";
import { isRecord } from "@/lib/content-map/types";

export const maxDuration = 120;

/** Client placement check from the PIN view: cookie for this exact slug, client from the slug, 20 / day / client. */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const body: unknown = await request.json().catch(() => null);
  if (!isRecord(body)) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  if (!validReportSlug(body.slug)) return NextResponse.json({ error: "slug is invalid" }, { status: 400 });
  try {
    const payload = await getPayload({ config });
    const client = await findReportClient(payload, body.slug);
    if (!client || !validateDashboardToken((await cookies()).get("dashboard_token")?.value, client.slug)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const input = parsePlacementBody(body);
    if (!input.ok) return NextResponse.json({ error: input.error }, { status: input.status });
    const limit = await checkClientPlacementLimit(payload, client.id, input.value.title);
    if (!limit.ok) return NextResponse.json({ error: limit.error }, { status: limit.status });
    const res = await placeIdea(payload, client.id, input.value);
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
    return NextResponse.json({ placement: toClientPlacement(res.value) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (err) {
    console.error("[content-map] client placement failed:", (err as Error).message);
    return NextResponse.json({ error: "Failed to place the idea" }, { status: 500 });
  }
}
