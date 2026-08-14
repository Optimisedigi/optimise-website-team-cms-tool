import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { validateDashboardToken } from "../verify/route";
import {
  compareVariants,
  createAccumulator,
  summariseVariant,
  type VariantAccumulator,
} from "@/lib/landing-experiment-report";

export const dynamic = "force-dynamic";

/**
 * GET /api/dashboard/landing-experiments?slug=<client-slug>&days=30
 *
 * Landing A/B results and behaviour counts for one client.
 *
 * The client is resolved from the slug the dashboard token was issued for, and
 * every event query is filtered by that client's id, so a token for one client
 * cannot read another's landing data.
 */

/** Hard ceiling on rows scanned per request, so one busy client cannot stall the dashboard. */
const MAX_EVENTS_SCANNED = 20000;
const PAGE_SIZE = 1000;
const MAX_DAYS = 365;

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("slug") || "";
  if (!slug) return NextResponse.json({ error: "Missing slug" }, { status: 400 });

  const token = req.cookies.get("dashboard_token")?.value;
  if (!validateDashboardToken(token, slug)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const requestedDays = Number(req.nextUrl.searchParams.get("days") || "30");
  const days = Number.isFinite(requestedDays)
    ? Math.min(Math.max(Math.trunc(requestedDays), 1), MAX_DAYS)
    : 30;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const payload = await getPayload({ config });

  const clients = await payload.find({
    collection: "clients",
    where: { slug: { equals: slug } },
    depth: 0,
    limit: 1,
    overrideAccess: true,
  });
  const client = clients.docs[0];
  if (!client) return NextResponse.json({ error: "Unknown client" }, { status: 404 });

  const experiments = await payload.find({
    collection: "landing-experiments",
    where: { client: { equals: client.id } },
    depth: 0,
    limit: 50,
    overrideAccess: true,
    sort: "-createdAt",
  });

  const running = experiments.docs.find((doc) => doc.status === "running") ?? experiments.docs[0];
  const primaryGoal = (running?.primaryGoal as string) ?? "booking_complete";

  // Control is the first configured variant; comparisons are made against it.
  const configuredVariants = Array.isArray(running?.variants)
    ? running.variants
        .map((row: { variantId?: string | null }) => (typeof row?.variantId === "string" ? row.variantId : ""))
        .filter(Boolean)
    : [];
  const controlVariantId = configuredVariants[0] ?? "a";

  const accumulators = new Map<string, VariantAccumulator>();
  for (const variantId of configuredVariants) accumulators.set(variantId, createAccumulator(variantId));

  const totals: Record<string, number> = {};
  let scanned = 0;
  let page = 1;
  let truncated = false;

  // Paginate rather than pulling the whole table: bounded memory, bounded time.
  for (;;) {
    const batch = await payload.find({
      collection: "landing-events",
      where: {
        client: { equals: client.id },
        occurredAt: { greater_than_equal: since },
        ...(running?.experimentId ? { experimentId: { equals: running.experimentId } } : {}),
      },
      depth: 0,
      limit: PAGE_SIZE,
      page,
      sort: "occurredAt",
      overrideAccess: true,
    });

    for (const event of batch.docs) {
      const eventType = String(event.eventType ?? "");
      const sessionId = String(event.sessionId ?? "");
      const variantId = String(event.variantId ?? "");
      if (!eventType || !sessionId) continue;

      totals[eventType] = (totals[eventType] ?? 0) + 1;

      // Events recorded before an experiment existed carry no variant; they
      // still count toward behaviour totals but cannot join the comparison.
      if (!variantId) continue;
      let accumulator = accumulators.get(variantId);
      if (!accumulator) {
        accumulator = createAccumulator(variantId);
        accumulators.set(variantId, accumulator);
      }

      accumulator.sessions.add(sessionId);
      accumulator.eventCounts[eventType] = (accumulator.eventCounts[eventType] ?? 0) + 1;
      // A session converts at most once, however many goal events it fires.
      if (eventType === primaryGoal) accumulator.convertedSessions.add(sessionId);
    }

    scanned += batch.docs.length;
    if (!batch.hasNextPage) break;
    if (scanned >= MAX_EVENTS_SCANNED) {
      truncated = true;
      break;
    }
    page += 1;
  }

  const variants = [...accumulators.values()]
    .map(summariseVariant)
    .sort((a, b) => a.variantId.localeCompare(b.variantId));

  return NextResponse.json(
    {
      experiment: running
        ? {
            id: running.experimentId,
            name: running.name,
            status: running.status,
            allocationVersion: running.allocationVersion,
            primaryGoal,
            startedAt: running.startedAt ?? null,
          }
        : null,
      rangeDays: days,
      controlVariantId,
      variants,
      comparisons: compareVariants(variants, controlVariantId),
      behaviourTotals: totals,
      eventsScanned: scanned,
      // The UI must say so when a range was cut short, rather than presenting a
      // partial scan as the full picture.
      truncated,
    },
    { headers: { "cache-control": "no-store" } }
  );
}
