import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { validateDashboardToken } from "../verify/route";

/**
 * POST /api/dashboard/secondary-conversion-actions
 *
 * Persists which secondary conversion actions the team has hidden from the
 * Google Ads dashboard KPI bar, so the choice survives a refresh instead of
 * living only in component state.
 *
 * Exclusions are stored (not inclusions) so an action that only starts
 * converting later still shows up by default rather than being silently
 * dropped. Saved newline-separated on the client record to match the
 * existing `dashboardConversionActions` field.
 *
 * Body: { clientId: string | number, slug: string, hiddenActions: string[] }
 * Auth: the same `dashboard_token` cookie that gates viewing the dashboard.
 */
export async function POST(req: NextRequest) {
  try {
    const token = req.cookies.get("dashboard_token")?.value;
    const body = await req.json();
    const { clientId, slug, hiddenActions } = body as {
      clientId?: string | number;
      slug?: string;
      hiddenActions?: unknown;
    };

    if (!clientId || !slug || !Array.isArray(hiddenActions)) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (!validateDashboardToken(token, slug)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Trim, drop blanks, and dedupe while preserving order. Action names are
    // matched exactly elsewhere, so casing is preserved rather than folded.
    const seen = new Set<string>();
    const cleaned: string[] = [];
    for (const raw of hiddenActions) {
      if (typeof raw !== "string") continue;
      const trimmed = raw.trim();
      if (!trimmed || seen.has(trimmed)) continue;
      seen.add(trimmed);
      cleaned.push(trimmed);
    }

    const payloadConfig = await config;
    const payload = await getPayload({ config: payloadConfig });

    await payload.update({
      collection: "clients",
      id: typeof clientId === "string" ? Number(clientId) : clientId,
      data: {
        dashboardHiddenSecondaryConversionActions: cleaned.join("\n"),
      },
      overrideAccess: true,
    });

    return NextResponse.json({ success: true, count: cleaned.length });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to save secondary conversion actions";
    console.error("[Dashboard SecondaryConversionActions POST]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
