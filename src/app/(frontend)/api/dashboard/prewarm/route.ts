import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getPayload, type Payload } from "payload";
import config from "@/payload.config";
import { warmAvoidedSpendForClient } from "@/lib/avoided-spend-warmer";
import { warmMonthlyWasteRelevancyForClient } from "@/lib/monthly-waste-relevancy-warmer";

export const maxDuration = 300;

const BATCH_SIZE = 4;
const CLIENT_LIMIT = 100;

interface ClientResult {
  clientId: number;
  clientSlug: string;
  avoidedSpend: { ok: boolean; misses: number; durationMs: number; error?: string };
  wasteRelevancy: { ok: boolean; misses: number; durationMs: number; error?: string };
  totalDurationMs: number;
}

/**
 * GET /api/dashboard/prewarm
 *
 * Nightly cron that warms the two heavy dashboard caches:
 *   - negative_keyword_avoided_spend_cache
 *   - negative_keyword_monthly_waste_relevancy_cache
 *
 * Auth: Authorization: Bearer ${CRON_SECRET}.
 * Schedule: 05:00 UTC (vercel.json).
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }

  const token = authHeader?.replace("Bearer ", "");
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const expected = Buffer.from(cronSecret);
  const provided = Buffer.from(token);
  if (expected.length !== provided.length || !crypto.timingSafeEqual(expected, provided)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });

  const summary = await runPrewarm(payload);
  return NextResponse.json(summary);
}

/**
 * Shared enumerator + fan-out. Used by both the cron-authed route and the
 * admin-authed manual-trigger route in /run.
 */
export async function runPrewarm(payload: Payload): Promise<{
  ok: boolean;
  clientsProcessed: number;
  durationMs: number;
  results: ClientResult[];
  errors: number;
}> {
  const startedAt = Date.now();

  // Find eligible clients: active + has a Google Ads customer ID.
  const clientsResult = await payload.find({
    collection: "clients",
    where: {
      and: [
        { isActive: { equals: true } },
        { googleAdsCustomerId: { not_equals: null } },
        { googleAdsCustomerId: { not_equals: "" } },
      ],
    },
    limit: CLIENT_LIMIT,
    depth: 0,
    overrideAccess: true,
  });

  const clients = clientsResult.docs as any[];
  const results: ClientResult[] = [];

  // Process in parallel batches. Each client runs both warmers sequentially
  // so the same Growth Tools auth context applies and per-client logging
  // stays clean.
  for (let i = 0; i < clients.length; i += BATCH_SIZE) {
    const batch = clients.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(batch.map((c) => warmOneClient(payload, c)));
    results.push(...batchResults);
  }

  const errors = results.reduce(
    (n, r) => n + (r.avoidedSpend.error ? 1 : 0) + (r.wasteRelevancy.error ? 1 : 0),
    0,
  );

  const durationMs = Date.now() - startedAt;
  payload.logger?.info?.(
    `[prewarm] processed=${results.length} errors=${errors} durationMs=${durationMs}`,
  );

  return {
    ok: true,
    clientsProcessed: results.length,
    durationMs,
    results,
    errors,
  };
}

async function warmOneClient(payload: Payload, client: any): Promise<ClientResult> {
  const startedAt = Date.now();
  const clientId = Number(client.id);
  const clientSlug = String(client.slug || `id-${clientId}`);
  const customerId = String(client.googleAdsCustomerId || "");

  let avoidedSpend: ClientResult["avoidedSpend"] = {
    ok: false,
    misses: 0,
    durationMs: 0,
    error: "not run",
  };
  let wasteRelevancy: ClientResult["wasteRelevancy"] = {
    ok: false,
    misses: 0,
    durationMs: 0,
    error: "not run",
  };

  try {
    const r = await warmAvoidedSpendForClient(payload, clientId, customerId);
    avoidedSpend = {
      ok: !r.error,
      misses: r.misses,
      durationMs: r.durationMs,
      error: r.error,
    };
  } catch (err) {
    avoidedSpend = { ok: false, misses: 0, durationMs: 0, error: String(err) };
  }

  try {
    const r = await warmMonthlyWasteRelevancyForClient(
      payload,
      clientId,
      customerId,
      clientSlug,
    );
    wasteRelevancy = {
      ok: !r.error,
      misses: r.misses,
      durationMs: r.durationMs,
      error: r.error,
    };
  } catch (err) {
    wasteRelevancy = { ok: false, misses: 0, durationMs: 0, error: String(err) };
  }

  const totalDurationMs = Date.now() - startedAt;
  payload.logger?.info?.(
    `[prewarm] client=${clientSlug} ` +
      `avoided-spend=${avoidedSpend.ok ? "ok" : "err"}(misses=${avoidedSpend.misses},${avoidedSpend.durationMs}ms${avoidedSpend.error ? `,err=${avoidedSpend.error}` : ""}) ` +
      `waste-relevancy=${wasteRelevancy.ok ? "ok" : "err"}(misses=${wasteRelevancy.misses},${wasteRelevancy.durationMs}ms${wasteRelevancy.error ? `,err=${wasteRelevancy.error}` : ""}) ` +
      `total=${totalDurationMs}ms`,
  );

  return { clientId, clientSlug, avoidedSpend, wasteRelevancy, totalDurationMs };
}
