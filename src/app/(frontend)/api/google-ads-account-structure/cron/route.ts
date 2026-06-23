import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getPayload } from "payload";
import config from "@/payload.config";
import {
  accountStructureConversionFilterKey,
  fetchLiveAccountStructure,
  getYesterdayWindow,
  normalizeCustomerId,
  upsertAccountStructureSnapshot,
  withConversionFilterKey,
} from "@/lib/google-ads-account-structure-cache";

export const maxDuration = 300;

type ClientDoc = {
  id: string | number;
  slug?: string | null;
  googleAdsCustomerId?: string | null;
  dashboardConversionActions?: string | null;
  conversionActionCategories?: unknown;
  phoneCallConversionActions?: string | null;
  formSubmitConversionActions?: string | null;
};

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

async function runPool<T, R>(items: T[], concurrency: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await worker(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

function isAuthorized(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return false;
  const expected = Buffer.from(cronSecret);
  const provided = Buffer.from(token);
  return expected.length === provided.length && crypto.timingSafeEqual(expected, provided);
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await getPayload({ config });
  const { from, to } = getYesterdayWindow();
  const startedAt = new Date().toISOString();

  const clients = await payload.find({
    collection: "clients",
    where: {
      and: [
        { isActive: { equals: true } },
        { googleAdsCustomerId: { exists: true } },
      ],
    },
    limit: 500,
    depth: 0,
    overrideAccess: true,
    select: {
      id: true,
      slug: true,
      googleAdsCustomerId: true,
      dashboardConversionActions: true,
      conversionActionCategories: true,
      phoneCallConversionActions: true,
      formSubmitConversionActions: true,
    },
  });

  const docs = (clients.docs as ClientDoc[]).filter((client) => {
    const customerId = typeof client.googleAdsCustomerId === "string"
      ? normalizeCustomerId(client.googleAdsCustomerId)
      : "";
    return Boolean(client.slug && customerId.length === 10);
  });

  const perClient = await runPool(docs, 2, async (client) => {
    const clientSlug = String(client.slug);
    const customerId = normalizeCustomerId(String(client.googleAdsCustomerId));
    const t0 = Date.now();
    try {
      const conversionFilters = {
        conversionActions: normalizeActionList(client.dashboardConversionActions),
        phoneCallActions: client.phoneCallConversionActions || "",
        formSubmitActions: client.formSubmitConversionActions || "",
        conversionActionCategories: serializeConversionActionCategories(client as Record<string, unknown>),
      };
      const conversionFilterKey = accountStructureConversionFilterKey(conversionFilters);
      const livePayload = await fetchLiveAccountStructure({
        clientSlug,
        customerId,
        from,
        to,
        endpoint: "client",
        conversionFilters,
      });
      const cachePayload = withConversionFilterKey(livePayload, conversionFilterKey);
      await upsertAccountStructureSnapshot(payload, {
        clientId: client.id,
        clientSlug,
        customerId,
        capturedAt: new Date(),
        dateRangeStart: from,
        dateRangeEnd: to,
        source: "cron",
        payload: cachePayload,
      });
      return { clientId: client.id, clientSlug, ok: true, durationMs: Date.now() - t0 };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      payload.logger?.error?.(`[google-ads-account-structure-cron] ${clientSlug}: ${message}`);
      return { clientId: client.id, clientSlug, ok: false, error: message, durationMs: Date.now() - t0 };
    }
  });

  return NextResponse.json({
    ok: true,
    startedAt,
    finishedAt: new Date().toISOString(),
    dateRangeStart: from,
    dateRangeEnd: to,
    clientsProcessed: perClient.length,
    clientsErrored: perClient.filter((result) => !result.ok).length,
    perClient,
  });
}
