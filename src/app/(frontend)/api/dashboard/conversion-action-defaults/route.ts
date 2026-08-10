import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { validateDashboardToken } from "../verify/route";

/**
 * POST /api/dashboard/conversion-action-defaults
 *
 * Saves the Google Ads dashboard's conversion selections onto the client
 * record so they survive a refresh, mirroring the CMS
 * Clients > Google Ads > Default Conversion Actions picker.
 *
 * Body (both selection fields optional — send only what changed):
 *   {
 *     clientId: string | number,
 *     slug: string,
 *     selectedActions?: string[],        // primary -> dashboardConversionActions
 *     hiddenSecondaryActions?: string[], // secondary -> dashboardHiddenSecondaryConversionActions
 *   }
 *
 * Primary actions drive the Conversions KPI, so saving them also syncs
 * `conversionActionCategories` exactly as the CMS picker does — one row per
 * selected action, reusing any existing label/colour. Without that the KPI
 * bar would fall back to raw action names for newly added actions.
 *
 * Secondary exclusions are stored rather than inclusions so an action that
 * only starts converting later still appears by default.
 *
 * Auth: the same `dashboard_token` cookie that gates viewing the dashboard.
 */

/** Trim, drop blanks, dedupe, preserve order. Names are matched exactly, so casing is kept. */
export function cleanActionNames(input: unknown[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input) {
    if (typeof raw !== "string") continue;
    const trimmed = raw.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

interface CategoryRow {
  label: string;
  color: string;
  actions: string;
}

/**
 * Rebuild the category rows for `selected`, preserving the label and colour
 * already configured for an action. Mirrors ConversionActionPickerView's
 * `syncCategories` so both entry points produce identical data.
 */
export function syncCategories(selected: string[], existing: unknown): CategoryRow[] {
  const byAction = new Map<string, { label?: string; color?: string }>();
  if (Array.isArray(existing)) {
    for (const row of existing) {
      if (!row || typeof row !== "object") continue;
      const { label, color, actions } = row as Record<string, unknown>;
      if (typeof actions !== "string") continue;
      for (const name of actions.split("\n").map((s) => s.trim()).filter(Boolean)) {
        if (byAction.has(name)) continue;
        byAction.set(name, {
          label: typeof label === "string" ? label : undefined,
          color: typeof color === "string" ? color : undefined,
        });
      }
    }
  }

  return selected.map((action) => {
    const prior = byAction.get(action);
    return {
      label: prior?.label?.trim() || action,
      color: prior?.color || "sky",
      actions: action,
    };
  });
}

export async function POST(req: NextRequest) {
  try {
    const token = req.cookies.get("dashboard_token")?.value;
    const body = await req.json();
    const { clientId, slug, selectedActions, hiddenSecondaryActions } = body as {
      clientId?: string | number;
      slug?: string;
      selectedActions?: unknown;
      hiddenSecondaryActions?: unknown;
    };

    const hasSelected = Array.isArray(selectedActions);
    const hasHidden = Array.isArray(hiddenSecondaryActions);

    if (!clientId || !slug || (!hasSelected && !hasHidden)) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (!validateDashboardToken(token, slug)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payloadConfig = await config;
    const payload = await getPayload({ config: payloadConfig });
    const id = typeof clientId === "string" ? Number(clientId) : clientId;

    const data: Record<string, unknown> = {};

    if (hasHidden) {
      data.dashboardHiddenSecondaryConversionActions = cleanActionNames(
        hiddenSecondaryActions as unknown[],
      ).join("\n");
    }

    if (hasSelected) {
      const selected = cleanActionNames(selectedActions as unknown[]);
      // Read first so existing category labels/colours survive the rewrite.
      const current = await payload.findByID({
        collection: "clients",
        id,
        depth: 0,
        overrideAccess: true,
      });
      data.dashboardConversionActions = selected.join("\n");
      data.conversionActionCategories = syncCategories(
        selected,
        current?.conversionActionCategories,
      );
    }

    await payload.update({
      collection: "clients",
      id,
      data: data as never,
      overrideAccess: true,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to save conversion action defaults";
    console.error("[Dashboard ConversionActionDefaults POST]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
