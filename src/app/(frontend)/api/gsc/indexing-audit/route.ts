import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { startIndexingAudit, runAuditWork } from "@/lib/gsc-indexing";

export async function POST(req: NextRequest) {
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

  try {
    const payloadConfig = await config;
    const payload = await getPayload({ config: payloadConfig });

    const { user } = await payload.auth({ headers: req.headers });
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { auditId, client } = await startIndexingAudit(payload, clientId);

    // If client is returned, this is a new audit that needs background work.
    // (client is null when returning an existing active audit)
    if (client) {
      after(async () => {
        try {
          await runAuditWork(payload, auditId, client);
        } catch (err) {
          console.error(`[gsc-indexing] Unexpected audit error ${auditId}:`, err);
        }
      });
    }

    return NextResponse.json({ ok: true, auditId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to start audit";
    console.error("[gsc-indexing-audit]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
