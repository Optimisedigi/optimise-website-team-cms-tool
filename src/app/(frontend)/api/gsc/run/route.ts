import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { runGscMonitor } from "@/lib/gsc-monitor";

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

    // Verify the user is authenticated
    const { user } = await payload.auth({ headers: req.headers });
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const results = await runGscMonitor(clientId);

    return NextResponse.json({ ok: true, results });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sync failed";
    console.error("[gsc-run]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
