import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { startIndexingAudit, runDiscovery } from "@/lib/gsc-indexing";

export const maxDuration = 120;

/**
 * GET: List indexing audits for a client.
 * Returns summary data for each audit (no heavy fields like discoveredUrls/inspectionResults).
 */
export async function GET(req: NextRequest) {
  try {
    const payload = await getPayload({ config: await config });
    const { user } = await payload.auth({ headers: req.headers });
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const clientId = req.nextUrl.searchParams.get("clientId");
    if (!clientId) {
      return NextResponse.json({ error: "clientId is required" }, { status: 400 });
    }

    const audits = await payload.find({
      collection: "gsc-indexing-audits",
      where: {
        client: { equals: Number(clientId) },
        status: { in: ["completed", "failed"] },
      },
      sort: "-createdAt",
      limit: 20,
      overrideAccess: true,
    });

    // Return lightweight summaries (skip large JSON fields)
    const items = audits.docs.map((a) => ({
      id: a.id,
      status: a.status,
      totalUrls: a.totalUrls,
      inspectedCount: a.inspectedCount,
      summaryStats: a.summaryStats,
      completedAt: a.completedAt,
      createdAt: a.createdAt,
      error: a.error,
    }));

    return NextResponse.json({ audits: items });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to list audits";
    console.error("[gsc-indexing-audit]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST: Start a new indexing audit.
 * Only runs discovery (find URLs). Inspection is driven by the frontend
 * via the /api/gsc/indexing-audit/[id]/inspect endpoint in small batches.
 */
export async function POST(req: NextRequest) {
  let step = "parse-body";
  try {
    let body: { clientId?: string };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const { clientId } = body;
    if (!clientId) {
      return NextResponse.json(
        { error: "clientId is required" },
        { status: 400 }
      );
    }

    step = "get-payload";
    const payloadConfig = await config;
    const payload = await getPayload({ config: payloadConfig });

    step = "auth";
    const { user } = await payload.auth({ headers: req.headers });
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    step = "start-indexing-audit";
    const { auditId, client } = await startIndexingAudit(payload, clientId);

    // If client is returned, this is a new audit that needs work.
    // (client is null when returning an existing active audit)
    if (client) {
      step = "run-discovery";
      await runDiscovery(payload, auditId, client);
      // Discovery only — inspection is driven by the frontend polling
      // via /api/gsc/indexing-audit/[id]/inspect in small batches
      // that fit within Vercel's 60s function limit.
    }

    return NextResponse.json({ ok: true, auditId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to start audit";
    const stack = err instanceof Error ? err.stack : undefined;
    console.error(`[gsc-indexing-audit] Failed at step="${step}":`, message, stack);
    return NextResponse.json({ error: message, step }, { status: 500 });
  }
}
