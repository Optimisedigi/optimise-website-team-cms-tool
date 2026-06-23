import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import {
  accountStructureConversionFilterKey,
  assertIsoDate,
  fetchLiveAccountStructure,
  getLatestCachedAccountStructure,
  normalizeCustomerId,
  upsertAccountStructureSnapshot,
  withCacheMeta,
  withConversionFilterKey,
} from "@/lib/google-ads-account-structure-cache";

/**
 * GET /api/partners/[clientSlug]/account-structure?from=YYYY-MM-DD&to=YYYY-MM-DD&refresh=live
 *
 * Cached by default. `refresh=live` calls Growth Tools and writes through to the
 * dedicated full-response account-structure cache.
 */

type ConversionActionCategoryRow = {
  label?: unknown;
  color?: unknown;
  actions?: unknown;
};

function normalizeActionList(value: unknown): string {
  return String(value || "")
    .split(/[\r\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .join(",");
}

function serializeConversionActionCategories(client: Record<string, unknown>): string {
  const arr = client.conversionActionCategories;
  if (!Array.isArray(arr) || arr.length === 0) return "";
  return JSON.stringify(
    arr
      .map((row: ConversionActionCategoryRow) => ({
        label: String(row.label || "").trim(),
        color: String(row.color || "sky"),
        actions: normalizeActionList(row.actions),
      }))
      .map((row) => ({ ...row, actions: row.actions ? row.actions.split(",") : [] }))
      .filter((row) => row.label && row.actions.length > 0),
  );
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ clientSlug: string }> },
) {
  const { clientSlug } = await params;

  let from: string | null;
  let to: string | null;
  try {
    from = assertIsoDate(req.nextUrl.searchParams.get("from"), "from");
    to = assertIsoDate(req.nextUrl.searchParams.get("to"), "to");
  } catch (err) {
    return NextResponse.json(
      { message: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }
  const refreshLive = req.nextUrl.searchParams.get("refresh") === "live";

  const payload = await getPayload({ config: await config });
  const found = await payload.find({
    collection: "clients",
    where: { slug: { equals: clientSlug } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });
  const client = found.docs[0] as
    | {
        id: string | number;
        googleAdsCustomerId?: string | null;
        dashboardConversionActions?: string | null;
        conversionActionCategories?: unknown;
        phoneCallConversionActions?: string | null;
        formSubmitConversionActions?: string | null;
      }
    | undefined;
  const digits = typeof client?.googleAdsCustomerId === "string"
    ? normalizeCustomerId(client.googleAdsCustomerId)
    : "";

  if (!client) {
    return NextResponse.json(
      { message: `No client found for slug "${clientSlug}"` },
      { status: 404 },
    );
  }
  if (digits.length !== 10) {
    return NextResponse.json(
      { message: `Client "${clientSlug}" has no Google Ads Customer ID configured` },
      { status: 404 },
    );
  }

  const conversionFilters = {
    conversionActions: normalizeActionList(
      req.nextUrl.searchParams.get("conversionActions") ?? client.dashboardConversionActions,
    ),
    phoneCallActions: req.nextUrl.searchParams.get("phoneCallActions") ?? client.phoneCallConversionActions ?? "",
    formSubmitActions: req.nextUrl.searchParams.get("formSubmitActions") ?? client.formSubmitConversionActions ?? "",
    conversionActionCategories:
      req.nextUrl.searchParams.get("conversionActionCategories") ??
      serializeConversionActionCategories(client as Record<string, unknown>),
  };
  const conversionFilterKey = accountStructureConversionFilterKey(conversionFilters);

  try {
    if (!refreshLive) {
      const cached = await getLatestCachedAccountStructure(payload, client.id, {
        conversionFilterKey,
        dateRangeStart: from,
        dateRangeEnd: to,
      });
      if (cached) return NextResponse.json(cached.data);
    }

    const livePayload = await fetchLiveAccountStructure({
      clientSlug,
      customerId: digits,
      from,
      to,
      endpoint: "partner",
      conversionFilters,
    });
    const cachePayload = withConversionFilterKey(livePayload, conversionFilterKey);
    const doc = await upsertAccountStructureSnapshot(payload, {
      clientId: client.id,
      clientSlug,
      customerId: digits,
      dateRangeStart: from ?? undefined,
      dateRangeEnd: to ?? undefined,
      source: "manual_refresh",
      payload: cachePayload,
    });

    return NextResponse.json(withCacheMeta(cachePayload, {
      source: refreshLive ? "manual_refresh" : "cold_cache_live_fill",
      capturedAt: doc.capturedAt ?? new Date().toISOString(),
      ...(from ? { dateRangeStart: from } : {}),
      ...(to ? { dateRangeEnd: to } : {}),
      conversionFilterKey,
      stale: false,
    }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[partner-account] cache/live error for ${clientSlug}:`, msg);
    return NextResponse.json(
      { message: `Failed to load account structure: ${msg}` },
      { status: 502 },
    );
  }
}
