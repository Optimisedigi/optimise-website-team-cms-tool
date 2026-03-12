import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { startIndexingAudit, runDiscovery, runInspectionWork } from "@/lib/gsc-indexing";

export const maxDuration = 120;

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
      const discoveryResult = await runDiscovery(payload, auditId, client);

      if (discoveryResult && discoveryResult.urls.length > 0) {
        step = "run-inspection";
        // Run inspection synchronously — after() is unreliable on Vercel
        await runInspectionWork(
          payload,
          auditId,
          client,
          discoveryResult.urls,
          discoveryResult.accessToken,
        );
      }
    }

    return NextResponse.json({ ok: true, auditId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to start audit";
    const stack = err instanceof Error ? err.stack : undefined;
    console.error(`[gsc-indexing-audit] Failed at step="${step}":`, message, stack);
    return NextResponse.json({ error: message, step }, { status: 500 });
  }
}
