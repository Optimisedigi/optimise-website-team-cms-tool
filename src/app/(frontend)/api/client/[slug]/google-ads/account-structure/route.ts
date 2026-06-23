import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import configPromise from "@/payload.config";
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
 * GET /api/client/[slug]/google-ads/account-structure?from=YYYY-MM-DD&to=YYYY-MM-DD&refresh=live
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
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  let fromRaw: string | null;
  let toRaw: string | null;
  try {
    fromRaw = assertIsoDate(req.nextUrl.searchParams.get("from"), "from");
    toRaw = assertIsoDate(req.nextUrl.searchParams.get("to"), "to");
  } catch (err) {
    return NextResponse.json(
      { message: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }
  const refreshLive = req.nextUrl.searchParams.get("refresh") === "live";

  const payload = await getPayload({ config: configPromise });
  const result = await payload.find({
    collection: "clients",
    where: {
      slug: { equals: slug },
      isActive: { equals: true },
    },
    limit: 1,
    overrideAccess: true,
    select: {
      id: true,
      name: true,
      googleAdsCustomerId: true,
      dashboardConversionActions: true,
      conversionActionCategories: true,
      phoneCallConversionActions: true,
      formSubmitConversionActions: true,
    },
  });

  const client = result.docs[0] as
    | {
        id: string | number;
        name?: string;
        googleAdsCustomerId?: string;
        dashboardConversionActions?: string | null;
        conversionActionCategories?: unknown;
        phoneCallConversionActions?: string | null;
        formSubmitConversionActions?: string | null;
      }
    | undefined;
  if (!client) {
    return NextResponse.json(
      { message: `No active client found for slug "${slug}"` },
      { status: 404 },
    );
  }
  if (!client.googleAdsCustomerId) {
    return NextResponse.json(
      { message: `Client "${slug}" has no Google Ads Customer ID configured` },
      { status: 404 },
    );
  }

  const customerId = normalizeCustomerId(client.googleAdsCustomerId);
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
        dateRangeStart: fromRaw,
        dateRangeEnd: toRaw,
      });
      if (cached) return NextResponse.json(cached.data);
    }

    const livePayload = await fetchLiveAccountStructure({
      clientSlug: slug,
      customerId,
      from: fromRaw,
      to: toRaw,
      endpoint: "client",
      conversionFilters,
    });
    const cachePayload = withConversionFilterKey(livePayload, conversionFilterKey);
    const doc = await upsertAccountStructureSnapshot(payload, {
      clientId: client.id,
      clientSlug: slug,
      customerId,
      dateRangeStart: fromRaw ?? undefined,
      dateRangeEnd: toRaw ?? undefined,
      source: "manual_refresh",
      payload: cachePayload,
    });

    return NextResponse.json(withCacheMeta(cachePayload, {
      source: refreshLive ? "manual_refresh" : "cold_cache_live_fill",
      capturedAt: doc.capturedAt ?? new Date().toISOString(),
      ...(fromRaw ? { dateRangeStart: fromRaw } : {}),
      ...(toRaw ? { dateRangeEnd: toRaw } : {}),
      conversionFilterKey,
      stale: false,
    }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(
      `[client-account-structure] cache/live error for ${slug} (${customerId}):`,
      msg,
    );
    return NextResponse.json(
      { message: `Failed to load account structure: ${msg}` },
      { status: 502 },
    );
  }
}
