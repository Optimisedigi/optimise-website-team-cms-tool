import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { runInspectionWork } from "@/lib/gsc-indexing";

export const maxDuration = 60;

/**
 * POST: Inspect the next batch of URLs for an audit.
 * Called by the frontend polling loop to drive inspection forward
 * in small batches that fit within Vercel's timeout.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const payloadConfig = await config;
    const payload = await getPayload({ config: payloadConfig });

    const { user } = await payload.auth({ headers: req.headers });
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const audit = await payload.findByID({
      collection: "gsc-indexing-audits",
      id,
      overrideAccess: true,
    });

    if (audit.status !== "inspecting") {
      return NextResponse.json({
        ok: true,
        status: audit.status,
        inspectedCount: audit.inspectedCount,
        totalUrls: audit.totalUrls,
        message: `Audit is ${audit.status}, not inspecting`,
      });
    }

    const discoveredUrls: string[] = (audit.discoveredUrls as string[]) || [];
    const existingResults = (audit.inspectionResults as any[]) || [];
    const inspectedUrls = new Set(existingResults.map((r: any) => r.url));
    const remaining = discoveredUrls.filter((u) => !inspectedUrls.has(u));

    if (remaining.length === 0) {
      return NextResponse.json({
        ok: true,
        status: "completed",
        inspectedCount: audit.inspectedCount,
        totalUrls: audit.totalUrls,
        message: "All URLs already inspected",
      });
    }

    const clientId = typeof audit.client === "object" ? (audit.client as any).id : audit.client;
    const client = await payload.findByID({
      collection: "clients",
      id: clientId,
      overrideAccess: true,
    });

    // Run inspection for the next batch (runInspectionWork caps at 100 URLs,
    // processes in sub-batches of 25, and saves progress after each)
    await runInspectionWork(payload, id, client, remaining);

    // Fetch updated audit to return current state
    const updated = await payload.findByID({
      collection: "gsc-indexing-audits",
      id,
      overrideAccess: true,
    });

    return NextResponse.json({
      ok: true,
      status: updated.status,
      inspectedCount: updated.inspectedCount,
      totalUrls: updated.totalUrls,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Inspection batch failed";
    console.error(`[gsc-indexing-audit] Inspect ${id} failed:`, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
